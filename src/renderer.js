const api = window.electronAPI;

const sampleUsers = [
  { name: 'Kira', color: '#ff6b6b', badges: ['sub'] },
  { name: 'DarkShadow', color: '#4ecdc4', badges: ['mod'] },
  { name: 'NeonRider', color: '#ffe66d', badges: [] },
  { name: 'StarGazer', color: '#a8e6cf', badges: ['vip'] },
  { name: 'PixelKnight', color: '#c7b198', badges: [] },
  { name: 'LunaByte', color: '#ff8b94', badges: ['sub'] },
  { name: 'CyberWolf', color: '#74b9ff', badges: [] },
  { name: 'NovaFlame', color: '#fd79a8', badges: ['sub', 'vip'] },
  { name: 'ZeroGravity', color: '#00cec9', badges: ['mod'] },
  { name: 'AetherBlade', color: '#6c5ce7', badges: [] },
];

const sampleMessages = [
  '¡Qué jugada increíble!',
  'Jajaja eso fue épico',
  'POV: eres el main',
  'gg wp',
  '¿Alguien sabe qué skin usa?',
  'Vamos carajo',
  'LUL',
  'Respa yaaaa',
  'Nice one!',
  'El chat está on fire hoy',
  'PogChamp',
  '¿Cuándo hace directo mañana?',
  'Ese movimiento fue pro',
  'Saltar ahí es suicidio lol',
  'Stream del año confirmado',
  'Wtf acaba de pasar',
  'Me voy al lobby que esto es mucho',
  'Hazlo de nuevo pls',
  'Ez clap',
  ' nivel Dios',
  'qué lag...',
  'Juega ranked ya!',
  'Ese fue clutch',
  'AYUDA NO PUEDO RESPIRAR DE LA RISA',
];

let config = {
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
};

let chatInterval = null;

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function applyConfig(next) {
  console.log('[renderer] applyConfig:', next);
  config = { ...config, ...next };

  const container = document.getElementById('chat-container');
  container.style.fontSize = `${config.fontSize}px`;
  container.style.fontFamily = config.fontFamily;
  container.style.color = config.textColor;
  container.style.setProperty('--msg-opacity', String(config.messageOpacity));

  document.documentElement.style.setProperty('--chat-bg', `rgba(${config.backgroundColor}, ${config.messageOpacity.toFixed(2)})`);
  document.documentElement.style.setProperty('--chat-text', config.textColor);

  if (!config.usernameColors) {
    document.documentElement.style.setProperty('--name-color', '#ffffff');
  } else {
    document.documentElement.style.removeProperty('--name-color');
  }

  while (container.children.length > config.maxMessages) {
    container.removeChild(container.firstChild);
  }

  restartInterval();
}

function restartInterval() {
  if (chatInterval) clearInterval(chatInterval);
  chatInterval = setInterval(() => {
    if (config.demoMode && Math.random() > 0.45) {
      addMessage();
    }
  }, config.messageInterval);
}

function createMessageElement(user, text) {
  const el = document.createElement('div');
  el.className = 'chat-message';

  let badgesHTML = '';
  if (config.showBadges && user.badges && user.badges.length > 0) {
    badgesHTML = user.badges
      .map(b => `<span class="badge ${b}">${b.toUpperCase()}</span>`)
      .join(' ');
  }

  const nameColor = config.usernameColors ? user.color : '#ffffff';

  el.innerHTML = `
    <div class="message-header">
      ${badgesHTML}
      <span class="username" style="color: ${nameColor}">${escapeHtml(user.name)}</span>
    </div>
    <div class="message-text">${escapeHtml(text)}</div>
  `;

  return el;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function addMessage(userOrName, text = null) {
  const container = document.getElementById('chat-container');
  
  // Si recibe un objeto tipo { username, message }, es un mensaje real del chat
  if (typeof userOrName === 'object' && userOrName !== null) {
    const msg = userOrName;
    
    // Ignorar mensajes de estado
    if (msg.type === 'status') {
      console.log('Chat status:', msg.message);
      return;
    }
    
    // Mensaje real del chat
    const badges = msg.badges || {};
    const badgesArray = Object.keys(badges).map(key => key.toLowerCase());
    
    // Usar el color de Twitch si está disponible, sino generar uno consistente
    const nameColor = config.usernameColors ? (msg.color || stringToColor(msg.username)) : '#ffffff';
    
    const msgEl = createMessageElement(
      { name: msg.username, color: nameColor, badges: badgesArray },
      msg.message
    );

    while (container.children.length >= config.maxMessages) {
      container.removeChild(container.firstChild);
    }

    container.appendChild(msgEl);

    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    });
    return;
  }
  
  // Mensaje demo (modo simulación)
  if (!config.demoMode) return;

  const user = randomItem(sampleUsers);
  const demoText = text || randomItem(sampleMessages);

  const msgEl = createMessageElement(user, demoText);

  while (container.children.length >= config.maxMessages) {
    container.removeChild(container.firstChild);
  }

  container.appendChild(msgEl);

  container.scrollTo({
    top: container.scrollHeight,
    behavior: 'smooth',
  });
}

// Generar color consistente a partir de un string
function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = hash % 360;
  return `hsl(${h}, 70%, 60%)`;
}

function updateStatus(isClickThrough) {
  const statusText = document.getElementById('status-text');
  const indicator = document.getElementById('status-indicator');

  if (isClickThrough) {
    statusText.textContent = '🔒 Click-Through ACTIVO (F2 para desactivar | F3 config)';
    indicator.classList.remove('active');
  } else {
    statusText.textContent = '🔓 Modo Interactivo (F2 para activar click-through)';
    indicator.classList.add('active');
  }
}

async function init() {
  const initial = await electronAPI.getConfig();
  applyConfig(initial);

  updateStatus(false);

  for (let i = 0; i < 5; i++) {
    setTimeout(() => addMessage(), i * 180);
  }

  electronAPI.onStatusChange((status) => updateStatus(status));

  electronAPI.onConfigUpdated((next) => applyConfig(next));
  
  // Escuchar mensajes del chat real
  electronAPI.onChatMessage((msg) => {
    addMessage(msg);
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'F2') {
    e.preventDefault();
    electronAPI.toggleClickThrough();
  }
  if (e.key === 'F3') {
    e.preventDefault();
    electronAPI.openSettings();
  }
});

init();
