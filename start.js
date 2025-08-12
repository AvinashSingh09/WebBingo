#!/usr/bin/env node

// Simple start script for deployment platforms
// This ensures the server runs from the correct directory

const { spawn } = require('child_process');
const path = require('path');

// Change to server directory and start the app
process.chdir(path.join(__dirname, 'server'));

const server = spawn('node', ['server.js'], {
  stdio: 'inherit',
  env: { ...process.env }
});

server.on('close', (code) => {
  console.log(`Server process exited with code ${code}`);
  process.exit(code);
}); 