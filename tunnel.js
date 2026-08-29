const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let publicUrl = null;
let tunnelProcess = null;
let isShuttingDown = false;
let reconnectTimer = null;

function startCloudflareTunnel(port = 3000) {
  const binaryPath = path.join(__dirname, '..', 'cloudflared.exe');
  
  if (!fs.existsSync(binaryPath)) {
    console.log('[Tunnel] cloudflared.exe not found in root, running on local network only.');
    return;
  }

  function launch() {
    if (isShuttingDown) return;

    try {
      console.log('[Tunnel] Starting Cloudflare Tunnel with Auto-Reconnect Watchdog...');
      // Launch cloudflared with metrics and keepalive
      tunnelProcess = spawn(binaryPath, [
        'tunnel',
        '--url', `http://localhost:${port}`,
        '--no-autoupdate',
        '--protocol', 'auto'
      ]);

      const urlRegex = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;

      const handleOutput = (data) => {
        const text = data.toString();
        const match = text.match(urlRegex);
        if (match) {
          publicUrl = match[0];
          console.log(`=======================================================`);
          console.log(` 💬 [카카오톡 공유용 인터넷 접속 링크 활성화]`);
          console.log(` 👉 ${publicUrl}`);
          console.log(` (학생들이 집이나 LTE/5G에서도 카톡으로 바로 접속 가능)`);
          console.log(`=======================================================`);
        }
      };

      tunnelProcess.stdout.on('data', handleOutput);
      tunnelProcess.stderr.on('data', handleOutput);

      tunnelProcess.on('error', (err) => {
        console.error('[Tunnel Spawn Error]:', err.message);
      });

      tunnelProcess.on('close', (code) => {
        console.log(`[Tunnel] Cloudflare process exited with code ${code}.`);
        publicUrl = null;

        // Auto-reconnect after 2.5 seconds if not explicitly shut down
        if (!isShuttingDown) {
          console.log('[Tunnel] Auto-reconnecting tunnel in 2.5 seconds...');
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(launch, 2500);
        }
      });

    } catch (err) {
      console.error('[Tunnel Launch Error]:', err);
      if (!isShuttingDown) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(launch, 3000);
      }
    }
  }

  launch();

  process.on('exit', () => {
    isShuttingDown = true;
    clearTimeout(reconnectTimer);
    if (tunnelProcess) {
      try { tunnelProcess.kill(); } catch (e) {}
    }
  });

  process.on('SIGINT', () => {
    isShuttingDown = true;
    clearTimeout(reconnectTimer);
    if (tunnelProcess) {
      try { tunnelProcess.kill(); } catch (e) {}
    }
    process.exit();
  });
}

function getPublicUrl() {
  return publicUrl;
}

module.exports = {
  startCloudflareTunnel,
  getPublicUrl
};
