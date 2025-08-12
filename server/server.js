import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import os from 'os';

const app = express();
app.use(cors());
app.use(express.static('client'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

/* ---- Config ---- */
const MAX_PLAYERS_PER_ROOM = 200; // change/remove if you don't want a cap

/* ---- Utils ---- */
function mulberry32(a) {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}
function generateCard(seed, playerId) {
  const rng = mulberry32((seed ^ strHash(playerId)) >>> 0);
  const ranges = [[1,15],[16,30],[31,45],[46,60],[61,75]];
  const cols = ranges.map((r,ci) => {
    const pool=[]; for (let n=r[0]; n<=r[1]; n++) pool.push(n);
    const picks = (ci===2?4:5), out=[];
    for (let i=0;i<picks;i++){ const k = Math.floor(rng()*pool.length); out.push(pool.splice(k,1)[0]); }
    out.sort((a,b)=>a-b); return out;
  });
  const arr = Array(25).fill(0);
  let idx=0;
  for (let r=0;r<5;r++){
    for (let c=0;c<5;c++){
      arr[idx++] = (r===2 && c===2) ? 0 : cols[c].shift();
    }
  }
  return arr;
}
function getLines(){
  const L=[];
  for (let r=0;r<5;r++) L.push([r*5, r*5+1, r*5+2, r*5+3, r*5+4]);   // 0..4 rows
  for (let c=0;c<5;c++) L.push([c, c+5, c+10, c+15, c+20]);         // 5..9 cols
  L.push([0,6,12,18,24]);                                           // 10 diag
  L.push([4,8,12,16,20]);                                           // 11 diag
  return L;
}
const ALL_LINES = getLines();

/* Room shape:
{
  id, hostId, hostKey, seed,
  called:number[],
  running:boolean,
  interval:number, autoMark:boolean,
  players: Map<socketId,{name,card:number[],marks:Set<number>,lines:Set<string>,fullHouse:boolean}>,
  timer:null|NodeJS.Timer,
  winner:null|{ id, name, lineType, lineIndex }
}
*/
const ROOMS = new Map();

/* ---- helpers ---- */
function makeRoomId(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s=''; for (let i=0;i<5;i++) s+=chars[Math.floor(Math.random()*chars.length)];
  return s;
}
function makeHostKey(){
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
function emitState(room){
  const pubPlayers = {};
  for (const [id,p] of room.players){
    pubPlayers[id] = { name:p.name, lines:[...p.lines], fullHouse:!!p.fullHouse };
  }
  io.to(room.id).emit('room_state', {
    id:room.id, hostId:room.hostId,
    called:room.called, running:room.running,
    interval:room.interval, autoMark:room.autoMark,
    players:pubPlayers,
    winner: room.winner || null
  });
}
function nextBagNumber(room){
  if (room.winner) return null;
  const called = new Set(room.called);
  const bag=[]; for (let i=1;i<=75;i++) if(!called.has(i)) bag.push(i);
  if (!bag.length) return null;
  return bag[Math.floor(Math.random()*bag.length)];
}
function clearTimer(room){
  if (room.timer){ clearInterval(room.timer); room.timer=null; }
}
function startTimer(room){
  clearTimer(room);
  room.timer = setInterval(() => {
    if (!room.running) return;
    const ok = callNext(room);
    if (!ok){ room.running=false; clearTimer(room); emitState(room); }
  }, room.interval);
}

/* ---- line checking ----
   Returns { newRowOrCol: boolean } to let caller stop the game on first row/col.
*/
function checkLinesAndFull(room, playerId, announce=false){
  const p = room.players.get(playerId); if (!p) return { newRowOrCol:false };
  let newRowOrCol = false;

  ALL_LINES.forEach((line, i) => {
    const ok = line.every(idx => idx===12 || p.marks.has(idx));
    if (ok && !p.lines.has(String(i))){
      p.lines.add(String(i));
      if (i < 10) newRowOrCol = true; // 0..4 rows, 5..9 cols
      if (announce) io.to(room.id).emit('line_won', { playerId, lineIndex:i });
    }
  });

  // full house (doesn't stop the game here; you can choose to)
  let all=true;
  for (let i=0;i<25;i++){ if(i===12) continue; if(!p.marks.has(i)){ all=false; break; } }
  if (all && !p.fullHouse){
    p.fullHouse = true;
    if (announce) io.to(room.id).emit('full_house', { playerId });
  }
  return { newRowOrCol };
}

/* ---- when a number is called ----
   Auto-marks (if enabled), checks winners, stops loop if row/col completed.
*/
function callNext(room){
  if (room.winner) return false;
  const n = nextBagNumber(room);
  if (n == null){ io.to(room.id).emit('no_more'); return false; }

  room.called.push(n);
  io.to(room.id).emit('number_called', n);

  // Server-side automark so line checks are authoritative
  if (room.autoMark){
    for (const [pid,p] of room.players){
      for (let i=0;i<25;i++){
        if (i===12) continue;
        if (p.card[i] === n) p.marks.add(i);
      }
    }
  }

  // After marking, check for new winners
  for (const [pid,p] of room.players){
    const { newRowOrCol } = checkLinesAndFull(room, pid, false);
    if (newRowOrCol && !room.winner){
      // Decide row/col type for message (we don't compute exact which here; optional)
      room.winner = { id: pid, name: p.name, lineType: 'row_or_col', lineIndex: -1 };
      room.running = false;
      clearTimer(room);
      io.to(room.id).emit('line_winner', { playerId: pid, name: p.name });
      break;
    }
  }

  emitState(room);
  return !room.winner; // keep loop only if no winner
}

/* ---- sockets ---- */
io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('create_room', ({name})=>{
    const id = makeRoomId();
    const seed = (Math.random()*0xffffffff)>>>0;
    const hostKey = makeHostKey();
    const room = {
      id, hostId:socket.id, hostKey, seed,
      called:[], running:false, interval:2500, autoMark:true,
      players:new Map(), timer:null, winner:null
    };
    ROOMS.set(id, room);
    socket.join(id);
    currentRoom = id;

    const card = generateCard(seed, socket.id);
    room.players.set(socket.id, { name:name||'Host', card, marks:new Set([12]), lines:new Set(), fullHouse:false });

    socket.emit('room_created', { id, seed, hostKey });
    socket.emit('joined', { id, seed, card }); // host gets their card
    emitState(room);
  });

  socket.on('join_room', ({roomId, name, hostKey})=>{
    const room = ROOMS.get(roomId);
    if (!room){ socket.emit('error_msg','Room not found'); return; }
    if (room.players.size >= MAX_PLAYERS_PER_ROOM){ socket.emit('error_msg','Room full'); return; }
    socket.join(roomId); currentRoom = roomId;

    const card = generateCard(room.seed, socket.id);
    room.players.set(socket.id, { name:name||'Player', card, marks:new Set([12]), lines:new Set(), fullHouse:false });
    // If this joiner presents the valid hostKey, reclaim host role
    if (hostKey && hostKey === room.hostKey){ room.hostId = socket.id; }
    else if (room.hostId == null) { room.hostId = socket.id; }
    socket.emit('joined', { id:roomId, seed:room.seed, card });
    emitState(room);
  });

  // --- Host controls ---
  socket.on('host_start', ()=>{
    const room = ROOMS.get(currentRoom); if (!room || room.hostId!==socket.id) return;
    if (room.winner) return; // locked until reset
    room.running = true;
    callNext(room);  // immediate
    if (!room.winner) startTimer(room);
    emitState(room);
  });

  socket.on('host_pause', ()=>{
    const room = ROOMS.get(currentRoom); if (!room || room.hostId!==socket.id) return;
    room.running = false; clearTimer(room); emitState(room);
  });

  socket.on('host_reset', ()=>{
    const room = ROOMS.get(currentRoom); if (!room || room.hostId!==socket.id) return;
    // New seed for a fresh set of cards
    room.seed = (Math.random()*0xffffffff)>>>0;
    room.called=[]; room.running=false; room.winner=null;
    clearTimer(room);
    // Regenerate cards for all players and notify them
    for (const [pid,p] of room.players.entries()){
      const newCard = generateCard(room.seed, pid);
      p.card = newCard;
      p.marks = new Set([12]); p.lines = new Set(); p.fullHouse = false;
      io.to(pid).emit('new_card', { card: newCard });
    }
    emitState(room);
    // Immediately start a new game
    room.running = true;
    const stillGoing = callNext(room);
    if (stillGoing) startTimer(room);
    emitState(room);
  });

  socket.on('host_set_interval', (ms)=>{
    const room = ROOMS.get(currentRoom); if (!room || room.hostId!==socket.id) return;
    room.interval = Math.max(300, Math.min(6000, ms|0));
    if (room.running) startTimer(room);
    emitState(room);
  });

  socket.on('host_set_automark', (val)=>{
    const room = ROOMS.get(currentRoom); if (!room || room.hostId!==socket.id) return;
    room.autoMark = !!val; emitState(room);
  });

  // Optional manual step
  socket.on('host_call_next', ()=>{
    const room = ROOMS.get(currentRoom); if (!room || room.hostId!==socket.id) return;
    if (!room.winner) callNext(room);
  });

  // Player marks (manual). Only valid for already-called numbers.
  socket.on('mark_cell', (idx)=>{
    const room = ROOMS.get(currentRoom); if (!room) return;
    const p = room.players.get(socket.id); if (!p) return;
    if (idx===12) p.marks.add(12);
    else {
      const num = p.card[idx];
      if (room.called.includes(num)) p.marks.add(idx);
    }
    const { newRowOrCol } = checkLinesAndFull(room, socket.id, false);
    if (newRowOrCol && !room.winner){
      room.winner = { id: socket.id, name: p.name, lineType: 'row_or_col', lineIndex: -1 };
      room.running = false; clearTimer(room);
      io.to(room.id).emit('line_winner', { playerId: socket.id, name: p.name });
    }
    emitState(room);
  });

  socket.on('unmark_cell', (idx)=>{
    const room = ROOMS.get(currentRoom); if (!room) return;
    const p = room.players.get(socket.id); if (!p) return;
    if (idx!==12) p.marks.delete(idx);
    checkLinesAndFull(room, socket.id, false);
    emitState(room);
  });

  socket.on('claim_line', ()=>{
    const room = ROOMS.get(currentRoom); if (!room) return;
    const { newRowOrCol } = checkLinesAndFull(room, socket.id, true);
    if (newRowOrCol && !room.winner){
      const p = room.players.get(socket.id);
      room.winner = { id: socket.id, name: p.name, lineType: 'row_or_col', lineIndex: -1 };
      room.running = false; clearTimer(room);
      io.to(room.id).emit('line_winner', { playerId: socket.id, name: p.name });
    }
    emitState(room);
  });

  socket.on('disconnect', ()=>{
    if (!currentRoom) return;
    const room = ROOMS.get(currentRoom);
    if (!room) return;

    room.players.delete(socket.id);
    if (room.hostId === socket.id){
      // Keep hostId as-is; the real host can reclaim on next join using hostKey
      // If absolutely nobody is left, leave room as-is to allow reconnects
    }
    emitState(room);
  });
});

// Helper: get local IPv4 addresses for logging
function getLocalIPv4Addresses() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      const familyV4 = typeof net.family === 'string' ? net.family === 'IPv4' : net.family === 4;
      if (familyV4 && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

const port = process.env.PORT || 3000;
server.listen(port, '0.0.0.0', () => {
  const ips = getLocalIPv4Addresses();
  console.log('Server listening:');
  console.log(' - Local:    http://localhost:' + port);
  ips.forEach(ip => console.log(' - Network:  http://' + ip + ':' + port));
});
