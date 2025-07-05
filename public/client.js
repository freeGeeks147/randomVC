const socket = io();
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startBtn = document.getElementById('startBtn');
const status = document.getElementById('status');

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

let localStream;
let pc;
let partnerId;
let partnerIsMobile = false;

async function initMedia() {
  const constraints = {
    audio: true,
    video: isMobile
      ? { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } }
      : true
  };
  try {
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    localVideo.srcObject = localStream;
  } catch (err) {
    console.error('Media error:', err);
    status.textContent = 'Could not access camera/mic.';
  }
}

initMedia();

startBtn.onclick = () => {
  socket.emit('leave');
  cleanup();
  socket.emit('join', { mobile: isMobile });
  status.textContent = 'Looking for a partner...';
};

function startConnection(initiator, partnerMobile) {
  const bothMobile = isMobile && partnerMobile;
  pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478?transport=udp' },
      // Public TURN for demo use only; replace with your own in production
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp'
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ],
    iceTransportPolicy: 'all'
  });

  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    if (bothMobile) {
      videoTrack
        .applyConstraints({
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 15, max: 20 }
        })
        .catch(e => console.error('Failed to reduce resolution', e));
    } else if (partnerMobile) {
      videoTrack
        .applyConstraints({ width: { ideal: 320 }, height: { ideal: 240 } })
        .catch(e => console.error('Failed to reduce resolution', e));
    } else if (!isMobile) {
      videoTrack
        .applyConstraints({})
        .catch(() => {});
    }
  }
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  pc.getSenders().forEach(sender => {
    if (sender.track && sender.track.kind === 'video') {
      const params = sender.getParameters();
      if (!params.encodings) params.encodings = [{}];
      params.encodings[0].maxBitrate =
        bothMobile ? 250_000 : partnerMobile ? 300_000 : 800_000;
      sender.setParameters(params).catch(e => console.error('Failed to set bitrate', e));
    }
  });

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) socket.emit('signal', { to: partnerId, data: { candidate } });
  };
  pc.ontrack = ({ streams: [stream] }) => {
    remoteVideo.srcObject = stream;
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') status.textContent = 'Connected!';
  };
  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === 'failed') pc.restartIce();
  };

  if (initiator) {
    pc.createOffer().then(o => pc.setLocalDescription(o)).then(() => {
      socket.emit('signal', { to: partnerId, data: { description: pc.localDescription } });
    });
  }
}

socket.on('match', ({ id, initiator, partnerMobile }) => {
  partnerId = id;
  partnerIsMobile = Boolean(partnerMobile);
  status.textContent = 'Partner found! Connecting...';
  startConnection(initiator, partnerIsMobile);
});

socket.on('signal', async ({ from, data }) => {
  if (from !== partnerId) return;
  if (data.description) {
    await pc.setRemoteDescription(data.description);
    if (data.description.type === 'offer') {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', { to: partnerId, data: { description: pc.localDescription } });
    }
  } else if (data.candidate) {
    try { await pc.addIceCandidate(data.candidate); } catch (e) { console.error(e); }
  }
});

socket.on('partner-left', () => {
  status.textContent = 'Partner disconnected.';
  cleanup();
});

function cleanup() {
  if (pc) {
    pc.close();
    pc = null;
  }
  remoteVideo.srcObject = null;
  partnerId = null;
}
