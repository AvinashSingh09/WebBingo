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

// Film database - you can modify these film names as needed
const FILM_DATABASE = [
  // Action Movies
  "The Dark Knight", "Mad Max: Fury Road", "John Wick", "Die Hard", "Terminator 2",
  "The Matrix", "Gladiator", "Heat", "Casino Royale", "Mission Impossible",
  
  // Drama Movies
  "The Godfather", "Shawshank Redemption", "Schindler's List", "Forrest Gump", "Goodfellas",
  "Pulp Fiction", "The Departed", "There Will Be Blood", "No Country for Old Men", "Taxi Driver",
  
  // Comedy Movies
  "The Grand Budapest Hotel", "Superbad", "Anchorman", "The Hangover", "Borat",
  "Tropic Thunder", "Wedding Crashers", "Step Brothers", "Zoolander", "Dumb and Dumber",
  
  // Horror Movies
  "The Exorcist", "Halloween", "A Nightmare on Elm Street", "The Shining", "Psycho",
  "Scream", "Get Out", "Hereditary", "The Conjuring", "It Follows",
  
  // Sci-Fi Movies
  "Blade Runner", "Alien", "Star Wars", "Interstellar", "Inception",
  "2001: A Space Odyssey", "The Thing", "Arrival", "Ex Machina", "Minority Report",
  
  // Romance Movies
  "Casablanca", "The Notebook", "Titanic", "When Harry Met Sally", "Pretty Woman",
  "La La Land", "Eternal Sunshine", "Before Sunset", "Ghost", "Dirty Dancing",
  
  // Thriller Movies
  "Seven", "Silence of the Lambs", "Zodiac", "Gone Girl", "Shutter Island",
  "The Prestige", "Memento", "North by Northwest", "Vertigo", "Rear Window",
  
  // Animation Movies
  "Toy Story", "The Lion King", "Finding Nemo", "Spirited Away", "Up",
  "WALL-E", "Inside Out", "Coco", "Frozen", "Moana",
  
  // War Movies
  "Saving Private Ryan", "Apocalypse Now", "Full Metal Jacket", "Platoon", "Black Hawk Down",
  "Hacksaw Ridge", "1917", "Dunkirk", "We Were Soldiers", "Born on the Fourth of July"
];

function generateCard(seed, playerId) {
  const rng = mulberry32((seed ^ strHash(playerId)) >>> 0);
  
  // Create a shuffled copy of the film database for this card
  const availableFilms = [...FILM_DATABASE];
  for (let i = availableFilms.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [availableFilms[i], availableFilms[j]] = [availableFilms[j], availableFilms[i]];
  }
  
  // Create 3x9 grid (27 cells total)
  const arr = Array(27).fill(null); // Use null for empty cells
  
  // For each row (3 rows total), fill only 5 random positions with films
  let filmIndex = 0;
  for (let row = 0; row < 3; row++) {
    // Generate 5 random positions in this row (0-8)
    const positions = [];
    while (positions.length < 5) {
      const pos = Math.floor(rng() * 9);
      if (!positions.includes(pos)) {
        positions.push(pos);
      }
    }
    
    // Fill those positions with films
    positions.forEach(pos => {
      const cellIndex = row * 9 + pos;
      arr[cellIndex] = availableFilms[filmIndex++];
    });
  }
  
  return arr;
}
function getLines(){
  const L=[];
  // 3 horizontal rows (each row has 9 cells)
  for (let r=0;r<3;r++) {
    const row = [];
    for (let c=0;c<9;c++) {
      row.push(r*9 + c);
    }
    L.push(row);
  }
  
  // 9 vertical columns (each column has 3 cells)
  for (let c=0;c<9;c++) {
    L.push([c, c+9, c+18]);
  }
  
  // No diagonal lines for 3x9 grid
  return L;
}
const ALL_LINES = getLines();

