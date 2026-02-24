const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// In-memory store
const messages = [];
const MAX_MESSAGES = 200;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// REST: get recent messages
app.get('/api/messages', (req, res) => {
  res.json(messages.slice(-50).reverse());
});

// Broadcast to all connected WebSocket clients
function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function broadcastOnlineCount() {
  const count = wss.clients.size;
  broadcast({ type: 'online_count', count });
}

wss.on('connection', (ws) => {
  broadcastOnlineCount();

  ws.on('close', () => broadcastOnlineCount());

  // Send recent messages to newly connected client
  ws.send(JSON.stringify({ type: 'history', messages: messages.slice(-50).reverse() }));

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    if (data.type === 'post') {
      const username = (data.username || 'Anonymous').trim().slice(0, 30) || 'Anonymous';
      const text = (data.text || '').trim().slice(0, 280);
      if (!text) return;

      const msg = {
        id: uuidv4(),
        username,
        text,
        likes: 0,
        likedBy: [],
        timestamp: new Date().toISOString(),
      };

      messages.push(msg);
      if (messages.length > MAX_MESSAGES) messages.shift();

      broadcast({ type: 'new_message', message: msg });
    }

    if (data.type === 'like') {
      const msg = messages.find((m) => m.id === data.id);
      if (!msg) return;

      const clientId = data.clientId;
      if (!clientId) return;

      const idx = msg.likedBy.indexOf(clientId);
      if (idx === -1) {
        msg.likedBy.push(clientId);
        msg.likes++;
      } else {
        msg.likedBy.splice(idx, 1);
        msg.likes--;
      }

      broadcast({ type: 'update_likes', id: msg.id, likes: msg.likes, likedBy: msg.likedBy });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Twitter Broadcast App running at http://localhost:${PORT}`);
});
