const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static client files from /public
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// In-memory waiting queue and partner map
const waiting = [];
const partners = new Map();

io.on('connection', socket => {
  console.log('New client connected:', socket.id);

  // A client requests to find a partner
  socket.on('join', () => {
    if (waiting.length > 0) {
      const other = waiting.shift();
      partners.set(socket.id, other.id);
      partners.set(other.id, socket.id);
      socket.emit('match', { id: other.id, initiator: false });
      other.emit('match', { id: socket.id, initiator: true });
    } else {
      waiting.push(socket);
    }
  });

  // Relay signaling messages between paired clients
  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', { from: socket.id, data });
  });

  // Leaving the current chat (e.g., skip/next)
  socket.on('leave', () => {
    const partnerId = partners.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('partner-left');
      partners.delete(partnerId);
      partners.delete(socket.id);
    } else {
      const idx = waiting.findIndex(s => s.id === socket.id);
      if (idx !== -1) waiting.splice(idx, 1);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    const partnerId = partners.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('partner-left');
      partners.delete(partnerId);
      partners.delete(socket.id);
    } else {
      const idx = waiting.findIndex(s => s.id === socket.id);
      if (idx !== -1) waiting.splice(idx, 1);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
