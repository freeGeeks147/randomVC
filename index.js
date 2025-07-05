const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => res.send('🚀 Video-chat server is up!'));

server.listen(process.env.PORT || 3000, () => {
  console.log('Listening on port', process.env.PORT || 3000);
});