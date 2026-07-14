const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const os = require('os');
const net = require('net');

if (process.env.ELECTRON_RUN_AS_NODE === '1') {
  console.error('No se puede ejecutar Stream Chat Overlay con ELECTRON_RUN_AS_NODE=1.\nElectron necesita correr con sus APIs nativas (app, BrowserWindow, Tray, etc.).');
  setTimeout(() => process.exit(1), 100);
}

function bootLog(msg) {
  try {
    const logPath = path.join(os.tmpdir(), 'stream-chat-overlay-boot.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`, 'utf8');
  } catch (e) {}
}

let isClickThrough = false;

// Client ID de la app de Twitch registrada para este overlay.
// Se usa para el flujo de "Iniciar sesión" (OAuth Implicit Grant).
const TWITCH_CLIENT_ID = 'nhivcrrj5tju64e5ewi7ws1ziab5ep';

let mainWindow;
let settingsWindow;
let tray;

let CONFIG_PATH = '';

const DEFAULT_CONFIG = {
  platform: 'demo',
  channel: '',
  token: '',
  username: '',
  clientId: '',
  demoMode: true,
  fontSize: 13,
  fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
  messageOpacity: 0.85,
  backgroundColor: '0, 0, 0',
  textColor: '#f5f5f5',
  usernameColors: true,
  showBadges: true,
  maxMessages: 35,
  messageInterval: 2200,
  updateFeedUrl: 'https://github.com/LaManditacabra/Overlay/releases/latest'
};

const UPDATE_OWNER = 'LaManditacabra';
const UPDATE_REPO = 'Overlay';

let config = { ...DEFAULT_CONFIG };

function ensurePaths() {
  CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
}

function getConfig() {
  bootLog('getConfig llamado');
  return { ...config };
}

function notifyUpdateStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater-status', payload);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('updater-status', payload);
  }
}

function ensureUpdaterFile() {
  try {
    if (!app.isPackaged) return;
    const resourcesDir = path.join(process.resourcesPath);
    const updaterFile = path.join(resourcesDir, 'app-update.yml');
    if (!fs.existsSync(resourcesDir)) {
      fs.mkdirSync(resourcesDir, { recursive: true });
    }
    if (!fs.existsSync(updaterFile)) {
      fs.writeFileSync(updaterFile, '', 'utf8');
    }
  } catch (e) {
    bootLog('ensureUpdaterFile ERROR: ' + (e && e.stack ? e.stack : String(e)));
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      config = { ...DEFAULT_CONFIG, ...parsed };
    } else {
      saveConfig();
    }
  } catch (e) {
    config = { ...DEFAULT_CONFIG };
  }
}

function saveConfig() {
  bootLog('saveConfig intentando guardar en: ' + CONFIG_PATH);
  try {
    const dir = path.dirname(CONFIG_PATH);
    bootLog('saveConfig directorio: ' + dir + ' existe=' + fs.existsSync(dir));
    fs.mkdirSync(dir, { recursive: true });
    const data = JSON.stringify(config, null, 2);
    fs.writeFileSync(CONFIG_PATH, data, 'utf8');
    bootLog('saveConfig OK, bytes=' + Buffer.byteLength(data, 'utf8'));
  } catch (e) {
    bootLog('saveConfig ERROR: ' + (e && e.stack ? e.stack : String(e)));
    console.error('No se pudo guardar la config', e);
  }
}

function updateConfig(partial) {
  bootLog('updateConfig: ' + JSON.stringify(partial));
  config = { ...config, ...partial };
  saveConfig();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('config-updated', config);
  }

  // Reconectar al chat si cambió plataforma, canal o token
  if (partial.platform !== undefined || partial.channel !== undefined || partial.token !== undefined) {
    connectToTwitchChat(config.channel, config.token);
  }
}

