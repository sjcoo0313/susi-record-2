const path = require('path');
const fs = require('fs');
const app = require('./app');
const { startCloudflareTunnel } = require('./tunnel');

const PORT = process.env.PORT || 3000;

// Find dist directory flexibly
const candidates = [
  path.join(__dirname, 'dist'),
  path.join(__dirname, '..', 'dist'),
  path.join(process.cwd(), 'dist'),
  path.join(__dirname, 'client', 'dist'),
  path.join(__dirname, '..', 'client', 'dist'),
  path.join(process.cwd(), 'client', 'dist')
];

let distPath = candidates.find(p => fs.existsSync(path.join(p, 'index.html'))) || path.join(__dirname, 'dist');

app.use(require('express').static(distPath));

app.use((req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send('Server is running. Please build the client using "npm run build".');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` 🚀 수시 6장 대학 지원 관리 시스템이 실행되었습니다!`);
  console.log(` 💻 포트: ${PORT}, 프론트엔드 경로: ${distPath}`);
  console.log(`=======================================================`);

  // Start Cloudflare Tunnel for local executions
  if (!process.env.NETLIFY && !process.env.RENDER) {
    startCloudflareTunnel(PORT);
  }
});
