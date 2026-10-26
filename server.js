const WebSocket = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WebSocket Relay Server is running.\n');
});

const wss = new WebSocket.Server({ server });

const devices = new Map(); // device_id -> WebSocket
const controllers = new Map(); // device_id -> Set of controller WebSockets

wss.on('connection', (ws) => {
  let registeredId = null;
  let role = null;

  ws.on('message', (message, isBinary) => {
    if (isBinary) {
      if (role === 'device' && registeredId) {
        const clientSet = controllers.get(registeredId);
        if (clientSet) {
          clientSet.forEach(client => {
            if (client.readyState === WebSocket.OPEN) client.send(message);
          });
        }
      } else if (role === 'controller' && registeredId) {
        const deviceWs = devices.get(registeredId);
        if (deviceWs && deviceWs.readyState === WebSocket.OPEN) deviceWs.send(message);
      }
      return;
    }

    try {
      const data = JSON.parse(message);
      if (data.type === 'register') {
        role = data.role; // 'device' atau 'controller'
        registeredId = data.device_id;
        
        if (role === 'device') {
          devices.set(registeredId, ws);
          console.log(`Device registered: ${registeredId}`);
        } else if (role === 'controller') {
          if (!controllers.has(registeredId)) controllers.set(registeredId, new Set());
          controllers.get(registeredId).add(ws);
          console.log(`Controller connected for device: ${registeredId}`);
        }
      } else {
        if (role === 'device') {
          const clientSet = controllers.get(registeredId);
          if (clientSet) clientSet.forEach(client => client.send(message));
        } else if (role === 'controller') {
          const deviceWs = devices.get(registeredId);
          if (deviceWs && deviceWs.readyState === WebSocket.OPEN) deviceWs.send(message);
        }
      }
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  });

  ws.on('close', () => {
    if (role === 'device' && registeredId) {
      devices.delete(registeredId);
      console.log(`Device disconnected: ${registeredId}`);
    } else if (role === 'controller' && registeredId) {
      const clientSet = controllers.get(registeredId);
      if (clientSet) clientSet.delete(ws);
      console.log(`Controller disconnected for device: ${registeredId}`);
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Relay server listening on port ${PORT}`);
});