function setupAutoUpdater() {
  ensureUpdaterFile();
  try {
    // Apunta al repositorio de GitHub donde se publican las releases.
    autoUpdater.setFeedURL({ provider: 'github', owner: UPDATE_OWNER, repo: UPDATE_REPO });
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;

    autoUpdater.on('checking-for-update', () => {
      notifyUpdateStatus({ status: 'checking', message: '🔍 Buscando actualizaciones...' });
    });
    autoUpdater.on('update-available', (info) => {
      notifyUpdateStatus({
        status: 'available',
        message: `⬇️ Actualización disponible: ${info.version || ''}`,
        info: { version: info.version },
      });
    });
    autoUpdater.on('update-not-available', () => {
      notifyUpdateStatus({ status: 'none', message: '✅ Ya tenés la última versión' });
    });
    autoUpdater.on('download-progress', (progress) => {
      const pct = progress && typeof progress.percent === 'number' ? Math.round(progress.percent) : 0;
      notifyUpdateStatus({ status: 'downloading', message: `📥 Descargando actualización... ${pct}%` });
    });
    autoUpdater.on('update-downloaded', (info) => {
      notifyUpdateStatus({
        status: 'downloaded',
        message: `✅ Actualización lista (${info.version || ''}). Reiniciá para instalar.`,
        info: { version: info.version },
      });
    });
    autoUpdater.on('error', (err) => {
      notifyUpdateStatus({
        status: 'error',
        message: '❌ Error de actualización: ' + (err && err.message ? err.message : err),
      });
    });

    isUpdaterEnabled = true;
    bootLog('setupAutoUpdater: OK, feed=github:' + UPDATE_OWNER + '/' + UPDATE_REPO);
  } catch (e) {
    bootLog('setupAutoUpdater ERROR: ' + (e && e.stack ? e.stack : String(e)));
    isUpdaterEnabled = false;
  }
}

async function checkForUpdates() {
  if (!isUpdaterEnabled) {
    notifyUpdateStatus({ status: 'none', message: 'Actualizaciones desactivadas' });
    return;
  }
  notifyUpdateStatus({ status: 'checking', message: '🔍 Buscando actualizaciones...' });
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    notifyUpdateStatus({ status: 'error', message: '❌ ' + (err && err.message ? err.message : err) });
  }
}

async function downloadUpdate() {
  if (!isUpdaterEnabled) return;
  try {
    notifyUpdateStatus({ status: 'downloading', message: '📥 Descargando actualización...' });
    await autoUpdater.downloadUpdate();
  } catch (err) {
    notifyUpdateStatus({ status: 'error', message: '❌ Error al descargar: ' + (err && err.message ? err.message : err) });
  }
}

function installUpdate() {
  if (!isUpdaterEnabled) return Promise.resolve();
  try {
    // Cierra la app e instala la actualización ya descargada (o la fuerza si hiciera falta).
    autoUpdater.quitAndInstall();
  } catch (err) {
    notifyUpdateStatus({ status: 'error', message: '❌ Error al instalar: ' + (err && err.message ? err.message : err) });
  }
  return Promise.resolve();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 650,
    x: 100,
    y: 100,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  if (process.env.STREAM_CHAT_OVERLAY_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.setIgnoreMouseEvents(isClickThrough, { forward: true });
    mainWindow.webContents.send('click-through-status', isClickThrough);
    mainWindow.webContents.send('config-updated', config);
  });
}

