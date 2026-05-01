/* ═══════════════════════════════════════════════════════════════
   MAFIA GAME  —  Frontend Application
   ═══════════════════════════════════════════════════════════════ */

// ─── Telegram Web App init ──────────────────────────────────────────────
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.enableClosingConfirmation();
  document.documentElement.style.setProperty('--tg-bg', tg.themeParams.bg_color || '#08081a');
}

// ─── Socket ──────────────────────────────────────────────────────────────
const socket = io();

// ─── State ───────────────────────────────────────────────────────────────
const state = {
  name:       '',
  code:       '',
  isHost:     false,
  myRole:     null,
  myTeam:     [],
  players:    [],
  nightDone:  false,
  voteDone:   false,
  timers:     {}
};

const ROLE_DATA = {
  mafia: {
    emoji:'🔴', name:'MAFIA', desc:'Shaharni ichidan yemiring. Fuqarolarni aldang va kechasi ularni yo\'q qiling.',
    power:'Kechasi qurbon tanlaysiz', cls:'role-mafia'
  },
  doctor: {
    emoji:'🔵', name:'DOKTOR', desc:'Shaharning himoyachisi. Har kecha bir kishini o\'limdan saqlaysiz.',
    power:'Kechasi kimnidir davolaysiz', cls:'role-doctor'
  },
  sheriff: {
    emoji:'🟡', name:'SHERIFF', desc:'Shaharning ko\'zi. Har kecha bir kishining haqiqiy rolini bilib olasiz.',
    power:'Kechasi kimnidir tekshirasiz', cls:'role-sheriff'
  },
  citizen: {
    emoji:'⚪', name:'FUQARO', desc:'Mantiqdgan foydalaning, kuzating va Mafiyani fosh eting.',
    power:'Kunduz ovoz berish orqali g\'olib bo\'lasiz', cls:'role-citizen'
  }
};

// ─── Utils ───────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function show(id)  { $(id)?.classList.remove('hidden'); }
function hide(id)  { $(id)?.classList.add('hidden'); }

let toastTimer;
function toast(msg, type = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

function goTo(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(screenId)?.classList.add('active');
}

function playerAvatar(name) {
  return name.trim().charAt(0).toUpperCase();
}

function roleBadge(role) {
  const map = { mafia:'nr-mafia', doctor:'nr-doctor', sheriff:'nr-sheriff', citizen:'nr-citizen' };
  const labels = { mafia:'Mafia 🔴', doctor:'Doktor 🔵', sheriff:'Sheriff 🟡', citizen:'Fuqaro ⚪' };
  return `<span class="badge-role ${map[role] || ''}">${labels[role] || role}</span>`;
}

// ─── Particles ──────────────────────────────────────────────────────────
function createParticles() {
  document.querySelectorAll('.particles').forEach(container => {
    for (let i = 0; i < 18; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const size = Math.random() * 12 + 4;
      p.style.cssText = `
        width:${size}px; height:${size}px;
        left:${Math.random() * 100}%;
        animation-duration:${Math.random() * 8 + 6}s;
        animation-delay:${Math.random() * 6}s;
        opacity:${Math.random() * .4 + .1};
      `;
      container.appendChild(p);
    }
  });
}

// ─── Stars ───────────────────────────────────────────────────────────────
function createStars() {
  const container = $('stars');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < 80; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const size = Math.random() * 3 + 1;
    s.style.cssText = `
      width:${size}px; height:${size}px;
      top:${Math.random() * 100}%;
      left:${Math.random() * 100}%;
      animation-duration:${Math.random() * 3 + 2}s;
      animation-delay:${Math.random() * 3}s;
    `;
    container.appendChild(s);
  }
}

// ─── Timer helpers ────────────────────────────────────────────────────────
function startRingTimer(ringId, secId, totalMs, onDone) {
  const ring = $(ringId);
  const sec  = $(secId);
  const circumference = 213.6;
  let remaining = Math.ceil(totalMs / 1000);

  clearInterval(state.timers[ringId]);

  function tick() {
    if (sec) sec.textContent = remaining;
    if (ring) ring.style.strokeDashoffset = circumference * (1 - remaining / Math.ceil(totalMs / 1000));
    if (remaining <= 0) { clearInterval(state.timers[ringId]); onDone?.(); return; }
    remaining--;
  }
  tick();
  state.timers[ringId] = setInterval(tick, 1000);
}

