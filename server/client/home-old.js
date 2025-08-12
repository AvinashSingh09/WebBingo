(() => {
  const nameIn = document.getElementById('name');
  const roomIn = document.getElementById('room');
  const btnCreate = document.getElementById('create');
  const btnJoin = document.getElementById('join');

  function goToLobby(params) {
    const q = new URLSearchParams(params);
    location.href = `/lobby.html?${q.toString()}`;
  }

  btnCreate.addEventListener('click', () => {
    const name = (nameIn.value || '').trim();
    if (!name) { alert('Please enter your name'); return; }
    goToLobby({ action: 'create', name });
  });

  btnJoin.addEventListener('click', () => {
    const name = (nameIn.value || '').trim();
    const room = (roomIn.value || '').trim().toUpperCase();
    if (!name) { alert('Please enter your name'); return; }
    if (!/^[A-Z0-9]{4,8}$/.test(room)) { alert('Enter a valid room code'); return; }
    goToLobby({ action: 'join', name, room });
  });
})();
