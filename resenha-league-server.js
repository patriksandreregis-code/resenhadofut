const crypto = require('crypto');

const rooms = new Map();
const MAX_ROOMS = 100;
const MAX_PLAYERS = 8;
const send = (ws, data) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(data)); };
const cleanName = value => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 16);
const validName = value => /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,15}$/u.test(value);
const makeCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[crypto.randomInt(alphabet.length)];
  return code;
};
function authorized(req) {
  const password = process.env.LEAGUE_TEST_PASSWORD;
  if (!password) return false;
  const cookie = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('league_test_access='));
  if (!cookie) return false;
  const supplied = cookie.slice('league_test_access='.length);
  const expected = crypto.createHmac('sha256', password).update('resenha-league-lab-cookie-v1').digest('hex');
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function publicRooms() {
  return [...rooms.values()].filter(r => r.visibility === 'public' && r.phase === 'lobby')
    .sort((a,b) => b.updatedAt-a.updatedAt)
    .map(r => ({ code:r.code, title:r.title, host:r.players.find(p=>p.id===r.host)?.name || 'Anfitrião', players:r.players.length, maxPlayers:MAX_PLAYERS }));
}
function state(room, player) {
  return { t:'state', room:{ code:room.code, title:room.title, visibility:room.visibility, phase:room.phase,
    host:room.host, players:room.players.map(p=>({id:p.id,name:p.name,on:!!p.ws})), maxPlayers:MAX_PLAYERS },
    you:player && player.id, isHost:!!(player && player.id===room.host) };
}
function broadcast(room) {
  room.updatedAt = Date.now();
  for (const player of room.players) send(player.ws, state(room, player));
  const listing = { t:'rooms', rooms:publicRooms() };
  for (const ws of clients) send(ws, listing);
}
const clients = new Set();
function connect(ws, req) {
  if (!authorized(req)) { ws.close(1008, 'Acesso restrito ao laboratório'); return; }
  clients.add(ws);
  let currentRoom = null, player = null, count = 0, windowStart = Date.now();
  const fail = message => send(ws, {t:'error',message});
  send(ws,{t:'rooms',rooms:publicRooms()});
  ws.on('message', raw => {
    const now=Date.now();
    if(now-windowStart>1000){windowStart=now;count=0;}
    if(++count>20){ws.close(1008,'Muitas mensagens');return;}
    let m; try{m=JSON.parse(raw);}catch{return fail('Mensagem inválida.');}
    if(m.t==='list'){send(ws,{t:'rooms',rooms:publicRooms()});return;}
    if(m.t==='create'){
      if(currentRoom) return fail('Saia da sala atual antes de criar outra.');
      if(rooms.size>=MAX_ROOMS) return fail('Limite de salas de teste atingido.');
      const name=cleanName(m.name), title=String(m.title||'Sala do Resenha League').trim().slice(0,36)||'Sala do Resenha League';
      if(!validName(name)) return fail('Use um apelido de 2 a 16 caracteres.');
      const visibility=m.visibility==='private'?'private':'public';
      let code; do{code=makeCode();}while(rooms.has(code));
      const room={code,title,visibility,phase:'lobby',host:null,players:[],updatedAt:now};
      const p={id:crypto.randomBytes(8).toString('hex'),name,ws}; room.players.push(p);room.host=p.id;
      rooms.set(code,room);currentRoom=room;player=p;broadcast(room);return;
    }
    if(m.t==='join'){
      if(currentRoom) return fail('Você já está em uma sala.');
      const code=String(m.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
      const room=rooms.get(code),name=cleanName(m.name);
      if(!validName(name)) return fail('Use um apelido de 2 a 16 caracteres.');
      if(!room) return fail('Sala não encontrada. Confira o código.');
      if(room.phase!=='lobby') return fail('Esta sala já iniciou.');
      if(room.players.length>=MAX_PLAYERS) return fail('Esta sala está cheia.');
      if(room.players.some(p=>p.name.toLowerCase()===name.toLowerCase())) return fail('Esse apelido já está sendo usado na sala.');
      const p={id:crypto.randomBytes(8).toString('hex'),name,ws};room.players.push(p);currentRoom=room;player=p;broadcast(room);return;
    }
    if(m.t==='leave'){
      if(!currentRoom||!player)return;
      const room=currentRoom;room.players=room.players.filter(p=>p!==player);
      if(room.host===player.id)room.host=room.players[0]?.id||null;
      currentRoom=null;player=null;
      if(!room.players.length)rooms.delete(room.code);else broadcast(room);
      send(ws,{t:'left'});return;
    }
    if(!currentRoom||!player)return;
    if(m.t==='start' && player.id===currentRoom.host){
      if(currentRoom.players.length<2)return fail('Convide pelo menos mais um participante para iniciar.');
      currentRoom.phase='auction-ready';broadcast(currentRoom);return;
    }
    if(m.t==='back' && player.id===currentRoom.host && currentRoom.phase==='auction-ready'){
      currentRoom.phase='lobby';broadcast(currentRoom);return;
    }
  });
  ws.on('close',()=>{
    clients.delete(ws);
    if(!currentRoom||!player)return;
    const room=currentRoom;
    room.players=room.players.filter(p=>p!==player);
    if(room.host===player.id)room.host=room.players[0]?.id||null;
    if(!room.players.length)rooms.delete(room.code);else broadcast(room);
  });
}
module.exports={connect};
