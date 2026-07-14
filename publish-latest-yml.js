const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GH_TOKEN = process.env.GH_TOKEN;
if (!GH_TOKEN) {
  console.error('Falta GH_TOKEN en el entorno.');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const version = pkg.version;
const owner = 'LaManditacabra';
const repo = 'Overlay';
const zipPath = path.join(__dirname, 'dist', `StreamChatOverlay-${version}.zip`);
const ymlPath = path.join(__dirname, 'dist', 'latest.yml');

if (!fs.existsSync(zipPath)) {
  console.error('No existe el zip esperado:', zipPath);
  process.exit(1);
}

const zipBuffer = fs.readFileSync(zipPath);
const sha512 = crypto.createHash('sha512').update(zipBuffer).digest('hex');
const size = zipBuffer.length;

const yml = `version: ${version}
files:
  - url: StreamChatOverlay-${version}.zip
    sha512: ${sha512}
    size: ${size}
path: StreamChatOverlay-${version}.zip
sha512: ${sha512}
releaseDate: ${new Date().toISOString()}
`;

fs.writeFileSync(ymlPath, yml, 'utf8');
console.log('latest.yml generado en', ymlPath);

function ghRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = typeof body === 'string' ? body : (body ? JSON.stringify(body) : null);
    const options = {
      hostname: 'api.github.com',
      path: apiPath,
      method,
      headers: {
        'Authorization': `token ${GH_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'stream-chat-overlay',
        ...(bodyStr ? { 'Content-Type': 'application/json' } : {}),
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`GitHub API ${method} ${apiPath} ${res.statusCode}: ${data}`));
        } else {
          resolve(data ? JSON.parse(data) : null);
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function uploadAsset(url, buffer) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Authorization': `token ${GH_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'stream-chat-overlay',
        'Content-Type': 'application/octet-stream',
        'Content-Length': buffer.length,
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Upload ${res.statusCode}: ${data}`));
        } else {
          resolve(JSON.parse(data));
        }
      });
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

async function findRelease() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const list = await ghRequest('GET', `/repos/${owner}/${repo}/releases?per_page=10`);
    const found = (list || []).find((r) => {
      const tag = (r.tag_name || '').replace(/^v/, '');
      const name = (r.name || '').trim();
      return tag === version || name === version;
    });
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return null;
}

async function main() {
  const release = await findRelease();
  if (!release) {
    console.error('No se encontró la release para la version ' + version + ' luego de reintentar.');
    process.exit(1);
  }
  console.log('Release encontrada:', release.id, release.name);

  const uploadUrl = `https://uploads.github.com/repos/${owner}/${repo}/releases/${release.id}/assets?name=latest.yml`;
  const result = await uploadAsset(uploadUrl, fs.readFileSync(ymlPath));
  console.log('latest.yml subido:', result.browser_download_url);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
