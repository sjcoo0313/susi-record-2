const path = require('path');
const app = require('./app');
const { startCloudflareTunnel } = require('./tunnel');

const PORT = process.env.PORT || 3000;

// Serve frontend in production (dist folder)
const distPath = path.join(__dirname, '..', 'dist');
app.use(require('express').static(distPath));

app.use((req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send('Server is running. Please build the client using "npm run build".');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` 🚀 수시 6장 대학 지원 관리 시스템이 실행되었습니다!`);
  console.log(` 💻 로컬 서버 주소: http://localhost:${PORT}`);
  console.log(`=======================================================`);

  // Start Cloudflare Tunnel for local executions
  if (!process.env.NETLIFY && !process.env.RENDER) {
    startCloudflareTunnel(PORT);
  }
});