function createSettings() {
  bootLog('createSettings llamado');
  if (settingsWindow) {
    bootLog('createSettings: ventana ya existe, enfocando');
    settingsWindow.focus();
    if (settingsWindow.isMinimized()) {
      settingsWindow.restore();
    }
    settingsWindow.show();
    return;
  }

  bootLog('createSettings: creando nueva ventana');
  settingsWindow = new BrowserWindow({
    width: 520,
    height: 620,
    title: 'Configuración - Stream Chat Overlay',
    resizable: false,
    maximizable: false,
    minimizable: true,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    backgroundColor: '#1f1f1f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (process.env.STREAM_CHAT_OVERLAY_DEVTOOLS === '1') {
    settingsWindow.webContents.openDevTools({ mode: 'detach' });
  }

  settingsWindow.loadFile(path.join(__dirname, 'src', 'settings.html'));

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
    settingsWindow.focus();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function buildTrayMenu() {
  const overlayVisible = mainWindow && mainWindow.isVisible();
  bootLog('buildTrayMenu: overlayVisible=' + overlayVisible + ' clickThrough=' + isClickThrough);
  return Menu.buildFromTemplate([
    { 
      label: overlayVisible ? '👁️ Ocultar overlay' : '👁️ Mostrar overlay', 
      click: () => {
        bootLog('Tray menu: Mostrar/Ocultar overlay');
        if (mainWindow && mainWindow.isVisible()) {
          mainWindow.hide();
        } else if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      } 
    },
    { type: 'separator' },
    { label: '⚙️ Configuración (F3)', click: () => createSettings() },
    { type: 'separator' },
    { 
      label: isClickThrough ? '🖱️ Desactivar Click-Through (F2)' : '🖱️ Activar Click-Through (F2)', 
      click: () => {
        bootLog('Tray menu: Toggle click-through');
        toggleClickThrough();
      }
    },
    { type: 'separator' },
    { label: '🔍 Buscar actualizaciones', click: () => {
      bootLog('Tray menu: Buscar actualizaciones');
      checkForUpdates();
    }},
    { type: 'separator' },
    { label: '📦 Versión ' + app.getVersion(), enabled: false },
    { type: 'separator' },
    { label: '❌ Salir', click: () => {
      bootLog('Tray menu: Salir');
      app.quit();
    }}
  ]);
}

function refreshTrayMenu() {
  if (tray) {
    tray.setContextMenu(buildTrayMenu());
    tray.setToolTip('Stream Chat Overlay');
  }
}

function setClickThrough(enabled) {
  isClickThrough = enabled;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setIgnoreMouseEvents(enabled, { forward: true });
    mainWindow.webContents.send('click-through-status', enabled);
  }
  refreshTrayMenu();
}

function toggleClickThrough() {
  setClickThrough(!isClickThrough);
}

function createTray() {
  try {
    let trayIcon = null;

    try {
      const png = createMinimalPng(16, 16, Buffer.from([30, 30, 30, 255]));
      bootLog('createTray: PNG en memoria bytes=' + png.length);
      trayIcon = nativeImage.createFromBuffer(png);
      bootLog('createTray: icono desde buffer, isEmpty=' + trayIcon.isEmpty() + ' size=' + trayIcon.getSize().width + 'x' + trayIcon.getSize().height);
    } catch (e) {
      bootLog('createTray: no se pudo crear icono de tray desde buffer: ' + (e && e.message ? e.message : String(e)));
    }

    if (!trayIcon || trayIcon.isEmpty()) {
      bootLog('createTray: icono final invalido, abortando tray');
      throw new Error('Icono de tray invalido');
    }

    tray = new Tray(trayIcon);
    tray.setToolTip('Stream Chat Overlay');
    refreshTrayMenu();
    // En Windows, clic izquierdo también abre el menú contextual del tray
    tray.on('click', () => tray.popUpContextMenu(buildTrayMenu()));
    bootLog('createTray: Tray creado correctamente');
  } catch (e) {
    bootLog('createTray ERROR: ' + (e && e.stack ? e.stack : String(e)));
  }
}

function createMinimalPng(width, height, rgba) {
  const zlib = require('zlib');

  const rowBytes = width * 4;
  const raw = Buffer.alloc(height * (1 + rowBytes));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + rowBytes);
    raw[rowOffset] = 0x00; // filter None
    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * 4;
      raw[px + 0] = rgba[0];
      raw[px + 1] = rgba[1];
      raw[px + 2] = rgba[2];
      raw[px + 3] = rgba[3];
    }
  }

  const png = encodePng(width, height, raw);
  return png;
}

