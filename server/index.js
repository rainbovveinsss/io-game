import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { Server } from 'socket.io';
import { Game } from './game.js';
import { TICK_MS } from './constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
const io = new Server(server);
const game = new Game();

// socket.id -> player id
const socketPlayer = new Map();

io.on('connection', (socket) => {
  socket.on('join', (name) => {
    const p = game.addHuman(typeof name === 'string' ? name : 'Chameleon');
    socketPlayer.set(socket.id, p.id);
    socket.emit('joined', { id: p.id });
  });

  socket.on('input', (input) => {
    const pid = socketPlayer.get(socket.id);
    if (pid && input) game.setInput(pid, input);
  });

  socket.on('respawn', (name) => {
    const pid = socketPlayer.get(socket.id);
    if (pid) game.respawn(pid, typeof name === 'string' ? name : undefined);
  });

  socket.on('disconnect', () => {
    const pid = socketPlayer.get(socket.id);
    if (pid) game.removePlayer(pid);
    socketPlayer.delete(socket.id);
  });
});

// Fixed-step simulation loop.
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.update(dt);
}, TICK_MS);

// Broadcast tailored snapshots a little slower than we simulate.
setInterval(() => {
  for (const [sid, socket] of io.sockets.sockets) {
    const pid = socketPlayer.get(sid);
    if (pid) socket.emit('state', game.snapshotFor(pid));
  }
}, 1000 / 22);

server.listen(PORT, () => {
  console.log(`🦎 Chameleon.io running at http://localhost:${PORT}`);
});
