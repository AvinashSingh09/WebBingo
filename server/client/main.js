(() => {
  const socket = io();
  let room = null;
  let card = Array(25).fill(0);
  let marks = new Set([12]);
  let playerName = '';

  // DOM elements
  const playerNameEl = document.getElementById('playerName');
  const roomCodeEl = document.getElementById('roomCode');
  const currentNumberEl = document.getElementById('currentNumber');
  const numberLabelEl = document.getElementById('numberLabel');
  const boardEl = document.getElementById('board');
  const previousNumbersEl = document.getElementById('previousNumbers');
  const winnerOverlay = document.getElementById('winnerOverlay');
  const winnerNameEl = document.getElementById('winnerName');
  const playAgainBtn = document.getElementById('playAgainBtn');
  const exitGameBtn = document.getElementById('exitGameBtn');
  const voteStatusEl = document.getElementById('voteStatus');
  
  // Confetti system
  const fx = document.getElementById('fx');
  const ctx = fx ? fx.getContext('2d') : null;
  let confetti = [];
  let rafId = null;

  function resizeFx(){
    if(!fx) return;
    fx.width = window.innerWidth; 
    fx.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeFx); 
  resizeFx();

  // Get parameters from URL
  const params = new URLSearchParams(location.search);
  playerName = params.get('name') || 'Player';
  const roomId = params.get('room') || '';
  const hostKey = params.get('hostKey') || '';

  // Initialize UI
  playerNameEl.textContent = playerName;
  roomCodeEl.textContent = roomId;

  // Board functions
  function makeCell(idx, number){
    const cell = document.createElement('button');
    cell.className = 'cell';
    cell.dataset.idx = idx;
    cell.innerHTML = `<span class="num">${number > 0 ? number : '★'}</span><span class="mark"></span>`;
    
    if(marks.has(idx)) cell.classList.add('marked');
    
    cell.addEventListener('click', () => {
      const marked = cell.classList.toggle('marked');
      if(marked){
        marks.add(idx);
        socket.emit('mark_cell', idx);
      } else {
        marks.delete(idx);
        socket.emit('unmark_cell', idx);
      }
    });
    
    return cell;
  }

  function renderBoard(){
    boardEl.innerHTML = '';
    card.forEach((n, i) => boardEl.appendChild(makeCell(i, n)));
  }

  function showCurrentNumber(number) {
    currentNumberEl.textContent = number;
    currentNumberEl.classList.remove('active');
    void currentNumberEl.offsetWidth; // Force reflow
    currentNumberEl.classList.add('active');
    numberLabelEl.textContent = `Called: ${number}`;
  }

  function addPreviousNumber(number) {
    const chip = document.createElement('div');
    chip.className = 'number-chip';
    chip.textContent = number;
    previousNumbersEl.prepend(chip);
  }

  function updatePreviousNumbers(calledNumbers) {
    previousNumbersEl.innerHTML = '';
    calledNumbers.slice().reverse().forEach(addPreviousNumber);
  }

  // Confetti animation
  function launchConfetti(){
    if(!ctx) return;
    confetti = Array.from({length: 120}).map(() => ({
      x: Math.random() * fx.width,
      y: -20 - Math.random() * fx.height * 0.3,
      r: 3 + Math.random() * 4,
      c: `hsl(${Math.floor(Math.random() * 360)}, 90%, 60%)`,
      vx: (Math.random() - 0.5) * 2,
      vy: 2 + Math.random() * 3,
      a: Math.random() * Math.PI * 2,
      va: (Math.random() - 0.5) * 0.2
    }));

    if(rafId) cancelAnimationFrame(rafId);
    
    const tick = () => {
      ctx.clearRect(0, 0, fx.width, fx.height);
      confetti.forEach(p => {
        p.x += p.vx; 
        p.y += p.vy; 
        p.a += p.va;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
        ctx.restore();
      });
      
      if(confetti.some(p => p.y < fx.height + 40)) {
        rafId = requestAnimationFrame(tick);
      }
    };
    
    rafId = requestAnimationFrame(tick);
  }

  function showWinner(name) {
    winnerNameEl.textContent = name;
    winnerOverlay.classList.add('show');
    launchConfetti();
  }

  function hideWinner() {
    winnerOverlay.classList.remove('show');
    if(rafId) cancelAnimationFrame(rafId);
    if(ctx) ctx.clearRect(0, 0, fx.width, fx.height);
  }

  // Socket events
  socket.on('connect', () => {
    const action = params.get('action');
    if(action === 'create'){
      socket.emit('create_room', { name: playerName });
    } else if(action === 'join' && roomId){
      socket.emit('join_room', { roomId, name: playerName, hostKey });
    }
  });

  socket.on('joined', ({id, card: serverCard}) => {
    roomCodeEl.textContent = id;
    card = serverCard;
    marks = new Set([12]);
    renderBoard();
    numberLabelEl.textContent = 'Waiting for game to start...';
  });

  socket.on('new_card', ({card: serverCard}) => {
    card = serverCard;
    marks = new Set([12]);
    renderBoard();
    previousNumbersEl.innerHTML = '';
    hideWinner();
    numberLabelEl.textContent = 'New game started!';
    currentNumberEl.textContent = '—';
    currentNumberEl.classList.remove('active');
  });

  socket.on('room_state', (r) => {
    room = r;
    updatePreviousNumbers(r.called);
    
    // Update vote status if game ended
    if(r.gameEnded && r.winner) {
      voteStatusEl.style.display = 'block';
      voteStatusEl.textContent = `${r.playAgainVotes} of ${r.totalPlayers} players want to play again`;
    }
  });

  socket.on('number_called', (number) => {
    showCurrentNumber(number);
    addPreviousNumber(number);
    
    // Auto-mark if enabled
    if(room?.autoMark){
      card.forEach((val, idx) => {
        if(val === number){
          const cellEl = boardEl.children[idx];
          if(cellEl && !cellEl.classList.contains('marked')){
            cellEl.classList.add('marked');
            marks.add(idx);
          }
        }
      });
    }
  });

  socket.on('game_winner', ({name}) => {
    showWinner(name === playerName ? 'You Won!' : `${name} Won!`);
  });

  socket.on('play_again_vote', ({name}) => {
    if(room) {
      voteStatusEl.textContent = `${room.playAgainVotes || 0} of ${room.totalPlayers || 0} players want to play again`;
    }
  });

  socket.on('error_msg', (msg) => alert(msg));

  // Winner modal actions
  playAgainBtn.addEventListener('click', () => {
    socket.emit('vote_play_again');
    playAgainBtn.disabled = true;
    playAgainBtn.textContent = 'Vote Recorded';
  });

  exitGameBtn.addEventListener('click', () => {
    socket.emit('vote_exit');
    location.href = '/';
  });

  // Initialize
  renderBoard();
})(); 