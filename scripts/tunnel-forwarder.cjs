const net = require('net');

const PORT = 5173;
const TARGET_PORT = 3000;
const HOST = '127.0.0.1';

const server = net.createServer((socket) => {
    const client = net.connect(TARGET_PORT, HOST);
    socket.pipe(client);
    client.pipe(socket);

    socket.on('error', () => client.destroy());
    client.on('error', () => socket.destroy());
});

server.on('error', (err) => {
    console.error('[TunnelForwarder] Server error:', err.message);
});

server.listen(PORT, HOST, () => {
    console.log(`[TunnelForwarder] Listening on ${HOST}:${PORT} -> forwarding to ${HOST}:${TARGET_PORT}`);
});
