(() => {
  const socket = io();
  let room = null;
  let card = Array(27).fill(0);
  let marks = new Set();
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
    cell.innerHTML = `<span class="num">${number}</span><span class="mark"></span>`;
    
    if(marks.has(idx)) cell.classList.add('marked');
    
    cell.addEventListener('click', () => {
      // Check if this number has been called
      const num = number;
      const isCalled = room?.called?.includes(num);
      
      // Only allow marking if the number has been called
      if (!isCalled) {
        // Visual feedback that this number hasn't been called yet
        cell.classList.add('invalid-selection');
        
        // Show tooltip message
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.textContent = 'Not called yet!';
        cell.appendChild(tooltip);
        
        // Remove feedback after delay
        setTimeout(() => {
          cell.classList.remove('invalid-selection');
          tooltip.remove();
        }, 1500);
        return;
      }
      
      // Toggle marking for valid numbers
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
    // Reset the animation
    currentNumberEl.classList.remove('active', 'new-number');
    currentNumberEl.style.animation = 'none';
    void currentNumberEl.offsetWidth; // Force reflow
    
    currentNumberEl.textContent = number;
    currentNumberEl.classList.add('active', 'new-number');
    numberLabelEl.textContent = `Called: ${number}`;
    
    // Add a color animation to the label (no transform to avoid conflicts)
    numberLabelEl.style.animation = 'none';
    void numberLabelEl.offsetWidth;
    numberLabelEl.style.animation = 'labelPop 0.6s ease';
    
    // Remove new-number class after animation completes
    setTimeout(() => {
      currentNumberEl.classList.remove('new-number');
    }, 1000);
  }

  function addPreviousNumber(number, isLatest = false) {
    const chip = document.createElement('div');
    chip.className = isLatest ? 'number-chip latest' : 'number-chip';
    chip.textContent = number;
    
    // Remove latest class from all other chips
    if (isLatest) {
      previousNumbersEl.querySelectorAll('.number-chip.latest').forEach(el => {
        el.classList.remove('latest');
      });
    }
    
    // For real-time updates (new numbers), add to top
    // For bulk updates (room state), add to end to maintain order
    if (isLatest && previousNumbersEl.children.length > 0) {
      previousNumbersEl.insertBefore(chip, previousNumbersEl.firstChild);
    } else {
      previousNumbersEl.appendChild(chip);
    }
    
    // Add animation with slight delay
    setTimeout(() => {
      chip.classList.add('animate-in');
    }, 50);
    
    // Remove latest styling after a few seconds
    if (isLatest) {
      setTimeout(() => {
        chip.classList.remove('latest');
      }, 3000);
    }
  }

  function updatePreviousNumbers(calledNumbers) {
    previousNumbersEl.innerHTML = '';
    // Show most recent numbers first - reverse the array so latest is index 0
    const reversedNumbers = calledNumbers.slice().reverse();
    reversedNumbers.forEach((num, index) => {
      addPreviousNumber(num, index === 0); // Mark the first (latest) number
    });
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
    marks = new Set();
    renderBoard();
    numberLabelEl.textContent = 'Waiting for game to start...';
  });

  socket.on('new_card', ({card: serverCard}) => {
    card = serverCard;
    marks = new Set();
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
      const votes = r.playAgainVotes || 0;
      const total = r.totalPlayers || 0;
      const needed = Math.ceil(total * 0.6);
      
      if (votes >= needed) {
        voteStatusEl.textContent = `Starting new game...`;
        voteStatusEl.style.color = '#7c9dff';
      } else {
        voteStatusEl.textContent = `${votes} of ${total} players voted (${needed} needed)`;
        voteStatusEl.style.color = 'var(--muted)';
      }
    } else {
      voteStatusEl.style.display = 'none';
    }
  });

  socket.on('number_called', (number) => {
    showCurrentNumber(number);
    
    // Add the new number to the top of the previous numbers list
    const chip = document.createElement('div');
    chip.className = 'number-chip latest';
    chip.textContent = number;
    
    // Remove latest class from all other chips
    previousNumbersEl.querySelectorAll('.number-chip.latest').forEach(el => {
      el.classList.remove('latest');
    });
    
    // Insert at the very top
    previousNumbersEl.insertBefore(chip, previousNumbersEl.firstChild);
    
    // Add animation
    setTimeout(() => {
      chip.classList.add('animate-in');
    }, 50);
    
    // Remove latest styling after a few seconds
    setTimeout(() => {
      chip.classList.remove('latest');
    }, 3000);
    
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
      const votes = room.playAgainVotes || 0;
      const total = room.totalPlayers || 0;
      const needed = Math.ceil(total * 0.6);
      voteStatusEl.textContent = `${votes} of ${total} players voted (${needed} needed)`;
      
      if (votes >= needed) {
        voteStatusEl.textContent = `Starting new game...`;
        voteStatusEl.style.color = '#7c9dff';
      }
    }
  });

  socket.on('new_game_starting', () => {
    // Hide winner modal and reset UI
    hideWinner();
    
    // Reset play again button
    playAgainBtn.disabled = false;
    playAgainBtn.textContent = 'Play Again';
    
    // Show notification
    numberLabelEl.textContent = 'New game starting...';
    currentNumberEl.textContent = '🎮';
    currentNumberEl.classList.add('active');
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