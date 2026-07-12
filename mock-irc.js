// Servidor IRC mock de Twitch para pruebas de chat en tiempo real.
// Habla suficiente del protocolo para que main.js se conecte y reciba PRIVMSG con tags.
const net = require('net');

const HOST = '127.0.0.1';
const PORT = 6667;

const server = net.createServer((socket) => {
  console.log('[mock] cliente conectado');
  let buf = '';

  const send = (s) => socket.write(s + '\r\n');

  // Twitch envía un mensaje de bienvenida y los comandos ACK
  socket.on('data', (data) => {
    buf += data.toString('utf8');
    const lines = buf.split('\r\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line) continue;
      console.log('[mock] <-', line);
      if (line.startsWith('CAP')) {
        // ACK de CAP REQ
        send(':tmi.twitch.tv CAP * ACK :twitch.tv/tags twitch.tv/commands');
      } else if (line.startsWith('PASS') || line.startsWith('NICK')) {
        // bienvenida estilo Twitch
        send(':tmi.twitch.tv 001 justin :Welcome, GLHF!');
      } else if (line.startsWith('JOIN')) {
        const chan = line.split(' ')[1];
        send(`:justin!justin@justin.tmi.twitch.tv JOIN ${chan}`);
        send(`:justin!justin@justin@justin.tmi.twitch.tv 353 justin = ${chan} :justin`);
        send(`:justin!justin@justin.tmi.twitch.tv 366 justin ${chan} :End of /NAMES list`);
        // Enviar algunos mensajes de chat con tags reales de Twitch
        setTimeout(() => sendMockMessages(send, chan), 800);
      } else if (line.startsWith('PING')) {
        send(`PONG ${line.slice(4)}`);
      }
    }
  });

  socket.on('close', () => console.log('[mock] cliente desconectado'));
  socket.on('error', (e) => console.log('[mock] error', e.message));
});

function sendMockMessages(send, chan) {
  const msgs = [
    `@badge-info=;badges=broadcaster/1,subscriber/0;color=#FF0000;display-name=Ninja;emotes=;flags=;id=1;mod=0;room-id=1;subscriber=0;turbo=0;user-id=1;user-type= :ninja!ninja@ninja.tmi.twitch.tv PRIVMSG ${chan} :PRIMER mensaje real desde el mock`,
    `@badge-info=;badges=moderator/1;color=#00FF00;display-name=ModBot;emotes=;flags=;id=2;mod=1;room-id=1;subscriber=1;turbo=0;user-id=2;user-type=mod :modbot!modbot@modbot.tmi.twitch.tv PRIVMSG ${chan} :Mensaje de un moderador`,
    `@badge-info=;badges=subscriber/3;color=#0000FF;display-name=ViewerX;emotes=;flags=;id=3;mod=0;room-id=1;subscriber=1;turbo=0;user-id=3;user-type= :viewerx!viewerx@viewerx.tmi.twitch.tv PRIVMSG ${chan} :Hola desde el chat en tiempo real`,
    `@badge-info=;badges=vip/1;color=;display-name=NoColorUser;emotes=;flags=;id=4;mod=0;room-id=1;subscriber=0;turbo=0;user-id=4;user-type= :nocoloruser!nocoloruser@nocoloruser.tmi.twitch.tv PRIVMSG ${chan} :Sin color (debe usar color generado)`,
  ];
  msgs.forEach((m, i) => setTimeout(() => {
    console.log('[mock] ->', m.slice(0, 60));
    send(m);
  }, i * 700));
}

server.listen(PORT, HOST, () => {
  console.log(`[mock] servidor IRC mock escuchando en ${HOST}:${PORT}`);
});
