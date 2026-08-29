const express = require('express');
const path = require('path');
const fs = require('fs');
const app = require('./app');
const { startCloudflareTunnel } = require('./tunnel');

const PORT = process.env.PORT || 3000;

// Embedded fallback HTML
const fallbackHtml = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23ff6f1e'><path d='M12 2L1 7l11 5 9-4.09V17h2V7L12 2zm0 8.5L4.78 7 12 3.73 19.22 7 12 10.5zM3 10.5v6.5l9 5 9-5v-6.5l-9 5-9-5z'/></svg>" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>수시 원서 접수 기록장</title>
    <link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&family=Outfit:wght@500;600;700;800&display=swap" rel="stylesheet">
    <script type="module" crossorigin src="/assets/index-C_IWB7Uy.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-DO4b6PEs.css">
  </head>
  <body class="bg-[#fdfbf9] text-[#171717] min-h-screen antialiased selection:bg-[#ff6f1e] selection:text-white font-sans">
    <div id="root"></div>
  </body>
</html>`;

// Serve static assets from all possible locations
['dist', 'client/dist', '../dist', 'dist/assets', 'assets', 'server/dist', '../server/dist'].forEach(dir => {
  const p = path.resolve(__dirname, dir);
  if (fs.existsSync(p)) app.use(express.static(p));
  const pRoot = path.resolve(process.cwd(), dir);
  if (fs.existsSync(pRoot)) app.use(express.static(pRoot));
});

// Serve assets folder specifically
['dist/assets', 'client/dist/assets', '../dist/assets', 'assets'].forEach(dir => {
  const p = path.resolve(__dirname, dir);
  if (fs.existsSync(p)) app.use('/assets', express.static(p));
  const pRoot = path.resolve(process.cwd(), dir);
  if (fs.existsSync(pRoot)) app.use('/assets', express.static(pRoot));
});

app.use((req, res) => {
  const candidateIndex = [
    path.join(__dirname, 'dist', 'index.html'),
    path.join(__dirname, '..', 'dist', 'index.html'),
    path.join(process.cwd(), 'dist', 'index.html'),
    path.join(__dirname, 'client', 'dist', 'index.html')
  ].find(p => fs.existsSync(p));

  if (candidateIndex) {
    res.sendFile(candidateIndex);
  } else {
    res.type('html').send(fallbackHtml);
  }
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
