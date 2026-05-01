require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

const NIGHT_TIMEOUT = 35000;
const VOTE_TIMEOUT  = 35000;
const DAY_TIMEOUT   = 90000;

// ─── Helpers ───────────────────────────────────────────────────────────────

function genCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function assignRoles(count) {
  const mafiaCount = count >= 10 ? 3 : 2;
  const roles = Array(mafiaCount).fill('mafia');
  roles.push('doctor', 'sheriff');
  while (roles.length < count) roles.push('citizen');
  return shuffle(roles);
}

function publicPlayers(room) {
  return room.players.map(p => ({
    id: p.id,
    name: p.name,
    isAlive: p.isAlive,
    isHost: p.isHost,
    revealedRole: p.revealedRole || null
  }));
}

function checkWin(room) {
  const alive  = room.players.filter(p => p.isAlive);
  const mafia  = alive.filter(p => p.role === 'mafia');
  const others = alive.filter(p => p.role !== 'mafia');
  if (mafia.length === 0)          return { winner: 'city',  msg: 'Barcha Mafia yo\'q qilindi! Shahar g\'alaba qozondi! 🏙️' };
  if (mafia.length >= others.length) return { winner: 'mafia', msg: 'Mafia shaharni egalladi! 😈' };
  return null;
}

function clearTimer(room, key) {
  if (room.timers[key]) { clearTimeout(room.timers[key]); delete room.timers[key]; }
}

// ─── Socket.IO ─────────────────────────────────────────────────────────────

io.on('connection', socket => {

  socket.on('createRoom', ({ name }) => {
    const code = genCode();
    const room = { code, phase: 'lobby', round: 0, players: [], nightActions: {}, votes: {}, timers: {} };
    room.players.push({ id: socket.id, name, role: null, isAlive: true, isHost: true, revealedRole: null });
    rooms.set(code, room);
    socket.join(code);
    socket.data = { code, name };
    socket.emit('roomCreated', { code, players: publicPlayers(room) });
  });

  socket.on('joinRoom', ({ name, code }) => {
    code = code.toUpperCase().trim();
    const room = rooms.get(code);
    if (!room)                    return socket.emit('err', { msg: 'Xona topilmadi!' });
    if (room.phase !== 'lobby')   return socket.emit('err', { msg: 'O\'yin allaqachon boshlangan!' });
    if (room.players.length >= 12) return socket.emit('err', { msg: 'Xona to\'liq (max 12)!' });

    room.players.push({ id: socket.id, name, role: null, isAlive: true, isHost: false, revealedRole: null });
    socket.join(code);
    socket.data = { code, name };
    socket.emit('roomJoined', { code, players: publicPlayers(room) });
    socket.to(code).emit('playerJoined', { name, players: publicPlayers(room) });
  });

  socket.on('startGame', () => {
    const { code } = socket.data || {};
    const room = rooms.get(code);
    if (!room) return;
    const me = room.players.find(p => p.id === socket.id);
    if (!me?.isHost) return;
    if (room.players.length < 4) return socket.emit('err', { msg: 'Kamida 4 o\'yinchi kerak!' });

    const roles = assignRoles(room.players.length);
    room.players.forEach((p, i) => { p.role = roles[i]; });
    room.phase = 'starting';

    room.players.forEach(p => {
      const team = p.role === 'mafia'
        ? room.players.filter(m => m.role === 'mafia' && m.id !== p.id).map(m => m.name)
        : [];
      io.to(p.id).emit('roleAssigned', { role: p.role, team });
    });

    io.to(code).emit('gameStarting');
    room.timers.start = setTimeout(() => startNight(code), 7000);
  });

  socket.on('nightAction', ({ target }) => {
    const { code } = socket.data || {};
    const room = rooms.get(code);
    if (!room || room.phase !== 'night') return;
    const me = room.players.find(p => p.id === socket.id);
    if (!me?.isAlive) return;

    if (me.role === 'mafia') {
      room.nightActions.mafiaVotes = room.nightActions.mafiaVotes || {};
      room.nightActions.mafiaVotes[socket.id] = target;
    } else if (me.role === 'doctor')  {
      room.nightActions.doctor = target;
    } else if (me.role === 'sheriff') {
      room.nightActions.sheriff = target;
    }

    socket.emit('actionDone');
    checkNightDone(code);
  });

  socket.on('vote', ({ target }) => {
    const { code } = socket.data || {};
    const room = rooms.get(code);
    if (!room || room.phase !== 'voting') return;
    const me = room.players.find(p => p.id === socket.id);
    if (!me?.isAlive) return;

    room.votes[socket.id] = target;
    const alive = room.players.filter(p => p.isAlive);
    io.to(code).emit('voteUpdate', { cast: Object.keys(room.votes).length, total: alive.length });

    if (Object.keys(room.votes).length >= alive.length) {
      clearTimer(room, 'vote');
      processVotes(code);
    }
  });

  socket.on('hostNext', () => {
    const { code } = socket.data || {};
    const room = rooms.get(code);
    if (!room) return;
    const me = room.players.find(p => p.id === socket.id);
    if (!me?.isHost) return;
    if (room.phase === 'day') {
      clearTimer(room, 'day');
      startVoting(code);
    }
  });

  socket.on('disconnect', () => {
    const { code, name } = socket.data || {};
    const room = rooms.get(code);
    if (!room) return;
    if (room.phase === 'lobby') {
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length === 0) { rooms.delete(code); return; }
      if (!room.players.some(p => p.isHost)) room.players[0].isHost = true;
      io.to(code).emit('playerLeft', { name, players: publicPlayers(room) });
    }
  });
});

// ─── Game logic ────────────────────────────────────────────────────────────

