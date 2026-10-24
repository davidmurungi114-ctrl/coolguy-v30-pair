const express = require('express');
const cors = require('cors');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, Browsers, delay, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const PORT = 25410;

const activeSockets = new Map();

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/pair', async (req, res) => {
  let number = req.query.number;
  if (!number) return res.status(400).json({ error: 'Number required' });
  number = number.replace(/[^0-9]/g, '');
  if (number.length < 10) return res.status(400).json({ error: 'Invalid number' });
  const sessionId = `${number}_${Date.now()}`;
  const authFolder = `./auth_${sessionId}`;
  try {
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
      },
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: Browsers.macOS("Chrome"),
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 10000,
    });
    activeSockets.set(sessionId, sock);
    sock.ev.on('creds.update', saveCreds);

    // >>> ADDED: SEND TO INBOX <<<
    sock.ev.on('connection.update', async (update) => {
      const { connection } = update;
      if (connection === 'open') {
        console.log(`✅ ${number} Connected! Sending to inbox...`);
        await delay(3000);
        try {
          const credsFile = fs.readFileSync(path.join(authFolder, 'creds.json'));
          const sessionID = Buffer.from(credsFile).toString('base64');

          await sock.sendMessage(`${number}@s.whatsapp.net`, {
            text: `*🔴 COOLGUY-MD V30 CONNECTED* ✅\n\n*SESSION_ID:*\nCOOLGUY_V30_${sessionID}\n\nCopy this and paste in your bot.\n\nOwner: 256750765838 Kampala 🇺🇬`
          });

          await sock.sendMessage(`${number}@s.whatsapp.net`, {
            document: credsFile,
            mimetype: "application/json",
            fileName: "creds.json",
            caption: "COOLGUY V30 creds.json"
          });

          await delay(2000);
          fs.rmSync(authFolder, { recursive: true, force: true });
          try { sock.end(); } catch {}
          activeSockets.delete(sessionId);
        } catch (e) { console.error(e); }
      }
    });

    if (!sock.authState.creds.registered) {
      await delay(4000);
      let rawCode = await sock.requestPairingCode(number);
      let formattedCode = rawCode.match(/.{1,4}/g)?.join('-').toUpperCase() || rawCode.toUpperCase();
      console.log(`Code ${formattedCode} for ${number}`);
      res.json({ code: formattedCode, raw: rawCode, expiresIn: 120 });
      setTimeout(() => {
        try {
          if (activeSockets.has(sessionId)) {
            try { activeSockets.get(sessionId).end(); } catch {}
            activeSockets.delete(sessionId);
          }
          if (fs.existsSync(authFolder)) fs.rmSync(authFolder, { recursive: true, force: true });
        } catch {}
      }, 120000);
    } else {
      res.status(400).json({ error: 'Already registered' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
    try { fs.rmSync(authFolder, { recursive: true, force: true }); } catch {}
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`COOLGUY V30 LIVE on ${PORT} WITH INBOX`));
