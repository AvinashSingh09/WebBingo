/* Multiplayer client */
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

  const btnCreate = qs('#create');
  const btnJoin = qs('#join');
  const btnStart = qs('#start');
  const btnPause = qs('#pause');
  const btnReset = qs('#reset');
  const ivalRange = qs('#interval');
  const ivalVal = qs('#ival');
  const automark = qs('#automark');

  const socket = io();
  let myId = null;
  let room = null;
  let card = Array(25).fill(0);
  let marks = new Set([12]);

  // UI helpers
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

  // Socket events
  socket.on('connect', ()=>{ myId = socket.id; });

  socket.on('room_created', ({id, seed}) => {
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
      // auto-mark if this number exists on my card
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

  socket.on('line_won', ({playerId, lineIndex}) => {
    if(playerId === socket.id) setStatus('You completed a line!');
  });
  socket.on('full_house', ({playerId}) => {
    if(playerId === socket.id) setStatus('FULL HOUSE!');
  });

  socket.on('no_more', ()=> setStatus('No more numbers'));

  socket.on('error_msg', (m)=> alert(m));

  // Controls
  btnCreate.addEventListener('click', ()=>{
    socket.emit('create_room', { name: nameIn.value || 'Host' });
  });
  btnJoin.addEventListener('click', ()=>{
    const id = ridIn.value.trim().toUpperCase();
    if(!id) return;
    socket.emit('join_room', { roomId: id, name: nameIn.value || 'Player' });
  });

  btnStart.addEventListener('click', ()=>{
    socket.emit('host_start');
  });
  btnPause.addEventListener('click', ()=>{
    socket.emit('host_pause');
  });
  btnReset.addEventListener('click', ()=>{
    socket.emit('host_reset');
    marks = new Set([12]);
    renderBoard();
    calledGrid.innerHTML='';
  });

  ivalRange.addEventListener('input', e=> ivalVal.textContent = e.target.value);
  ivalRange.addEventListener('change', e=>{
    const ms = Math.round(parseFloat(e.target.value)*1000);
    socket.emit('host_set_interval', ms);
  });

  automark.addEventListener('change', e=> socket.emit('host_set_automark', e.target.checked));

  // Initialize empty board
  renderBoard();
})();