function encodePng(width, height, raw) {
  const zlib = require('zlib');

  const crc32Table = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        if (c & 1) {
          c = 0xEDB88320 ^ (c >>> 1);
        } else {
          c = c >>> 1;
        }
      }
      table[n] = c;
    }
    return table;
  })();

  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      crc = crc32Table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function chunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const buf = Buffer.alloc(4 + 4 + data.length + 4);
    buf.writeUInt32BE(data.length, 0);  // longitud de los datos (sin el tipo)
    typeBuf.copy(buf, 4);               // tipo del chunk (IHDR/IDAT/IEND)
    data.copy(buf, 8);                  // datos
    const crcInput = Buffer.concat([typeBuf, data]);
    const crcValue = crc32(crcInput);
    buf.writeUInt32BE(crcValue, 8 + data.length);
    return buf;
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw);
  bootLog('encodePng: raw=' + raw.length + ' compressed=' + compressed.length + ' w=' + width + ' h=' + height);
  const idat = chunk('IDAT', compressed);
  const iend = chunk('IEND', Buffer.alloc(0));

  const png = Buffer.concat([sig, chunk('IHDR', ihdr), idat, iend]);
  bootLog('encodePng: png=' + png.length + ' bytes');
  return png;
}

app.whenReady().then(() => {
  const gotTheLock = app.requestSingleInstanceLock();

  if (!gotTheLock) {
    app.quit();
    return;
  }

  if (process.env.ELECTRON_RUN_AS_NODE) {
    bootLog('WARNING: ELECTRON_RUN_AS_NODE esta seteado, Electron no cargará las APIs nativas.');
  }

  app.on('second-instance', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.focus();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized() || !mainWindow.isVisible()) {
        mainWindow.show();
      }
      mainWindow.focus();
    }
  });

  ensurePaths();
  bootLog('BOOT: main.js cargado');
  loadConfig();
  bootLog('BOOT: config cargada');
  setupAutoUpdater();
  bootLog('BOOT: autoUpdater seteado');
  if (app.isPackaged && config.updateFeedUrl && String(config.updateFeedUrl).trim() !== '') {
    bootLog('BOOT: chequeando updates en inicio');
    checkForUpdates();
  }
  createWindow();
  bootLog('BOOT: window creada');
  createTray();
  bootLog('BOOT: tray creado');
  connectToTwitchChat(config.channel, config.token);
  bootLog('BOOT: chat conectado');
  globalShortcut.register('F2', toggleClickThrough);
  globalShortcut.register('F3', createSettings);
  globalShortcut.register('CommandOrControl+Q', () => app.quit());
  bootLog('BOOT: shortcuts registrados');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Mantener vivo por el tray
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('uncaught-exception', (err) => {
  bootLog('UNCAUGHT: ' + (err && err.stack ? err.stack : String(err)));
});

process.on('uncaughtException', (err) => {
  bootLog('PROCESS UNCAUGHT: ' + (err && err.stack ? err.stack : String(err)));
});

process.on('exit', (code) => {
  bootLog('EXIT: code=' + code);
});

// IPC
ipcMain.handle('toggle-click-through', toggleClickThrough);
ipcMain.handle('set-click-through', (e, enabled) => setClickThrough(enabled));
ipcMain.handle('get-click-through-status', () => isClickThrough);

ipcMain.handle('get-config', getConfig);
ipcMain.handle('set-config', (e, partial) => {
  bootLog('IPC set-config recibido desde ' + (e && e.sender ? e.sender.id : 'unknown') + ': ' + JSON.stringify(partial));
  updateConfig(partial);
  const result = getConfig();
  bootLog('IPC set-config resultado: ' + JSON.stringify(result));
  return result;
});
ipcMain.handle('open-settings', createSettings);
ipcMain.handle('check-for-updates', checkForUpdates);
ipcMain.handle('download-update', downloadUpdate);
ipcMain.handle('install-update', installUpdate);
ipcMain.handle('get-app-version', () => app.getVersion());

// Twitch OAuth (vinculación de cuenta desde la configuración)
// Usa Implicit Grant (response_type=token): solo requiere el Client ID, el token
// se captura solo desde el fragmento de la redirección. No necesita Client Secret.
function validateTwitchToken(token) {
  return new Promise((resolve) => {
    const req = https.get('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: 'OAuth ' + token },
    }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          resolve(j.login || null);
        } catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
  });
}

