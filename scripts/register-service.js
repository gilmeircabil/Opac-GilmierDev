const { Service } = require('node-windows');
const path = require('path');

// Identify the main Electron executable
const execPath = process.execPath;

// If running from source, use electron executable
if (!execPath.toLowerCase().endsWith('opaclibrary.exe')) {
  console.log('Running in development mode or not bundled as OpacLibrary.exe');
  // In dev mode, we would just use the electron CLI, but node-windows expects a node script.
  // This script is meant to be run in production on the built executable.
}

const svc = new Service({
  name: 'OPAC Library Backend',
  description: 'Node.js Backend API for OPAC Library',
  script: path.join(__dirname, '..', 'OpacLibrary.exe'),
  scriptOptions: '--run-backend',
  wait: 2,
  grow: .5,
  maxRetries: 3
});

svc.on('install', function() {
  console.log('Service installed successfully. Starting service...');
  svc.start();
});

svc.on('alreadyinstalled', function() {
  console.log('This service is already installed.');
});

svc.on('start', function() {
  console.log('Service started successfully.');
});

svc.on('error', function(err) {
  console.error('Service error:', err);
});

svc.install();
