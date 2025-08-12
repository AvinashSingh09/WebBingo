/* Multiplayer client (game page) */
(() => {
  const qs = (s,r=document)=>r.querySelector(s);
  const board = qs('#board');
  const ball = qs('#ball');
  const ballNum = qs('#ball-num');
  const statusEl = qs('#status');
  const calledGrid = qs('#called');
  const playersEl = qs('#players');

  const nameIn = qs('#name');
  const ridIn = qs('#roomId');
  const ridLabel = qs('#rid');
  const roleLabel = qs('#role');

  // Only visible in play if needed (should be hidden in markup for players)
  const btnCreate = qs('#create');
  const btnJoin = qs('#join');
  const btnStart = qs('#start');
  const btnPause = qs('#pause');
  const btnReset = qs('#reset');
  const ivalRange = qs('#interval');
  const ivalVal = qs('#ival');
  const automark = qs('#automark');

  const socket = io();
  let room = null;
  let card = Array(25).fill(0);
  let marks = new Set([12]);

  // Winner modal elements
  const overlay = qs('#winnerOverlay');
  const winnerNameEl = qs('#winnerName');
  const winnerOk = qs('#winnerOk');
  const winnerRestart = qs('#winnerRestart');
  const fx = qs('#fx');
  const ctx = fx ? fx.getContext('2d') : null;
  let confetti = [];
  let rafId = null;

  function resizeFx(){
    if(!fx) return;
    fx.width = window.innerWidth; fx.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeFx); resizeFx();

  // Detect if we arrived from lobby redirect with a room id
  const url = new URL(location.href);
  const forcedRoomId = url.searchParams.get('id');

  function setStatus(s){ statusEl.textContent = s; }
  function showBall(n){
    ball.classList.remove('show'); void ball.offsetWidth;
    ballNum.textContent = n; ball.classList.add('show');
  }
  function addChip(n){
    const chip = document.createElement('div');
    chip.className = 'chip'; chip.textContent = n;
    calledGrid.prepend(chip);
  }
  function rebuildPlayers(pl){
    playersEl.innerHTML = '';
    Object.entries(pl).forEach(([id,p])=>{
      const div = document.createElement('div');
      div.className = 'player';
      div.innerHTML = `<div class="name">${p.name}${id===room.hostId?' (Host)':''}</div>
        <div class="badges">
          ${p.lines.length? `<span class="badge">Lines: ${p.lines.length}</span>`:''}
          ${p.fullHouse? `<span class="badge">FULL</span>`:''}
        </div>`;
      playersEl.appendChild(div);
    });
  }

  function makeCell(idx, number){
    const b = document.createElement('button');
    b.className = 'cell'; b.dataset.idx = idx;
    b.innerHTML = `<span class="num">${number>0?number:'★'}</span><span class="mark"></span>`;
    if(marks.has(idx)) b.classList.add('marked');
    b.addEventListener('click', ()=>{
      const marked = b.classList.toggle('marked');
      if(marked){
        marks.add(idx);
        socket.emit('mark_cell', idx);
      }else{
        marks.delete(idx);
        socket.emit('unmark_cell', idx);
      }
    });
    return b;
  }

  function renderBoard(){
    board.innerHTML = '';
    card.forEach((n, i)=> board.appendChild(makeCell(i, n)));
  }

  // Simple confetti system
  function launchConfetti(){
    if(!ctx) return;
    confetti = Array.from({length: 160}).map(()=>({
      x: Math.random()*fx.width,
      y: -20 - Math.random()*fx.height*0.3,
      r: 4 + Math.random()*4,
      c: `hsl(${Math.floor(Math.random()*360)},90%,60%)`,
      vx: (Math.random()-0.5)*2,
      vy: 2 + Math.random()*3,
      a: Math.random()*Math.PI*2,
      va: (Math.random()-0.5)*0.2
    }));
    if(rafId) cancelAnimationFrame(rafId);
    const tick = ()=>{
      ctx.clearRect(0,0,fx.width,fx.height);
      confetti.forEach(p=>{
        p.x += p.vx; p.y += p.vy; p.a += p.va;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r, -p.r, p.r*2, p.r*2);
        ctx.restore();
      });
      if(confetti.some(p=>p.y < fx.height+40)) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function showWinner(name){
    if(winnerNameEl) winnerNameEl.textContent = name;
    if(overlay) overlay.classList.add('show');
    // Only host should see the Restart button
    if(winnerRestart) winnerRestart.style.display = (socket.id === room?.hostId) ? 'inline-block' : 'none';
    launchConfetti();
  }
  if(winnerOk){
    winnerOk.addEventListener('click', ()=>{
      if(overlay) overlay.classList.remove('show');
      if(rafId) cancelAnimationFrame(rafId);
      if(ctx) ctx.clearRect(0,0,fx.width,fx.height);
    });
  }
  if(winnerRestart){
    winnerRestart.addEventListener('click', ()=>{
      if(socket.id === room?.hostId){
        socket.emit('host_reset');
        if(overlay) overlay.classList.remove('show');
        if(rafId) cancelAnimationFrame(rafId);
        if(ctx) ctx.clearRect(0,0,fx.width,fx.height);
      }
    });
  }

  // Socket events
  socket.on('connect', ()=>{
    // Join if we arrived with params from the lobby
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    const name = params.get('name') || '';
    const room = (params.get('room') || '').toUpperCase();
    const hostKey = params.get('hostKey') || '';
    if(action === 'create'){
      socket.emit('create_room', { name: name || 'Host' });
    } else if(action === 'join' && room){
      socket.emit('join_room', { roomId: room, name: name || 'Player', hostKey });
    }
  });

  socket.on('room_created', ({id}) => {
    ridLabel.textContent = id;
    roleLabel.textContent = 'host';
  });

  socket.on('joined', ({id, seed, card: serverCard}) => {
    ridLabel.textContent = id;
    roleLabel.textContent = (socket.id === room?.hostId ? 'host' : 'player');
    card = serverCard;
    marks = new Set([12]);
    renderBoard();
    setStatus('Joined room ' + id);
  });

  // Receive fresh card after a restart
  socket.on('new_card', ({card: serverCard}) => {
    card = serverCard;
    marks = new Set([12]);
    renderBoard();
    calledGrid.innerHTML = '';
    // Hide winner overlay for everyone and stop confetti
    if(overlay) overlay.classList.remove('show');
    if(rafId) cancelAnimationFrame(rafId);
    if(ctx) ctx.clearRect(0,0,fx.width,fx.height);
    setStatus('New game started');
  });

  socket.on('room_state', (r) => {
    room = r;
    roleLabel.textContent = (socket.id === r.hostId ? 'host' : 'player');
    rebuildPlayers(r.players);
    calledGrid.innerHTML = '';
    r.called.slice().reverse().forEach(addChip);
  });

  socket.on('number_called', (n) => {
    addChip(n);
    showBall(n);
    setStatus('Called: ' + n);
    if(room?.autoMark){
      card.forEach((val, idx)=>{
        if(val === n){
          const el = board.children[idx];
          if(el && !el.classList.contains('marked')){
            el.classList.add('marked');
            marks.add(idx);
          }
        }
      });
    }
  });

  socket.on('line_winner', ({playerId, name}) => {
    if(name) showWinner(name);
    else if(playerId === socket.id) showWinner('You');
  });
  socket.on('line_won', ({playerId, lineIndex}) => {
    // Fallback older event
    if(playerId === socket.id) showWinner('You');
  });
  socket.on('full_house', ({playerId}) => {
    if(playerId === socket.id) showWinner('You');
  });
  socket.on('no_more', ()=> setStatus('No more numbers'));
  socket.on('error_msg', (m)=> alert(m));

  // Disable host controls on game page (host operates from lobby)
  if(btnStart) btnStart.style.display = 'none';
  if(btnPause) btnPause.style.display = 'none';
  if(btnReset) btnReset.style.display = 'none';
  if(ivalRange) ivalRange.parentElement.style.display = 'none';
  if(automark) automark.parentElement.style.display = 'none';

  // Initialize empty board
  renderBoard();
})();