ipcMain.handle('twitch-auth-start', async (e, creds) => {
  const clientId = (config.clientId || TWITCH_CLIENT_ID || '').trim();
  if (!clientId) {
    throw new Error('Falta el Client ID de Twitch. Pedile al desarrollador que lo configure.');
  }
  // Guardar el Client ID para futuros re-enlaces
  config.clientId = clientId;
  saveConfig();

  const redirectUri = 'http://localhost:3000';
  return await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      try { server.close(); } catch (err) {}
      fn(arg);
    };
    const server = http.createServer((req, res) => {
      // Paso 2: el navegador redirige con el token en el fragmento (#access_token=...).
      // El fragmento NO llega al server, así que servimos un HTML que lo reenvía por POST.
      if (req.url && req.url.startsWith('/token')) {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const params = new URLSearchParams(body);
          const token = params.get('access_token');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html><body style="font-family:Segoe UI,sans-serif"><h2>✅ Cuenta de Twitch vinculada</h2><p>Podés cerrar esta pestaña y volver al overlay.</p></body></html>');
          if (!token) { finish(reject, new Error('No se recibió el token de Twitch.')); return; }
          validateTwitchToken(token).then(
            (login) => finish(resolve, { token, login }),
            () => finish(resolve, { token, login: null })
          );
        });
        return;
      }
      // Paso 1: página que captura el fragmento y lo reenvía al server por POST
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html><body><script>'
        + 'var h = location.hash.substring(1);'
        + 'var x = new XMLHttpRequest(); x.open("POST", "/token"); x.send(h);'
        + '</script><p style="font-family:Segoe UI,sans-serif">Autorizando tu cuenta de Twitch…</p></body></html>');
    });
    server.on('error', (e) => finish(reject, new Error('No se pudo abrir el servidor local (¿puerto 3000 ocupado?): ' + e.message)));
    server.listen(3000, '127.0.0.1', () => {
      const authUrl = 'https://id.twitch.tv/oauth2/authorize?'
        + 'client_id=' + encodeURIComponent(clientId)
        + '&redirect_uri=' + encodeURIComponent(redirectUri)
        + '&response_type=token'
        + '&scope=' + encodeURIComponent('chat:read');
      shell.openExternal(authUrl);
    });
    // Timeout de seguridad (5 min) por si el usuario cierra el navegador
    setTimeout(() => {
      if (!settled) finish(reject, new Error('Tiempo de espera agotado. No se completó la autorización.'));
    }, 5 * 60 * 1000);
  });
});

// Twitch Chat Integration
let twitchClient = null;
let isConnectedToChat = false;
let reconnectTimer = null;

function sendChatMessageToRenderer(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('chat-message', message);
  }
  if (process.env.SCO_CHAT_LOG && message && message.type === 'message') {
    bootLog('CHAT LOG: ' + JSON.stringify({ u: message.username, m: message.message, badges: message.badges, color: message.color }));
    if (mainWindow && !mainWindow.isDestroyed()) {
      setTimeout(() => {
        mainWindow.webContents.executeJavaScript(`
          (function(){
            var els = document.querySelectorAll('.chat-message');
            return els.length;
          })()
        `).then((n) => bootLog('CHAT LOG: .chat-message en DOM = ' + n)).catch((e) => bootLog('CHAT LOG DOM error: ' + e.message));
      }, 500);
    }
  }
}

