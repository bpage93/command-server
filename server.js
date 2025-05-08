const net = require('net');
const fs = require('fs');

const clients = new Map(); // socket => username
let clientIdCounter = 1;
const adminPassword = 'supersecretpw';

const logToFile = (message) => {
  const logMessage = `[${new Date().toISOString()}] ${message}`;
  fs.appendFileSync('server.log', logMessage + '\n');
};

const broadcast = (message, exceptSocket = null) => {
  for (let [client, name] of clients) {
    if (client !== exceptSocket) {
      client.write(message + '\n');
    }
  }
};

const server = net.createServer((socket) => {
  const username = `Guest${clientIdCounter++}`;
  clients.set(socket, username);

  socket.write(`Welcome ${username}!\n`);
  broadcast(`${username} has joined the chat.`, socket);
  logToFile(`${username} connected.`);

  socket.on('data', (data) => {
    const input = data.toString().trim();

    if (input.startsWith('/')) {
      handleCommand(socket, input);
    } else {
      const sender = clients.get(socket);
      const message = `${sender}: ${input}`;
      broadcast(message, socket);
      logToFile(message);
    }
  });

  socket.on('end', () => {
    const username = clients.get(socket);
    clients.delete(socket);
    broadcast(`${username} has left the chat.`, socket);
    logToFile(`${username} disconnected.`);
  });

  socket.on('error', () => {
    const username = clients.get(socket);
    clients.delete(socket);
    broadcast(`${username} disconnected due to error.`, socket);
    logToFile(`${username} disconnected unexpectedly.`);
  });
});

function handleCommand(socket, input) {
  const [cmd, ...args] = input.split(' ');
  const sender = clients.get(socket);

  switch (cmd) {
    case '/w': {
      if (args.length < 2) {
        socket.write('❌ Usage: /w <username> <message>\n');
        return logToFile(`${sender} failed to whisper: Invalid arguments.`);
      }
      const [targetUsername, ...msgParts] = args;
      const targetSocket = [...clients.entries()].find(([sock, name]) => name === targetUsername)?.[0];

      if (!targetSocket) {
        socket.write(`❌ User "${targetUsername}" not found.\n`);
        return logToFile(`${sender} failed to whisper: Target not found.`);
      }
      if (targetSocket === socket) {
        socket.write(`❌ You can't whisper to yourself.\n`);
        return logToFile(`${sender} tried to whisper to themselves.`);
      }

      const whisperMsg = msgParts.join(' ');
      targetSocket.write(`(Whisper from ${sender}): ${whisperMsg}\n`);
      socket.write(`(Whisper to ${targetUsername}): ${whisperMsg}\n`);
      logToFile(`${sender} whispered to ${targetUsername}: ${whisperMsg}`);
      break;
    }

    case '/username': {
      if (args.length !== 1) {
        socket.write('❌ Usage: /username <newUsername>\n');
        return logToFile(`${sender} failed to change username: Invalid arguments.`);
      }
      const newName = args[0];
      const existingNames = [...clients.values()];
      if (newName === sender) {
        socket.write('❌ New username cannot be the same as your current username.\n');
        return logToFile(`${sender} failed to change username: Same as current.`);
      }
      if (existingNames.includes(newName)) {
        socket.write('❌ Username already in use.\n');
        return logToFile(`${sender} failed to change username: Already in use.`);
      }

      clients.set(socket, newName);
      socket.write(`✅ Username changed to ${newName}\n`);
      broadcast(`${sender} is now known as ${newName}`, socket);
      logToFile(`${sender} changed username to ${newName}`);
      break;
    }

    case '/kick': {
      if (args.length !== 2) {
        socket.write('❌ Usage: /kick <username> <adminPassword>\n');
        return logToFile(`${sender} failed to kick: Invalid arguments.`);
      }
      const [targetUsername, password] = args;
      if (password !== adminPassword) {
        socket.write('❌ Incorrect admin password.\n');
        return logToFile(`${sender} failed to kick: Incorrect password.`);
      }

      const targetSocketEntry = [...clients.entries()].find(([sock, name]) => name === targetUsername);
      if (!targetSocketEntry) {
        socket.write(`❌ User "${targetUsername}" not found.\n`);
        return logToFile(`${sender} failed to kick: User not found.`);
      }

      const [targetSocket] = targetSocketEntry;
      if (targetSocket === socket) {
        socket.write('❌ You cannot kick yourself.\n');
        return logToFile(`${sender} failed to kick themselves.`);
      }

      targetSocket.write(`❌ You have been kicked from the chat by ${sender}.\n`);
      targetSocket.end();
      clients.delete(targetSocket);

      broadcast(`${targetUsername} has been kicked by ${sender}.`, socket);
      logToFile(`${sender} kicked ${targetUsername}`);
      break;
    }

    case '/clientlist': {
      const names = [...clients.values()].join(', ');
      socket.write(`👥 Connected clients: ${names}\n`);
      logToFile(`${sender} requested client list.`);
      break;
    }

    default:
      socket.write('❌ Unknown command.\n');
      logToFile(`${sender} entered unknown command: ${cmd}`);
  }
}

server.listen(3000, () => {
  console.log('🚀 Server running on port 3000');
});
