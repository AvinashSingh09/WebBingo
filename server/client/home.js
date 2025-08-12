(() => {
  const nameIn = document.getElementById('name');
  const roomIn = document.getElementById('room');
  const btnCreate = document.getElementById('create');
  const btnJoinToggle = document.getElementById('joinToggle');
  const btnJoin = document.getElementById('join');
  const btnCancel = document.getElementById('cancelJoin');
  const joinForm = document.getElementById('joinForm');

  function goToLobby(params) {
    const q = new URLSearchParams(params);
    location.href = `/lobby.html?${q.toString()}`;
  }

  // Show/hide join form
  btnJoinToggle.addEventListener('click', () => {
    const name = (nameIn.value || '').trim();
    if (!name) { 
      nameIn.focus();
      nameIn.style.borderColor = '#ff6b6b';
      setTimeout(() => nameIn.style.borderColor = '', 2000);
      alert('Please enter your name first'); 
      return; 
    }
    joinForm.classList.add('show');
    joinForm.style.display = 'block';
    btnJoinToggle.style.display = 'none';
    btnCreate.style.display = 'none'; // Hide host game button
    roomIn.focus();
  });

  btnCancel.addEventListener('click', () => {
    joinForm.classList.remove('show');
    joinForm.style.display = 'none';
    btnJoinToggle.style.display = 'flex';
    btnCreate.style.display = 'flex'; // Show host game button again
    roomIn.value = '';
  });

  // Auto-uppercase room code as user types
  roomIn.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });

  // Host game
  btnCreate.addEventListener('click', () => {
    const name = (nameIn.value || '').trim();
    if (!name) { 
      nameIn.focus();
      nameIn.style.borderColor = '#ff6b6b';
      setTimeout(() => nameIn.style.borderColor = '', 2000);
      alert('Please enter your name first'); 
      return; 
    }
    btnCreate.disabled = true;
    btnCreate.textContent = 'Creating...';
    goToLobby({ action: 'create', name });
  });

  // Join game
  btnJoin.addEventListener('click', () => {
    const name = (nameIn.value || '').trim();
    const room = (roomIn.value || '').trim().toUpperCase();
    
    if (!name) { 
      nameIn.focus();
      nameIn.style.borderColor = '#ff6b6b';
      setTimeout(() => nameIn.style.borderColor = '', 2000);
      alert('Please enter your name first'); 
      return; 
    }
    
    if (!/^[A-Z0-9]{4,8}$/.test(room)) { 
      roomIn.focus();
      roomIn.style.borderColor = '#ff6b6b';
      setTimeout(() => roomIn.style.borderColor = '', 2000);
      alert('Please enter a valid room code (4-8 characters)'); 
      return; 
    }
    
    btnJoin.disabled = true;
    btnJoin.textContent = 'Joining...';
    goToLobby({ action: 'join', name, room });
  });

  // Enter key support
  nameIn.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      btnJoinToggle.click();
    }
  });

  roomIn.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      btnJoin.click();
    }
  });

  // Focus name input on load
  nameIn.focus();
})(); 