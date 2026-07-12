const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, 'releases');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function copyDirSync(src, dest) {
  ensureDir(dest);
  fs.readdirSync(src).forEach((entry) => {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    if (fs.statSync(s).isDirectory()) {
      copyDirSync(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  });
}

function generateManifest() {
  const pkg = require('./package.json');
  const version = pkg.version;
  ensureDir(ROOT);

  const unpackedDir = path.join(__dirname, 'dist', 'win-unpacked');
  const releaseDir = path.join(ROOT, version);
  const releaseDest = path.join(releaseDir, 'win-unpacked');
  const installerName = 'Stream Chat Overlay Setup.exe';
  const installerPath = path.join(__dirname, 'dist', installerName);
  const zipName = `StreamChatOverlay-${version}-portable.zip`;
  const zipPath = path.join(ROOT, zipName);

  if (!fs.existsSync(unpackedDir)) {
    console.log('No existe dist/win-unpacked. Ejecutando npm run build primero...');
    execSync('npm run build', { cwd: __dirname, stdio: 'inherit' });
  }

  if (!fs.existsSync(releaseDest)) {
    copyDirSync(unpackedDir, releaseDest);
    console.log(`Copiado release a ${releaseDest}`);
  } else {
    console.log(`Release ${version} ya existe en ${releaseDest}`);
  }

  const sourceZip = path.join(__dirname, 'dist', 'StreamChatOverlay.zip');
  if (fs.existsSync(sourceZip) && !fs.existsSync(zipPath)) {
    fs.copyFileSync(sourceZip, zipPath);
    console.log(`Copiado ZIP a ${zipPath}`);
  }

  const useInstaller = fs.existsSync(installerPath);
  const fileUrl = useInstaller
    ? `/${version}/${installerName}`
    : `/${version}/win-unpacked/Stream Chat Overlay.exe`;
  const fileSize = useInstaller
    ? fs.statSync(installerPath).size
    : fs.statSync(path.join(releaseDest, 'Stream Chat Overlay.exe')).size;

  const latestJson = {
    version,
    files: [
      {
        url: fileUrl,
        sha512: '',
        size: fileSize || 0
      }
    ],
    path: fileUrl,
    sha512: '',
    releaseDate: new Date().toISOString()
  };

  const latestYml = `version: ${version}
files:
  - url: ${fileUrl}
    sha512: ${latestJson.sha512}
    size: ${latestJson.files[0].size}
path: ${fileUrl}
sha512: ${latestJson.sha512}
releaseDate: '${latestJson.releaseDate}'
`;

  fs.writeFileSync(path.join(ROOT, 'latest.json'), JSON.stringify(latestJson, null, 2));
  fs.writeFileSync(path.join(ROOT, 'latest.yml'), latestYml);
  console.log('Manifiestos generados en releases/');
}

generateManifest();