/* Room shape:
{
  id, hostId, hostKey, seed,
  called:number[],
  running:boolean,
  interval:number, autoMark:boolean,
  players: Map<socketId,{name,card:number[],marks:Set<number>,lines:Set<string>,fullHouse:boolean,playAgainVote:boolean}>,
  timer:null|NodeJS.Timer,
  winner:null|{ id, name, lineType, lineIndex },
  gameEnded: boolean,
  playAgainVotes: Set<socketId>
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
    pubPlayers[id] = { 
      name:p.name, 
      lines:[...p.lines], 
      fullHouse:!!p.fullHouse,
      playAgainVote: !!p.playAgainVote
    };
  }
  io.to(room.id).emit('room_state', {
    id:room.id, hostId:room.hostId,
    called:room.called, running:room.running,
    interval:room.interval, autoMark:room.autoMark,
    players:pubPlayers,
    winner: room.winner || null,
    gameEnded: !!room.gameEnded,
    playAgainVotes: room.playAgainVotes ? room.playAgainVotes.size : 0,
    totalPlayers: room.players.size
  });
}
function nextBagFilm(room){
  if (room.winner) return null;
  const called = new Set(room.called);
  
  // Get all films that appear on any player's card and haven't been called yet
  const availableFilms = new Set();
  for (const [id, player] of room.players) {
    for (const film of player.card) {
      if (film && !called.has(film)) {
        availableFilms.add(film);
      }
    }
  }
  
  const bag = Array.from(availableFilms);
  if (!bag.length) return null;
  return bag[Math.floor(Math.random() * bag.length)];
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
  const p = room.players.get(playerId); if (!p) return { newFullHouse:false };

  // Only check for full house - player must mark all films on their card to win
  let allFilmsMarked = true;
  for (let i = 0; i < 27; i++) {
    // Only check cells that have films (not empty cells)
    if (p.card[i] && !p.marks.has(i)) {
      allFilmsMarked = false;
      break;
    }
  }
  
  if (allFilmsMarked && !p.fullHouse) {
    p.fullHouse = true;
    if (announce) io.to(room.id).emit('full_house', { playerId });
    return { newFullHouse: true };
  }
  
  return { newFullHouse: false };
}

/* ---- when a number is called ----
   Auto-marks (if enabled), checks winners, stops loop if row/col completed.
*/
function callNext(room){
  if (room.winner) return false;
  const film = nextBagFilm(room);
  if (film == null){ io.to(room.id).emit('no_more'); return false; }

  room.called.push(film);
  io.to(room.id).emit('film_called', film);

  // Server-side automark so win checks are authoritative
  if (room.autoMark){
    for (const [pid,p] of room.players){
      for (let i=0;i<27;i++){
        if (p.card[i] === film) p.marks.add(i);
      }
    }
  }

  // After marking, check for new winners (full house only)
  for (const [pid,p] of room.players){
    const { newFullHouse } = checkLinesAndFull(room, pid, false);
    if (newFullHouse && !room.winner){
      // Player won by marking all films
      room.winner = { id: pid, name: p.name, lineType: 'fullhouse', lineIndex: -1 };
      room.running = false;
      room.gameEnded = true;
      clearTimer(room);
      io.to(room.id).emit('game_winner', { playerId: pid, name: p.name });
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
      players:new Map(), timer:null, winner:null,
      gameEnded:false, playAgainVotes:new Set()
    };
    ROOMS.set(id, room);
    socket.join(id);
    currentRoom = id;

    const card = generateCard(seed, socket.id);
    room.players.set(socket.id, { name:name||'Host', card, marks:new Set(), lines:new Set(), fullHouse:false, playAgainVote:false });

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
    room.players.set(socket.id, { name:name||'Player', card, marks:new Set(), lines:new Set(), fullHouse:false, playAgainVote:false });
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
    room.called=[]; room.running=false; room.winner=null; room.gameEnded=false;
    room.playAgainVotes.clear();
    clearTimer(room);
    // Regenerate cards for all players and notify them
    for (const [pid,p] of room.players.entries()){
      const newCard = generateCard(room.seed, pid);
      p.card = newCard;
      p.marks = new Set([12]); p.lines = new Set(); p.fullHouse = false; p.playAgainVote = false;
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

  // Player marks (manual). Only valid for already-called films.
  socket.on('mark_cell', (idx)=>{
    const room = ROOMS.get(currentRoom); if (!room) return;
    const p = room.players.get(socket.id); if (!p) return;
    const film = p.card[idx];
    if (film && room.called.includes(film)) p.marks.add(idx);
    const { newFullHouse } = checkLinesAndFull(room, socket.id, false);
    if (newFullHouse && !room.winner){
      room.winner = { id: socket.id, name: p.name, lineType: 'fullhouse', lineIndex: -1 };
      room.running = false; room.gameEnded = true; clearTimer(room);
      io.to(room.id).emit('game_winner', { playerId: socket.id, name: p.name });
    }
    emitState(room);
  });

  socket.on('unmark_cell', (idx)=>{
    const room = ROOMS.get(currentRoom); if (!room) return;
    const p = room.players.get(socket.id); if (!p) return;
    p.marks.delete(idx);
    checkLinesAndFull(room, socket.id, false);
    emitState(room);
  });

  socket.on('claim_full_house', ()=>{
    const room = ROOMS.get(currentRoom); if (!room) return;
    const { newFullHouse } = checkLinesAndFull(room, socket.id, true);
    if (newFullHouse && !room.winner){
      const p = room.players.get(socket.id);
      room.winner = { id: socket.id, name: p.name, lineType: 'fullhouse', lineIndex: -1 };
      room.running = false; room.gameEnded = true; clearTimer(room);
      io.to(room.id).emit('game_winner', { playerId: socket.id, name: p.name });
    }
    emitState(room);
  });

  // Play again voting system
  socket.on('vote_play_again', ()=>{
    const room = ROOMS.get(currentRoom); if (!room || !room.gameEnded) return;
    const p = room.players.get(socket.id); if (!p) return;
    
    if (!p.playAgainVote) {
      p.playAgainVote = true;
      room.playAgainVotes.add(socket.id);
      io.to(room.id).emit('play_again_vote', { playerId: socket.id, name: p.name });
      
      // Auto-restart if majority (>50%) or all players voted to play again
      const totalPlayers = room.players.size;
      const votesNeeded = Math.ceil(totalPlayers * 0.6); // 60% threshold
      
      if (room.playAgainVotes.size >= votesNeeded) {
        // Reset the game automatically
        setTimeout(() => {
          // New seed for a fresh set of cards
          room.seed = (Math.random()*0xffffffff)>>>0;
          room.called=[]; room.running=false; room.winner=null; room.gameEnded=false;
          room.playAgainVotes.clear();
          clearTimer(room);
          
          // Regenerate cards for all players and notify them
          for (const [pid,p] of room.players.entries()){
            const newCard = generateCard(room.seed, pid);
            p.card = newCard;
            p.marks = new Set([12]); p.lines = new Set(); p.fullHouse = false; p.playAgainVote = false;
            io.to(pid).emit('new_card', { card: newCard });
          }
          
          // Notify players that new game is starting
          io.to(room.id).emit('new_game_starting');
          emitState(room);
          
          // Start the new game
          room.running = true;
          const stillGoing = callNext(room);
          if (stillGoing) startTimer(room);
          emitState(room);
        }, 2000); // 2 second delay to show the vote result
      }
    }
    emitState(room);
  });

  socket.on('vote_exit', ()=>{
    const room = ROOMS.get(currentRoom); if (!room) return;
    socket.leave(currentRoom);
    room.players.delete(socket.id);
    room.playAgainVotes.delete(socket.id);
    emitState(room);
  });

  socket.on('disconnect', ()=>{
    if (!currentRoom) return;
    const room = ROOMS.get(currentRoom);
    if (!room) return;

    room.players.delete(socket.id);
    room.playAgainVotes.delete(socket.id);
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
