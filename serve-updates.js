const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 4200;
const ROOT = path.join(__dirname, 'releases');

function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.yml': 'text/yaml',
  '.yaml': 'text/yaml',
  '.exe': 'application/octet-stream',
  '.zip': 'application/zip',
  '.7z': 'application/x-7z-compressed',
};

function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  let filePath = path.join(ROOT, decodeURIComponent(req.url).split('?')[0]);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end('Not found: ' + req.url);
      return;
    }

    sendFile(res, filePath, guessContentType(filePath));
  });
});

server.listen(PORT, () => {
  console.log(`Servidor de actualizaciones en http://localhost:${PORT}`);
  console.log(`Sirviendo archivos desde: ${ROOT}`);
});