function startBarTimer(barId, totalMs) {
  const bar = $(barId);
  if (!bar) return;
  bar.style.width = '100%';
  let elapsed = 0;
  clearInterval(state.timers[barId]);
  state.timers[barId] = setInterval(() => {
    elapsed += 1000;
    const pct = Math.max(0, 100 - (elapsed / totalMs) * 100);
    bar.style.width = pct + '%';
    if (pct <= 0) clearInterval(state.timers[barId]);
  }, 1000);
}

function stopAllTimers() {
  Object.values(state.timers).forEach(t => { clearInterval(t); clearTimeout(t); });
  state.timers = {};
}

// ─── Lobby helpers ────────────────────────────────────────────────────────
function renderLobby(players) {
  state.players = players;
  $('lbl-count').textContent = players.length;
  const ul = $('lobby-players');
  ul.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.className = 'player-item';
    li.innerHTML = `
      <div class="player-avatar">${playerAvatar(p.name)}</div>
      <span class="player-pname">${p.name}</span>
      ${p.isHost ? '<span class="player-badge badge-host">Host</span>' : ''}
    `;
    ul.appendChild(li);
  });
  // host controls
  if (state.isHost) {
    show('host-zone');
    hide('guest-zone');
    $('btn-start').disabled = players.length < 4;
  } else {
    hide('host-zone');
    show('guest-zone');
  }
}

// ─── Day player list ──────────────────────────────────────────────────────
function renderDayPlayers(players) {
  const ul = $('day-players');
  ul.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.className = `player-item ${!p.isAlive ? 'eliminated' : ''}`;
    li.innerHTML = `
      <div class="player-avatar" style="opacity:${p.isAlive?1:.4}">${playerAvatar(p.name)}</div>
      <span class="player-pname">${p.name}</span>
      ${!p.isAlive ? `<span class="badge-dead">☠️ ${roleBadge(p.revealedRole||'citizen')}</span>` : ''}
    `;
    ul.appendChild(li);
  });
}

// ─── Role reveal screen ───────────────────────────────────────────────────
function showRoleReveal(role, team) {
  const rd = ROLE_DATA[role] || ROLE_DATA.citizen;
  const card = $('role-card');
  card.className = `role-card ${rd.cls}`;
  $('role-emoji').textContent  = rd.emoji;
  $('role-name').textContent   = rd.name;
  $('role-desc').textContent   = rd.desc;
  $('role-power').textContent  = rd.power;
  $('role-power').className    = `role-power nr-${role}`;
  $('role-glow').className     = `role-glow`;

  if (role === 'mafia' && team.length > 0) {
    show('mafia-team-box');
    $('mafia-team-names').textContent = team.join(', ');
  } else {
    hide('mafia-team-box');
  }

  goTo('s-role');
}

// ─── Night action UI ──────────────────────────────────────────────────────
function buildTargetList(containerId, targets, onSelect) {
  const ul = $(containerId);
  ul.innerHTML = '';
  targets.forEach(t => {
    const li = document.createElement('li');
    li.className = 'target-item';
    li.dataset.id = t.id;
    li.innerHTML = `<div class="player-avatar">${playerAvatar(t.name)}</div><span>${t.name}</span>`;
    li.addEventListener('click', () => {
      ul.querySelectorAll('.target-item').forEach(i => i.classList.remove('selected'));
      li.classList.add('selected');
      onSelect(t.id, t.name);
    });
    ul.appendChild(li);
  });
}

function showNightActions(role, targets) {
  // Hide all panels first
  ['na-mafia','na-doctor','na-sheriff','na-citizen','na-done'].forEach(hide);
  state.nightDone = false;

  const sendAction = (targetId) => {
    if (state.nightDone) return;
    state.nightDone = true;
    socket.emit('nightAction', { target: targetId });
    // Show "done" after brief delay
    setTimeout(() => {
      ['na-mafia','na-doctor','na-sheriff','na-citizen'].forEach(hide);
      show('na-done');
    }, 600);
  };

  if (role === 'mafia') {
    buildTargetList('mafia-targets', targets, (id) => sendAction(id));
    show('na-mafia');
  } else if (role === 'doctor') {
    buildTargetList('doctor-targets', targets, (id) => sendAction(id));
    show('na-doctor');
  } else if (role === 'sheriff') {
    buildTargetList('sheriff-targets', targets, (id) => sendAction(id));
    show('na-sheriff');
  } else {
    show('na-citizen');
  }
}

