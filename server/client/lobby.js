(() => {
  const params = new URLSearchParams(location.search);
  const action = params.get('action');
  const name = params.get('name') || '';
  const roomParam = (params.get('room') || '').toUpperCase();

  const roomCodeEl = document.getElementById('roomCode');
  const roleEl = document.getElementById('role');
  const playersEl = document.getElementById('players');
  const hostOnly = document.getElementById('hostOnly');
  const notHost = document.getElementById('notHost');

  const btnStart = document.getElementById('start');
  const btnReset = document.getElementById('reset');
  const ivalRange = document.getElementById('interval');
  const ivalVal = document.getElementById('ival');
  const chkAuto = document.getElementById('automark');

  const socket = io();
  let room = null;

  function rebuildPlayers(pl){
    playersEl.innerHTML = '';
    Object.entries(pl).forEach(([id,p])=>{
      const div = document.createElement('div');
      div.className = 'player';
      div.innerHTML = `<div class="name">${p.name}${id===room.hostId?' (Host)':''}</div>
        <div class="badges"></div>`;
      playersEl.appendChild(div);
    });
  }

  socket.on('connect', ()=>{
    if(action === 'create'){
      socket.emit('create_room', { name: name || 'Host' });
    } else if(action === 'join'){
      if(!roomParam){ alert('Missing room code'); location.href = '/'; return; }
      socket.emit('join_room', { roomId: roomParam, name: name || 'Player' });
    } else {
      location.href = '/';
    }
  });

  socket.on('room_created', ({id, hostKey}) => {
    roomCodeEl.textContent = id;
    roleEl.textContent = 'host';
    // Persist hostKey so host can reclaim control after page navigation
    try { localStorage.setItem('bingo_host_'+id, hostKey); } catch {}
  });

  socket.on('joined', ({id}) => {
    roomCodeEl.textContent = id;
  });

  socket.on('room_state', (r) => {
    room = r;
    roleEl.textContent = (socket.id === r.hostId ? 'host' : 'player');
    const isHost = socket.id === r.hostId;
    hostOnly.style.display = isHost ? 'block' : 'none';
    notHost.style.display = isHost ? 'none' : 'block';

    rebuildPlayers(r.players);

    // Keep controls in sync
    ivalVal.textContent = (r.interval/1000).toFixed(1);
    ivalRange.value = (r.interval/1000).toFixed(1);
    chkAuto.checked = !!r.autoMark;

    // Show play again voting status for host
    if(isHost && r.gameEnded && r.winner) {
      const voteInfo = document.getElementById('voteInfo') || document.createElement('div');
      voteInfo.id = 'voteInfo';
      voteInfo.className = 'muted';
      voteInfo.style.marginTop = '12px';
      voteInfo.textContent = `${r.playAgainVotes || 0} of ${r.totalPlayers || 0} players want to play again`;
      
      if(!document.getElementById('voteInfo')) {
        hostOnly.appendChild(voteInfo);
      }
    }

    // If the game is running, redirect all players to game page with join params
    if(r.running){
      let hostKey = '';
      try { hostKey = localStorage.getItem('bingo_host_'+r.id) || ''; } catch {}
      const q = new URLSearchParams({ action: 'join', name: name || (isHost?'Host':'Player'), room: r.id, hostKey });
      location.href = `/play.html?${q.toString()}`;
    }
  });

  socket.on('error_msg', (m)=> alert(m));

  // Host controls
  btnStart.addEventListener('click', ()=> socket.emit('host_start'));
  btnReset.addEventListener('click', ()=> socket.emit('host_reset'));
  ivalRange.addEventListener('input', e=> ivalVal.textContent = e.target.value);
  ivalRange.addEventListener('change', e=>{
    const ms = Math.round(parseFloat(e.target.value)*1000);
    socket.emit('host_set_interval', ms);
  });
  chkAuto.addEventListener('change', e=> socket.emit('host_set_automark', e.target.checked));
})(); 