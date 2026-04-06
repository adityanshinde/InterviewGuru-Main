/**
 * electron-dev.cjs
 * Cross-platform Electron dev launcher.
 * 1. Spawns `tsx backend/api/server.ts` (stdio to terminal)
 * 2. Waits until the server writes `.interviewguru-dev-port` with its bound port
 *    (Express may use 3001+ if 3000 is taken — Electron must load that same port)
 * 3. Launches Electron with INTERVIEWGURU_DEV_PORT so main.cjs opens the correct URL
 * 4. When Electron exits → stops the server
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const DEV_PORT_FILE = path.join(ROOT, '.interviewguru-dev-port');

try {
  fs.unlinkSync(DEV_PORT_FILE);
} catch {
  /* no stale file */
}

console.log('\n🚀 [InterviewGuru] Starting backend server...\n');

const serverProcess = spawn('npx', ['tsx', 'backend/api/server.ts'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    // Fast /api/analyze + skip heavy vector embedding in dev; override a global NODE_ENV=production.
    NODE_ENV: 'development',
  },
});

serverProcess.on('error', (err) => {
  console.error('❌ [InterviewGuru] Failed to start server:', err.message);
  process.exit(1);
});

serverProcess.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.log(`\n[InterviewGuru] Server exited (code ${code})`);
  }
});

function waitForBoundPort(onReady) {
  process.stdout.write('⏳ [InterviewGuru] Waiting for server');
  const timer = setInterval(() => {
    try {
      if (fs.existsSync(DEV_PORT_FILE)) {
        const raw = fs.readFileSync(DEV_PORT_FILE, 'utf8').trim();
        const p = parseInt(raw, 10);
        if (p >= 1 && p <= 65535) {
          clearInterval(timer);
          process.stdout.write(' ✅\n');
          onReady(p);
          return;
        }
      }
    } catch {
      /* keep polling */
    }
    process.stdout.write('.');
  }, 250);
}

waitForBoundPort((port) => {
  console.log(`\n⚡ [InterviewGuru] Launching Electron (UI → http://127.0.0.1:${port}/app)...\n`);

  const electronPath = require('electron');

  const electronProcess = spawn(electronPath, ['.'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      INTERVIEWGURU_DEV_PORT: String(port),
      // Vite HMR needs unsafe-eval; Electron logs a CSP warning that does not apply once packaged.
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
  });

  electronProcess.on('error', (err) => {
    console.error('❌ [InterviewGuru] Failed to launch Electron:', err.message);
    serverProcess.kill();
    process.exit(1);
  });

  electronProcess.on('close', (code) => {
    console.log('\n[InterviewGuru] Electron closed. Shutting down server...');
    serverProcess.kill('SIGTERM');
    setTimeout(() => process.exit(code ?? 0), 500);
  });
});

process.on('SIGINT', () => {
  serverProcess.kill();
  process.exit(0);
});
process.on('SIGTERM', () => {
  serverProcess.kill();
  process.exit(0);
});
