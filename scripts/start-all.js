#!/usr/bin/env node

import { spawn } from 'node:child_process';
import net from 'node:net';

const ROOT = process.cwd();
const HOST = '127.0.0.1';
const FRONTEND_PREFERRED_PORT = 4321;
const ADMIN_PREFERRED_PORT = 4323;
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const commandShell = process.env.ComSpec || 'cmd.exe';
const children = [];

main().catch((error) => {
  console.error(error.message || error);
  shutdown(1);
});

async function main() {
  console.log('正在检查可用端口...');

  const frontendPort = await findAvailablePort(FRONTEND_PREFERRED_PORT);
  const adminPort = await findAvailablePort(ADMIN_PREFERRED_PORT, new Set([frontendPort]));
  const frontendUrl = `http://${HOST}:${frontendPort}/blog`;
  const adminUrl = `http://${HOST}:${adminPort}/admin`;

  reportPort('前台', FRONTEND_PREFERRED_PORT, frontendPort);
  reportPort('后台', ADMIN_PREFERRED_PORT, adminPort, frontendPort);

  console.log('');
  console.log('正在启动前台和后台...');
  console.log(`前台地址：${frontendUrl}`);
  console.log(`后台地址：${adminUrl}`);
  console.log('');

  const frontendCommand = process.platform === 'win32' ? commandShell : npmCommand;
  const frontendArgs =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', `call npm.cmd run dev -- --host ${HOST} --port ${frontendPort}`]
      : ['run', 'dev', '--', '--host', HOST, '--port', String(frontendPort)];

  const frontend = spawnManaged('前台', frontendCommand, frontendArgs, {
    cwd: ROOT,
    env: {
      ...process.env,
      ASTRO_TELEMETRY_DISABLED: '1'
    }
  });
  children.push(frontend);

  const admin = spawnManaged('后台', process.execPath, ['scripts/admin-server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      ADMIN_PORT: String(adminPort)
    }
  });
  children.push(admin);

  watchChild('前台', frontend);
  watchChild('后台', admin);
  bindShutdown();

  if (process.env.START_ALL_NO_OPEN !== '1') {
    setTimeout(() => {
      openBrowser(frontendUrl);
      openBrowser(adminUrl);
    }, 2500);
  }

  process.stdin.resume();
}

async function findAvailablePort(preferredPort, reserved = new Set()) {
  for (let port = preferredPort; port < 65536; port += 1) {
    if (reserved.has(port)) continue;
    if (await isPortAvailable(port)) return port;
  }

  throw new Error(`从 ${preferredPort} 开始没有找到可用端口。`);
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen({ host: HOST, port, exclusive: true });
  });
}

function reportPort(name, preferredPort, actualPort, blockedByPort) {
  if (actualPort === preferredPort) {
    console.log(`${name}端口 ${preferredPort} 可用。`);
    return;
  }

  if (blockedByPort === preferredPort) {
    console.log(`${name}端口 ${preferredPort} 已被前台占用，自动改用 ${actualPort}。`);
    return;
  }

  console.log(`${name}端口 ${preferredPort} 已被占用，自动改用 ${actualPort}。`);
}

function openBrowser(url) {
  const command =
    process.platform === 'win32'
      ? 'cmd'
      : process.platform === 'darwin'
        ? 'open'
        : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const opener = spawn(command, args, {
    detached: true,
    stdio: 'ignore'
  });

  opener.unref();
}

function spawnManaged(name, command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false
  });

  child.stdout?.on('data', (chunk) => {
    process.stdout.write(chunk);
  });

  child.stderr?.on('data', (chunk) => {
    process.stderr.write(chunk);
  });

  child.once('spawn', () => {
    console.log(`${name}工作目录：${options.cwd}`);
  });

  return child;
}

function watchChild(name, child) {
  child.on('error', (error) => {
    console.error(`${name}启动失败：${error.message}`);
    shutdown(1);
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const reason = signal ? `信号 ${signal}` : `退出码 ${code}`;
    console.log(`${name}已停止（${reason}）。`);
  });
}

let shuttingDown = false;

function bindShutdown() {
  process.once('SIGINT', () => shutdown(0));
  process.once('SIGTERM', () => shutdown(0));
  process.once('SIGHUP', () => shutdown(0));
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    stopChild(child);
  }

  setTimeout(() => process.exit(code), 300);
}

function stopChild(child) {
  if (!child || child.killed || !child.pid) return;

  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    return;
  }

  child.kill('SIGTERM');
}
