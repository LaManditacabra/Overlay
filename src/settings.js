const api = window.electronAPI;

const els = {
  platform: document.getElementById('platform'),
  channel: document.getElementById('channel'),
  username: document.getElementById('username'),
  linkTwitch: document.getElementById('link-twitch'),
  fontSize: document.getElementById('fontSize'),
  fontFamily: document.getElementById('fontFamily'),
  opacity: document.getElementById('opacity'),
  bgColor: document.getElementById('bgColor'),
  textColor: document.getElementById('textColor'),
  usernameColors: document.getElementById('usernameColors'),
  showBadges: document.getElementById('showBadges'),
  maxMessages: document.getElementById('maxMessages'),
  interval: document.getElementById('interval'),
  updateFeedUrl: document.getElementById('updateFeedUrl'),
  checkUpdates: document.getElementById('check-updates'),
  downloadUpdate: document.getElementById('download-update'),
  installUpdate: document.getElementById('install-update'),
  currentVersion: document.getElementById('current-version'),
  openConfigFolder: document.getElementById('open-config-folder'),
  updateStatus: document.getElementById('update-status'),
  save: document.getElementById('save'),
  reset: document.getElementById('reset'),
  status: document.getElementById('status'),
};

const DEFAULT_UPDATE_FEED_URL = 'https://github.com/LaManditacabra/Overlay/releases/latest';

function surfaceError(msg) {
  if (els && els.status) {
    els.status.textContent = 'Error JS: ' + msg;
    els.status.dataset.status = 'error';
  }
}

window.addEventListener('error', (e) => surfaceError(e.message || String(e.error)));
window.addEventListener('unhandledrejection', (e) => surfaceError((e.reason && e.reason.message) || 'promesa rechazada'));

function setStatus(text, state = 'idle') {
  els.status.textContent = text;
  els.status.dataset.status = state;
}

function setUpdateStatus(text, state = 'idle') {
  els.updateStatus.textContent = text;
  els.updateStatus.dataset.status = state;
}

function applyConfigToForm(config) {
  els.platform.value = config.platform ?? 'demo';
  els.channel.value = config.channel ?? '';
  els.username.value = config.username ?? '';
  els.demoMode.checked = !!config.demoMode;
  els.fontSize.value = config.fontSize ?? 13;
  els.fontFamily.value = config.fontFamily ?? 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
  els.opacity.value = config.messageOpacity ?? 0.85;
  els.bgColor.value = config.backgroundColor ?? '0, 0, 0';
  els.textColor.value = rgbToHex(config.textColor ?? '#f5f5f5');
  els.usernameColors.checked = config.usernameColors !== false;
  els.showBadges.checked = config.showBadges !== false;
  els.maxMessages.value = config.maxMessages ?? 35;
  els.interval.value = config.messageInterval ?? 2200;
  els.updateFeedUrl.value = config.updateFeedUrl ?? DEFAULT_UPDATE_FEED_URL;
}

function readForm() {
  return {
    platform: els.platform.value,
    channel: els.channel.value.trim(),
    username: els.username.value.trim(),
    demoMode: els.demoMode.checked,
    fontSize: Number(els.fontSize.value) || 13,
    fontFamily: els.fontFamily.value || 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
    messageOpacity: Math.min(1, Math.max(0.2, Number(els.opacity.value) || 0.85)),
    backgroundColor: els.bgColor.value.trim() || '0, 0, 0',
    textColor: hexToRgbString(els.textColor.value) || '#f5f5f5',
    usernameColors: els.usernameColors.checked,
    showBadges: els.showBadges.checked,
    maxMessages: Math.min(100, Math.max(5, Number(els.maxMessages.value) || 35)),
    messageInterval: Math.min(10000, Math.max(400, Number(els.interval.value) || 2200)),
    updateFeedUrl: els.updateFeedUrl.value.trim(),
  };
}

function rgbToHex(color) {
  if (!color) return '#000000';
  if (color.startsWith('#')) return color;
  const parts = color.split(',').map((n) => parseInt(n.trim(), 10));
  if (parts.length === 3) {
    return '#' + parts.map((n) => n.toString(16).padStart(2, '0')).join('');
  }
  return '#f5f5f5';
}

