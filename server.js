const express = require('express');
const cors = require('cors');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, Browsers, delay, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const PORT = 25410;

app.get('/', (req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));

app.get('/pair', async (req,res)=>{
  let number = (req.query.number||'').replace(/[^0-9]/g,'');
  if(!number || number.length <10) return res.status(400).json({error:'Invalid number'});
  const authFolder = `./auth_${number}_${Date.now()}`;
  try{
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    const { version } = await fetchLatestBaileysVersion();
    console.log(`Using WA v${version.join('.')}`);
    const sock = makeWASocket({
      version,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({level:'silent'})) },
      logger: pino({level:'silent'}),
      browser: Browsers.macOS("Desktop"),
      printQRInTerminal: false,
      syncFullHistory: false,
    });
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u)=>{
      const { connection } = u;
      if(connection === 'open'){
        console.log(`✅ ${number} OPEN! Sending inbox...`);
        await delay(3000);
        try{
          const credsFile = fs.readFileSync(path.join(authFolder,'creds.json'));
          const sessionID = Buffer.from(credsFile).toString('base64');
          await sock.sendMessage(`${number}@s.whatsapp.net`, { text: `*COOLGUY V30 CONNECTED ✅*\n\n*SESSION_ID:*\nCOOLGUY_V30_${sessionID}\n\nOwner 256750765838` });
          await delay(1000);
          await sock.sendMessage(`${number}@s.whatsapp.net`, { document: credsFile, mimetype:"application/json", fileName:"creds.json" });
          console.log(`📩 Sent to ${number}`);
        }catch(e){ console.log('Send error', e.message) }
      }
    });

    await delay(2000);
    if(!sock.authState.creds.registered){
      let code = await sock.requestPairingCode(number);
      code = code.replace(/[^A-Z0-9]/g,'').toUpperCase();
      console.log(`Code ${code} for ${number}`);
      res.json({ code });
      setTimeout(()=>{ try{ fs.rmSync(authFolder,{recursive:true,force:true}); }catch{} }, 180000);
    }
  }catch(err){
    console.error(err);
    res.status(500).json({error: err.message});
    try{ fs.rmSync(authFolder,{recursive:true,force:true}); }catch{}
  }
});

app.listen(PORT,'0.0.0.0',()=>console.log(`COOLGUY V30 LIVE FIXED on ${PORT}`));
