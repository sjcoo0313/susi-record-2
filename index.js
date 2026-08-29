const express = require('express');
const path = require('path');
const fs = require('fs');
const app = require('./app');
const { startCloudflareTunnel } = require('./tunnel');

const PORT = process.env.PORT || 3000;

// Read pre-bundled single index.html
function getIndexHtml() {
  const candidates = [
    path.join(__dirname, 'dist', 'index.html'),
    path.join(__dirname, '..', 'dist', 'index.html'),
    path.join(process.cwd(), 'dist', 'index.html'),
    path.join(__dirname, 'index.html'),
    path.join(process.cwd(), 'index.html')
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        if (content.length > 500) return content;
      } catch (e) {}
    }
  }
  return null;
}

const bundledHtml = getIndexHtml();

// Serve static assets if any exist
['dist', 'client/dist', '../dist', 'server/dist'].forEach(dir => {
  const p = path.resolve(__dirname, dir);
  if (fs.existsSync(p)) app.use(express.static(p));
  const pRoot = path.resolve(process.cwd(), dir);
  if (fs.existsSync(pRoot)) app.use(express.static(pRoot));
});

// Serve frontend for all non-API GET routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }

  const html = getIndexHtml() || bundledHtml;
  if (html) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }

  res.send('수시 원서 접수 기록장 서버가 준비 중입니다. 잠시 후 새로고침해주세요.');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` 🚀 수시 6장 대학 지원 관리 시스템이 실행되었습니다!`);
  console.log(` 💻 포트: ${PORT}`);
  console.log(`=======================================================`);

  // Start Cloudflare Tunnel for local executions
  if (!process.env.NETLIFY && !process.env.RENDER) {
    startCloudflareTunnel(PORT);
  }
});