function hexToRgbString(hex) {
  if (!hex || hex.startsWith('rgb')) return '#f5f5f5';
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  if (Number.isNaN(n)) return '#f5f5f5';
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

async function saveConfig() {
  setStatus('Guardando...', 'idle');
  try {
    const next = readForm();
    await api.setConfig(next);
    setStatus('Guardado correctamente', 'ok');
  } catch (e) {
    setStatus('Error al guardar', 'error');
  }
}

async function resetConfig() {
  if (!confirm('¿Restablecer configuración a valores por defecto?')) return;
  const defaults = {
    platform: 'demo',
    channel: '',
    username: '',
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
    updateFeedUrl: DEFAULT_UPDATE_FEED_URL,
  };
  await api.setConfig(defaults);
  applyConfigToForm(defaults);
  setStatus('Configuración restablecida', 'ok');
}

async function init() {
  try {
    if (!api) {
      setStatus('ERROR: api no disponible', 'error');
      return;
    }

    const config = await api.getConfig();
    applyConfigToForm(config);
    try {
      const v = await api.getAppVersion();
      if (els.currentVersion) els.currentVersion.textContent = 'Versión actual: ' + (v || '?');
    } catch (e) { /* ignora */ }
  } catch (e) {
    setStatus('Error al cargar config', 'error');
  }
  setStatus('Configuración cargada', 'idle');
  setUpdateStatus('Sin comprobar', 'idle');

  // Refrescar el formulario si la config cambia desde el overlay
  api.onConfigUpdated((next) => {
    applyConfigToForm(next);
    setStatus('Configuración actualizada desde el overlay', 'ok');
  });

  // Recibir el estado real de las actualizaciones desde el proceso principal
  api.onUpdaterStatus?.((payload) => {
    if (!payload || !payload.status) return;
    if (payload.status === 'downloading') {
      setUpdateStatus(payload.message || 'Descargando...', 'idle');
      els.downloadUpdate.disabled = true;
      els.installUpdate.disabled = true;
    } else if (payload.status === 'downloaded') {
      setUpdateStatus(payload.message || 'Actualización lista', 'ok');
      els.downloadUpdate.disabled = true;
      els.installUpdate.disabled = false;
    } else if (payload.status === 'available') {
      setUpdateStatus(payload.message || 'Actualización disponible. Descargando...', 'ok');
      els.downloadUpdate.disabled = false;
      els.installUpdate.disabled = true;
    } else if (payload.status === 'none') {
      setUpdateStatus(payload.message || 'Sin actualizaciones', 'idle');
      els.downloadUpdate.disabled = true;
      els.installUpdate.disabled = true;
    } else if (payload.status === 'error') {
      setUpdateStatus(payload.message || 'Error', 'error');
      els.downloadUpdate.disabled = true;
      els.installUpdate.disabled = true;
    } else {
      setUpdateStatus(payload.message || 'Comprobando...', 'idle');
    }
  });

  if (els.linkTwitch) els.linkTwitch.addEventListener('click', async () => {
    els.linkTwitch.disabled = true;
    setStatus('Abriendo navegador para iniciar sesión en Twitch...', 'idle');
    try {
      const result = await api.twitchAuthStart({});
      if (result && result.token) {
        if (result.login) els.username.value = result.login;
        // Si no escribió un canal, usamos el suyo propio (#usuario) para que "solo login" funcione
        const channel = els.channel.value.trim() || ('#' + (result.login || ''));
        if (channel) els.channel.value = channel;
        await api.setConfig({ platform: 'twitch', token: result.token, username: result.login || els.username.value.trim(), channel });
        setStatus('Sesión iniciada en Twitch ✅', 'ok');
      } else {
        setStatus('Twitch no devolvió un token', 'error');
      }
    } catch (e) {
      setStatus('Error al iniciar sesión: ' + (e && e.message ? e.message : e), 'error');
    } finally {
      els.linkTwitch.disabled = false;
    }
  });
  if (els.reset) els.reset.addEventListener('click', resetConfig);
  if (els.openConfigFolder) els.openConfigFolder.addEventListener('click', async () => {
    try {
      await api.openConfigFolder();
    } catch (e) {
      setStatus('Error al abrir la carpeta', 'error');
    }
  });
  if (els.checkUpdates) els.checkUpdates.addEventListener('click', async () => {
    try {
      setUpdateStatus('Buscando actualizaciones...', 'idle');
      els.checkUpdates.disabled = true;
      await api.checkForUpdates();
    } catch (e) {
      setUpdateStatus('Error al buscar actualizaciones', 'error');
    } finally {
      els.checkUpdates.disabled = false;
    }
  });
  if (els.downloadUpdate) els.downloadUpdate.addEventListener('click', async () => {
    try {
      els.downloadUpdate.disabled = true;
      await api.downloadUpdate();
    } catch (e) {
      setUpdateStatus('Error al descargar la actualización', 'error');
    }
  });
  if (els.installUpdate) els.installUpdate.addEventListener('click', async () => {
    try {
      await api.installUpdate();
    } catch (e) {
      setUpdateStatus('Error al instalar actualización', 'error');
    }
  });
}

init();