// ─── Voting UI ────────────────────────────────────────────────────────────
function buildVoteList(players) {
  const ul = $('vote-targets');
  ul.innerHTML = '';
  state.voteDone = false;

  players.forEach(p => {
    if (p.id === socket.id) return; // can't vote for self (optional – remove to allow)
    const li = document.createElement('li');
    li.className = 'target-item';
    li.dataset.id = p.id;
    li.innerHTML = `<div class="player-avatar">${playerAvatar(p.name)}</div><span>${p.name}</span>`;
    li.addEventListener('click', () => {
      if (state.voteDone) return;
      state.voteDone = true;
      ul.querySelectorAll('.target-item').forEach(i => i.classList.remove('selected'));
      li.classList.add('selected');
      socket.emit('vote', { target: p.id });
      toast('✅ Ovoz berildi!', 'success');
    });
    ul.appendChild(li);
  });
}

// ─── Confetti ─────────────────────────────────────────────────────────────
function launchConfetti(winner) {
  const container = $('confetti');
  container.innerHTML = '';
  const colors = winner === 'city'
    ? ['#27ae60','#2ecc71','#a8e6cf','#ffd700']
    : ['#e74c3c','#c0392b','#ff6b6b','#8e44ad'];

  for (let i = 0; i < 60; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.cssText = `
      left:${Math.random()*100}%;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      animation-duration:${Math.random()*3+2}s;
      animation-delay:${Math.random()*2}s;
      border-radius:${Math.random()>.5?'50%':'2px'};
    `;
    container.appendChild(p);
  }
}

// ─── Game Over screen ─────────────────────────────────────────────────────
function showGameOver(data) {
  stopAllTimers();
  const isCityWin = data.winner === 'city';
  $('over-icon').textContent = isCityWin ? '🏙️' : '😈';
  $('over-title').textContent = isCityWin ? 'Shahar G\'alaba Qozondi!' : 'Mafia G\'alaba Qozondi!';
  $('over-msg').textContent = data.msg;

  const fr = $('final-roles');
  fr.innerHTML = '';
  data.allPlayers.forEach(p => {
    const rd = ROLE_DATA[p.role] || ROLE_DATA.citizen;
    const div = document.createElement('div');
    div.className = `final-player ${!p.isAlive?'dead':''}`;
    div.innerHTML = `
      <div class="fp-name">${p.name}</div>
      <div class="fp-role fp-role-${p.role}">${rd.emoji} ${rd.name}</div>
    `;
    fr.appendChild(div);
  });

  if (isCityWin) launchConfetti('city');
  else launchConfetti('mafia');

  goTo('s-over');
}

// ─── Socket events ────────────────────────────────────────────────────────

socket.on('roomCreated', ({ code, players }) => {
  state.code   = code;
  state.isHost = true;
  $('lbl-code').textContent = code;
  renderLobby(players);
  goTo('s-lobby');
  toast('Xona yaratildi! Kod: ' + code, 'success');
});

socket.on('roomJoined', ({ code, players }) => {
  state.code   = code;
  state.isHost = false;
  $('lbl-code').textContent = code;
  renderLobby(players);
  goTo('s-lobby');
});

socket.on('playerJoined', ({ name, players }) => {
  renderLobby(players);
  toast(`${name} qo'shildi`, 'success');
});

socket.on('playerLeft', ({ name, players }) => {
  renderLobby(players);
  toast(`${name} chiqib ketdi`);
});

socket.on('err', ({ msg }) => {
  toast(msg, 'error');
});

socket.on('gameStarting', () => {
  toast('O\'yin boshlanmoqda…');
});

socket.on('roleAssigned', ({ role, team }) => {
  state.myRole = role;
  state.myTeam = team;
  showRoleReveal(role, team);
});

socket.on('nightStart', ({ round, timeMs }) => {
  stopAllTimers();
  createStars();
  $('night-round-n').textContent = round;
  ['na-mafia','na-doctor','na-sheriff','na-citizen','na-done'].forEach(hide);
  goTo('s-night');
  startRingTimer('night-ring-fg', 'night-timer-sec', timeMs, () => {});
});

socket.on('nightRole', ({ role, targets }) => {
  showNightActions(role, targets);
});

socket.on('actionDone', () => {
  ['na-mafia','na-doctor','na-sheriff','na-citizen'].forEach(hide);
  show('na-done');
});

socket.on('sheriffResult', ({ name, isMafia }) => {
  const modal = $('modal-sheriff');
  $('modal-sheriff-title').textContent = 'Sheriff tekshiruvi 🔍';
  $('modal-sheriff-body').innerHTML = isMafia
    ? `<strong style="color:var(--c-mafia)">${name}</strong> — bu <b>Mafia a'zosi</b>! 🔴`
    : `<strong style="color:var(--c-success)">${name}</strong> — bu <b>begunoh fuqaro</b>. ✅`;
  modal.classList.remove('hidden');
});

