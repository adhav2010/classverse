const { spawn } = require('child_process');
const fs = require('fs');
const https = require('https');
const path = require('path');

const CLOUDFLARED_BIN = path.join(__dirname, 'cloudflared');
const URL_FILE = path.join(__dirname, '..', 'TUNNEL_URL.txt');
const JSON_FILE = path.join(__dirname, '..', 'public', 'tunnel_url.json');

let currentChild = null;
let currentUrl = null;
let consecutiveFailures = 0;
let isRestarting = false;

function startTunnel() {
  if (isRestarting) return;
  isRestarting = true;

  if (currentChild) {
    try {
      currentChild.kill('SIGKILL');
    } catch (e) {}
    currentChild = null;
  }

  console.log(`[${new Date().toISOString()}] Launching cloudflared tunnel with HTTP/2 protocol...`);
  consecutiveFailures = 0;

  const child = spawn(CLOUDFLARED_BIN, [
    'tunnel',
    '--protocol', 'http2',
    '--url', 'http://localhost:3000'
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  currentChild = child;
  isRestarting = false;

  const handleOutput = (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);

    // Look for generated trycloudflare URL
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && match[0] && match[0] !== currentUrl) {
      currentUrl = match[0];
      console.log(`\n=======================================================`);
      console.log(`🚀 ACTIVE TUNNEL URL: ${currentUrl}`);
      console.log(`=======================================================\n`);

      try {
        fs.writeFileSync(URL_FILE, currentUrl + '\n');
        fs.writeFileSync(JSON_FILE, JSON.stringify({ url: currentUrl, updatedAt: new Date().toISOString() }, null, 2));
      } catch (e) {
        console.error('Error saving URL:', e);
      }
    }

    // Check for unrecoverable tunnel errors
    if (text.includes('Unauthorized: Tunnel not found') || text.includes('ERR Register tunnel error from server side')) {
      console.warn(`[${new Date().toISOString()}] Tunnel session expired on Cloudflare edge. Triggering automatic restart...`);
      restartTunnel();
    }
  };

  child.stdout.on('data', handleOutput);
  child.stderr.on('data', handleOutput);

  child.on('exit', (code, signal) => {
    console.log(`[${new Date().toISOString()}] cloudflared exited with code ${code}, signal ${signal}`);
    if (!isRestarting) {
      setTimeout(startTunnel, 3000);
    }
  });

  child.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] cloudflared process error:`, err);
    if (!isRestarting) {
      setTimeout(startTunnel, 3000);
    }
  });
}

function restartTunnel() {
  if (isRestarting) return;
  console.log(`[${new Date().toISOString()}] Restarting tunnel...`);
  if (currentChild) {
    try {
      currentChild.kill('SIGKILL');
    } catch (e) {}
  }
  setTimeout(startTunnel, 2000);
}

// Health check interval
setInterval(() => {
  if (!currentUrl || isRestarting) return;

  const req = https.request(currentUrl, { method: 'HEAD', timeout: 8000 }, (res) => {
    if (res.statusCode >= 200 && res.statusCode < 500) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
      console.warn(`[${new Date().toISOString()}] Healthcheck warning: status ${res.statusCode} (fails: ${consecutiveFailures})`);
    }
  });

  req.on('error', (err) => {
    consecutiveFailures++;
    console.warn(`[${new Date().toISOString()}] Healthcheck error: ${err.message} (fails: ${consecutiveFailures})`);
    if (consecutiveFailures >= 3) {
      console.warn(`[${new Date().toISOString()}] 3 consecutive healthcheck failures. Restarting tunnel...`);
      restartTunnel();
    }
  });

  req.on('timeout', () => {
    req.destroy();
    consecutiveFailures++;
    console.warn(`[${new Date().toISOString()}] Healthcheck timed out (fails: ${consecutiveFailures})`);
    if (consecutiveFailures >= 3) {
      console.warn(`[${new Date().toISOString()}] 3 consecutive healthcheck timeouts. Restarting tunnel...`);
      restartTunnel();
    }
  });

  req.end();
}, 20000);

startTunnel();

process.on('SIGINT', () => {
  if (currentChild) currentChild.kill('SIGTERM');
  process.exit(0);
});
process.on('SIGTERM', () => {
  if (currentChild) currentChild.kill('SIGTERM');
  process.exit(0);
});
