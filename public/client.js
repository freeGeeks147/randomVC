const socket = io();
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startBtn = document.getElementById('startBtn');
const status = document.getElementById('status');

let localStream;
let pc;
let partnerId;

async function initMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
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
  socket.emit('join');
  status.textContent = 'Looking for a partner...';
};

function startConnection(initiator) {
  pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) socket.emit('signal', { to: partnerId, data: { candidate } });
  };
  pc.ontrack = ({ streams: [stream] }) => {
    remoteVideo.srcObject = stream;
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') status.textContent = 'Connected!';
  };

  if (initiator) {
    pc.createOffer().then(o => pc.setLocalDescription(o)).then(() => {
      socket.emit('signal', { to: partnerId, data: { description: pc.localDescription } });
    });
  }
}

socket.on('match', ({ id, initiator }) => {
  partnerId = id;
  status.textContent = 'Partner found! Connecting...';
  startConnection(initiator);
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
