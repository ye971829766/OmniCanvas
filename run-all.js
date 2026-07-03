import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Detect if bun is available
let runner = 'npm';
try {
  runner = fs.existsSync(path.join(__dirname, 'bun.lock')) ? 'bun' : 'npm';
} catch (e) {
  runner = 'npm';
}

const services = [
  {
    name: 'Backend',
    command: 'bun',
    args: ['run', 'dev'],
    cwd: path.join(__dirname, 'server'),
    color: '\x1b[36m', // Cyan
  },
  {
    name: 'Admin',
    command: runner,
    args: ['run', 'dev'],
    cwd: path.join(__dirname, 'admin'),
    color: '\x1b[33m', // Yellow
  },
  {
    name: 'Frontend',
    command: runner,
    args: ['run', 'dev'],
    cwd: __dirname,
    color: '\x1b[32m', // Green
  }
];

const children = [];

console.log('\x1b[35m%s\x1b[0m', `Starting AgentsBoard Services concurrently (using ${runner} for web apps)...`);
console.log('\x1b[35m%s\x1b[0m', 'Press Ctrl+C to stop all services.');

services.forEach(service => {
  const child = spawn(service.command, service.args, {
    cwd: service.cwd,
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  children.push({ child, name: service.name });

  const prefix = `${service.color}[${service.name}]\x1b[0m`;

  child.stdout.on('data', data => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      if (line) console.log(`${prefix} ${line}`);
    });
  });

  child.stderr.on('data', data => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      if (line) console.error(`${prefix} \x1b[31m${line}\x1b[0m`);
    });
  });

  child.on('close', code => {
    console.log(`${prefix} exited with code ${code}`);
    cleanupAndExit(code);
  });
});

function cleanupAndExit(code = 0) {
  console.log('\x1b[35mCleaning up services...\x1b[0m');
  children.forEach(({ child, name }) => {
    if (child.pid) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', child.pid, '/f', '/t'], { shell: true });
        } else {
          child.kill('SIGTERM');
        }
      } catch (e) {
        // ignore
      }
    }
  });
  process.exit(code);
}

process.on('SIGINT', () => {
  console.log('\n\x1b[35mReceived Ctrl+C. Stopping all services...\x1b[0m');
  cleanupAndExit(0);
});

process.on('SIGTERM', () => {
  cleanupAndExit(0);
});
