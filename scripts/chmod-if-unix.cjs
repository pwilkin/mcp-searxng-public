// scripts/chmod-if-unix.js
const { chmodSync, existsSync } = require('fs');
const { platform } = require('os');

if (platform() !== 'win32') {
  const file = './build/index.js';
  if (existsSync(file)) {
    chmodSync(file, 0o755);
    console.log('Set executable permission on:', file);
  }
}