function startNight(code) {
  const room = rooms.get(code);
  if (!room) return;
  room.phase = 'night';
  room.round++;
  room.nightActions = { mafiaVotes: {} };

  const alive = room.players.filter(p => p.isAlive);
  io.to(code).emit('nightStart', { round: room.round, timeMs: NIGHT_TIMEOUT });

  alive.forEach(p => {
    const targets = alive
      .filter(t => p.role === 'mafia' ? t.role !== 'mafia' : t.id !== p.id)
      .map(t => ({ id: t.id, name: t.name }));
    io.to(p.id).emit('nightRole', { role: p.role, targets });
  });

  room.timers.night = setTimeout(() => {
    if (room.phase === 'night') processNight(code);
  }, NIGHT_TIMEOUT);
}

function checkNightDone(code) {
  const room = rooms.get(code);
  if (!room) return;
  const alive = room.players.filter(p => p.isAlive);

  const mafias   = alive.filter(p => p.role === 'mafia');
  const doctors  = alive.filter(p => p.role === 'doctor');
  const sheriffs = alive.filter(p => p.role === 'sheriff');

  const mafiaVoted  = Object.keys(room.nightActions.mafiaVotes || {}).length >= mafias.length;
  const doctorDone  = doctors.length  === 0 || room.nightActions.doctor  !== undefined;
  const sheriffDone = sheriffs.length === 0 || room.nightActions.sheriff !== undefined;

  if (mafiaVoted && doctorDone && sheriffDone) {
    clearTimer(room, 'night');
    processNight(code);
  }
}

function processNight(code) {
  const room = rooms.get(code);
  if (!room) return;
  room.phase = 'night-processing';

  // Determine mafia target
  const votes = Object.values(room.nightActions.mafiaVotes || {});
  let mafiaTarget = null;
  if (votes.length) {
    const counts = {};
    votes.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
    mafiaTarget = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  const doctorTarget  = room.nightActions.doctor;
  const sheriffTarget = room.nightActions.sheriff;

  let killed = null;
  let saved  = false;

  if (mafiaTarget) {
    if (mafiaTarget === doctorTarget) {
      saved = true;
    } else {
      const victim = room.players.find(p => p.id === mafiaTarget && p.isAlive);
      if (victim) {
        victim.isAlive      = false;
        victim.revealedRole = victim.role;
        killed = { name: victim.name, role: victim.role };
      }
    }
  }

  // Sheriff result (private)
  if (sheriffTarget) {
    const sheriffP = room.players.find(p => p.role === 'sheriff' && p.isAlive);
    const target   = room.players.find(p => p.id === sheriffTarget);
    if (sheriffP && target) {
      io.to(sheriffP.id).emit('sheriffResult', { name: target.name, isMafia: target.role === 'mafia' });
    }
  }

  const win = checkWin(room);
  setTimeout(() => {
    if (win) endGame(code, win);
    else startDay(code, killed, saved);
  }, 1500);
}

function startDay(code, killed, saved) {
  const room = rooms.get(code);
  if (!room) return;
  room.phase = 'day';

  io.to(code).emit('dayStart', {
    round: room.round,
    killed,
    saved,
    players: publicPlayers(room),
    timeMs: DAY_TIMEOUT
  });

  room.timers.day = setTimeout(() => {
    if (room.phase === 'day') startVoting(code);
  }, DAY_TIMEOUT);
}

function startVoting(code) {
  const room = rooms.get(code);
  if (!room) return;
  room.phase = 'voting';
  room.votes = {};

  const alive = room.players.filter(p => p.isAlive).map(p => ({ id: p.id, name: p.name }));
  io.to(code).emit('votingStart', { players: alive, timeMs: VOTE_TIMEOUT });

  room.timers.vote = setTimeout(() => {
    if (room.phase === 'voting') processVotes(code);
  }, VOTE_TIMEOUT);
}

function processVotes(code) {
  const room = rooms.get(code);
  if (!room) return;
  room.phase = 'vote-processing';

  const counts = {};
  Object.values(room.votes).forEach(id => { counts[id] = (counts[id] || 0) + 1; });

  let eliminated = null;
  let tie = false;

  if (Object.keys(counts).length > 0) {
    const max     = Math.max(...Object.values(counts));
    const topIds  = Object.keys(counts).filter(id => counts[id] === max);
    if (topIds.length === 1) {
      const p = room.players.find(pl => pl.id === topIds[0]);
      if (p) {
        p.isAlive = false;
        p.revealedRole = p.role;
        eliminated = { name: p.name, role: p.role };
      }
    } else {
      tie = true;
    }
  }

  const win = checkWin(room);
  io.to(code).emit('voteResult', { eliminated, tie, players: publicPlayers(room) });

  setTimeout(() => {
    if (win) endGame(code, win);
    else startNight(code);
  }, win ? 3000 : 5000);
}

function endGame(code, win) {
  const room = rooms.get(code);
  if (!room) return;
  room.phase = 'ended';
  Object.values(room.timers).forEach(t => clearTimeout(t));

  const allPlayers = room.players.map(p => ({ name: p.name, role: p.role, isAlive: p.isAlive }));
  io.to(code).emit('gameOver', { ...win, allPlayers });

  setTimeout(() => rooms.delete(code), 30 * 60 * 1000);
}

// ─── Start ─────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎭  Mafia server  →  http://localhost:${PORT}`);

  // Telegram bot ni alohida ishga tushirish
  if (process.env.BOT_TOKEN && !process.env.BOT_TOKEN.includes('bu_yerga')) {
    require('./bot');
    console.log('🤖  Telegram bot ulandi');
  } else {
    console.log('ℹ️   Bot ishga tushmadi — .env da BOT_TOKEN kiriting');
  }
});