function connectToTwitchChat(channel, token) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (twitchClient) {
    twitchClient.destroy();
    twitchClient = null;
  }

  if (!channel || config.platform === 'demo') {
    isConnectedToChat = false;
    sendChatMessageToRenderer({ type: 'status', connected: false, message: 'Modo demo o sin canal configurado' });
    return;
  }

  const cleanChannel = channel.replace(/^#/, '').toLowerCase();
  
  // Construir el IRC con credenciales (host/puerto sobreescribibles por env para pruebas)
  const ircHost = process.env.TWITCH_IRC_HOST || 'irc.chat.twitch.tv';
  const ircPort = Number(process.env.TWITCH_IRC_PORT) || 6667;
  const connectOpts = {
    host: ircHost,
    port: ircPort,
  };

  const client = net.createConnection(connectOpts, () => {
    bootLog(`Conectado a Twitch IRC para canal #${cleanChannel}`);
    
    // Solicitar capacidades de Twitch (badges, colores, comandos)
    client.write('CAP REQ :twitch.tv/commands\r\n');
    client.write('CAP REQ :twitch.tv/tags\r\n');
    
    // Enviar PASS y NICK
    let tokenStr = (token || '').trim();
    if (tokenStr && !tokenStr.startsWith('oauth:')) {
      tokenStr = 'oauth:' + tokenStr;
    }
    if (tokenStr) {
      client.write(`PASS ${tokenStr}\r\n`);
    }
    const nick = (config.username || '').trim() || 'justin';
    client.write(`NICK ${nick}\r\n`);
    client.write(`JOIN #${cleanChannel}\r\n`);
  });

  let buffer = '';
  client.setEncoding('utf8');

  client.on('data', (data) => {
    buffer += data;
    const lines = buffer.split('\r\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line) continue;
      
      // PING/PONG
      if (line.startsWith('PING')) {
        client.write(`PONG ${line.slice(4)}\r\n`);
        continue;
      }

      // Parsear PRIVMSG (mensaje del chat) con tags de Twitch
      let tagsStr = '';
      let privmsgLine = line;
      if (privmsgLine.startsWith('@')) {
        const spaceIdx = privmsgLine.indexOf(' ');
        if (spaceIdx > 0) {
          tagsStr = privmsgLine.slice(1, spaceIdx);
          privmsgLine = privmsgLine.slice(spaceIdx + 1);
        }
      }

      const match = privmsgLine.match(/^:([^!]+)![^ ]+ PRIVMSG [^:]*:(.*)$/);
      if (match) {
        const username = match[1];
        const message = match[2];
        
        const badges = {};
        let color = null;
        if (tagsStr) {
          tagsStr.split(';').forEach(tag => {
            const eq = tag.indexOf('=');
            if (eq === -1) return;
            const key = tag.slice(0, eq);
            const val = tag.slice(eq + 1);
            if (key === 'badges') {
              val.split(',').forEach(b => {
                const slash = b.indexOf('/');
                if (slash > 0) {
                  const bName = b.slice(0, slash);
                  const bVer = b.slice(slash + 1);
                  if (bName) badges[bName] = bVer;
                }
              });
            } else if (key === 'color' && val) {
              color = val;
            }
          });
        }
        
        sendChatMessageToRenderer({
          type: 'message',
          username: username,
          message: message,
          badges: badges,
          color: color
        });
      }

      // Notificar cuando se une al canal
      if (line.includes('End of /NAMES list')) {
        isConnectedToChat = true;
        sendChatMessageToRenderer({ type: 'status', connected: true, message: `Conectado a #${cleanChannel}` });
      }
    }
  });

  client.on('error', (err) => {
    bootLog(`Error IRC: ${err.message}`);
    isConnectedToChat = false;
    sendChatMessageToRenderer({ type: 'status', connected: false, message: `Error: ${err.message}` });
  });

  client.on('close', () => {
    bootLog('Conexión IRC cerrada');
    isConnectedToChat = false;
    // Reconectar automáticamente si hay config de chat activa
    if (config.channel && config.platform !== 'demo') {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        bootLog('Intentando reconectar al chat...');
        connectToTwitchChat(config.channel, config.token);
      }, 3000);
    }
  });

  twitchClient = client;
}

function disconnectFromChat() {
  if (twitchClient) {
    twitchClient.destroy();
    twitchClient = null;
  }
  isConnectedToChat = false;
}

// Reconectar al chat cuando cambie la config
ipcMain.handle('connect-chat', () => {
  connectToTwitchChat(config.channel, config.token);
  return { connected: isConnectedToChat };
});

ipcMain.handle('disconnect-chat', () => {
  disconnectFromChat();
  return { connected: false };
});
ipcMain.handle('get-chat-status', () => ({ connected: isConnectedToChat }));

ipcMain.handle('open-config-folder', () => {
  const folder = path.dirname(CONFIG_PATH || path.join(app.getPath('userData'), 'config.json'));
  shell.openPath(folder);
  return { folder };
});