socket.on('dayStart', ({ round, killed, saved, players, timeMs }) => {
  stopAllTimers();
  $('day-round-n').textContent = round;

  // News card
  let news = '';
  if (killed) {
    news = `<p>🌅 Tun qorong'ida… <span class="news-name">${killed.name}</span> ${roleBadge(killed.role)} uyida o'lik topildi. 😔</p>`;
  } else if (saved) {
    news = `<p>🌅 Bu gece Mafia hujum qildi, lekin <span class="news-saved">Doktor kimnidir qutqardi!</span> Hech kim o'lmadi. 🩺</p>`;
  } else {
    news = `<p>🌅 Tun tinch o'tdi. Hech kim o'lmadi.</p>`;
  }
  $('day-news').innerHTML = news;

  renderDayPlayers(players);
  state.players = players;

  if (state.isHost) {
    show('host-vote-btn');
    $('day-hint').textContent = 'Muhokama vaqti tugagach, ovoz berishni boshlang.';
  } else {
    hide('host-vote-btn');
    $('day-hint').textContent = 'Muhokama qiling, shubhalilarni aniqlang!';
  }

  goTo('s-day');
  startBarTimer('day-bar', timeMs);
});

socket.on('votingStart', ({ players, timeMs }) => {
  stopAllTimers();
  $('vote-total').textContent = players.filter(p => p.id !== socket.id).length;
  $('vote-cast').textContent  = '0';
  $('vote-bar').style.width   = '0%';
  buildVoteList(players);
  goTo('s-vote');
  startRingTimer('vote-ring-fg', 'vote-timer-sec', timeMs, () => {});
});

socket.on('voteUpdate', ({ cast, total }) => {
  $('vote-cast').textContent = cast;
  $('vote-total').textContent = total;
  $('vote-bar').style.width = Math.round((cast / total) * 100) + '%';
});

socket.on('voteResult', ({ eliminated, tie, players }) => {
  stopAllTimers();
  state.players = players;

  if (tie) {
    toast('⚖️ Tenglik! Hech kim chiqarilmadi. Mafia bugungi kechadan foydalanadi…', 'error');
  } else if (eliminated) {
    toast(`⚖️ ${eliminated.name} (${ROLE_DATA[eliminated.role]?.name}) chiqarildi!`);
  } else {
    toast('Ovoz berilmadi.');
  }
});

socket.on('gameOver', (data) => {
  showGameOver(data);
});

// ─── UI Event listeners ──────────────────────────────────────────────────

// Welcome → Create
$('btn-create').addEventListener('click', () => {
  const name = $('inp-name').value.trim();
  if (!name) return toast('Ismingizni kiriting!', 'error');
  state.name = name;
  socket.emit('createRoom', { name });
});

// Welcome → Join nav
$('btn-to-join').addEventListener('click', () => {
  const name = $('inp-name').value.trim();
  if (!name) return toast('Avval ismingizni kiriting!', 'error');
  state.name = name;
  goTo('s-join');
});

// Join back
$('btn-back-join').addEventListener('click', () => goTo('s-welcome'));

// Join submit
$('btn-join').addEventListener('click', () => {
  const code = $('inp-code').value.trim().toUpperCase();
  if (!code) return toast('Xona kodini kiriting!', 'error');
  socket.emit('joinRoom', { name: state.name, code });
});

// Enter key for inputs
$('inp-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('btn-create').click();
});
$('inp-code').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('btn-join').click();
});
$('inp-code').addEventListener('input', e => {
  e.target.value = e.target.value.toUpperCase();
});

// Lobby copy code
$('btn-copy').addEventListener('click', () => {
  navigator.clipboard?.writeText(state.code).then(() => toast('Kod nusxa olindi!', 'success'));
});

// Start game
$('btn-start').addEventListener('click', () => {
  socket.emit('startGame');
});

// Role ready — just visual feedback; server drives the transition
$('btn-ready').addEventListener('click', () => {
  $('btn-ready').textContent = '⏳ Tun boshlanishini kuting…';
  $('btn-ready').disabled = true;
});

// Day → start vote (host only)
$('btn-goto-vote').addEventListener('click', () => {
  socket.emit('hostNext');
});

// Sheriff modal close
$('btn-close-modal').addEventListener('click', () => {
  $('modal-sheriff').classList.add('hidden');
});

// New game
$('btn-new-game').addEventListener('click', () => {
  location.reload();
});

// ─── Init ─────────────────────────────────────────────────────────────────
createParticles();
