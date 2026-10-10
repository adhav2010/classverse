// ClassVerse Upgraded Client Logic
let socket = null;
let currentUser = null;
let authToken = localStorage.getItem('classverse_token');
let currentTab = 'chat';
let currentGame = 'quiz';
let cachedOnlineUsers = [];
let pendingChallenge = null;

// Audio Synthesizer (Zero-dependency Web Audio API)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'message') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'challenge') {
      [440, 554.37, 659.25, 880].forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g);
        g.connect(audioCtx.destination);
        o.frequency.setValueAtTime(f, now + i * 0.08);
        g.gain.setValueAtTime(0.15, now + i * 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.15);
        o.start(now + i * 0.08);
        o.stop(now + i * 0.08 + 0.15);
      });
    } else if (type === 'click') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'win') {
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
        const noteOsc = audioCtx.createOscillator();
        const noteGain = audioCtx.createGain();
        noteOsc.connect(noteGain);
        noteGain.connect(audioCtx.destination);
        noteOsc.frequency.setValueAtTime(freq, now + idx * 0.12);
        noteGain.gain.setValueAtTime(0.15, now + idx * 0.12);
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.25);
        noteOsc.start(now + idx * 0.12);
        noteOsc.stop(now + idx * 0.12 + 0.25);
      });
    } else if (type === 'wrong') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.setValueAtTime(140, now + 0.1);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  } catch (e) {}
}

window.quickFill = function(studentId, password) {
  document.getElementById('login-student-id').value = studentId;
  document.getElementById('login-password').value = password;
  document.getElementById('login-form').dispatchEvent(new Event('submit'));
};

// ==========================================
// AUTHENTICATION & STARTUP
// ==========================================
async function init() {
  if (authToken) {
    try {
      const res = await fetch('/api/me', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        currentUser = data.user;
        launchApp();
        return;
      } else {
        localStorage.removeItem('classverse_token');
      }
    } catch (e) {
      console.error(e);
    }
  }
  showLogin();
}

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');
}

function launchApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');

  updateUserUI();
  initSocket();
  loadChatHistory();
  loadAnnouncements();
  loadPolls();
  loadLeaderboard();

  if (currentUser.role === 'admin') {
    document.getElementById('tab-btn-admin').classList.remove('hidden');
    document.getElementById('mobile-tab-btn-admin').classList.remove('hidden');
    loadAdminRoster();
  }

  // Pre-join public game lobbies
  joinQuizRoom();
  joinTTTRoom();
  joinC4Room();
  joinRPSRoom();
  if (typeof joinChessRoom === 'function') joinChessRoom(false);
  if (typeof joinLudoRoom === 'function') joinLudoRoom();
  if (typeof joinSnlRoom === 'function') joinSnlRoom();
  if (typeof joinScribbleRoom === 'function') joinScribbleRoom();
  if (typeof joinMafiaRoom === 'function') joinMafiaRoom();
}

function updateUserUI() {
  document.getElementById('nav-user-name').textContent = currentUser.name;
  document.getElementById('nav-user-badge').textContent = currentUser.studentId;
  document.getElementById('nav-user-avatar').textContent = currentUser.avatar || '🎓';
  document.getElementById('nav-user-xp').textContent = currentUser.xp || 0;
  document.getElementById('nav-user-status-peek').textContent = currentUser.statusMessage || 'Ready to chat';
  const statusInput = document.getElementById('my-status-input');
  if (statusInput) statusInput.value = currentUser.statusMessage || '';
}

window.logout = function() {
  localStorage.removeItem('classverse_token');
  location.reload();
};

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const studentId = document.getElementById('login-student-id').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const errorBox = document.getElementById('login-error');
  const errorText = document.getElementById('login-error-text');

  errorBox.classList.add('hidden');

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, password })
    });
    const data = await res.json();
    if (res.ok && data.token) {
      authToken = data.token;
      localStorage.setItem('classverse_token', authToken);
      currentUser = data.user;
      launchApp();
    } else {
      errorText.textContent = data.error || 'Invalid credentials';
      errorBox.classList.remove('hidden');
    }
  } catch (err) {
    errorText.textContent = 'Unable to connect to server';
    errorBox.classList.remove('hidden');
  }
});

// Auth Switcher between Sign In and Create Account
window.switchAuthMode = function(mode) {
  const loginForm = document.getElementById('login-form');
  const regForm = document.getElementById('register-form');
  const tabLogin = document.getElementById('auth-tab-login');
  const tabReg = document.getElementById('auth-tab-register');
  const quickBox = document.getElementById('quick-logins-box');

  if (mode === 'register') {
    loginForm.classList.add('hidden');
    regForm.classList.remove('hidden');
    if (quickBox) quickBox.classList.add('hidden');

    tabReg.classList.add('bg-indigo-600', 'text-white', 'shadow-md', 'shadow-indigo-600/30');
    tabReg.classList.remove('text-slate-400');
    tabLogin.classList.remove('bg-indigo-600', 'text-white', 'shadow-md', 'shadow-indigo-600/30');
    tabLogin.classList.add('text-slate-400');
  } else {
    loginForm.classList.remove('hidden');
    regForm.classList.add('hidden');
    if (quickBox) quickBox.classList.remove('hidden');

    tabLogin.classList.add('bg-indigo-600', 'text-white', 'shadow-md', 'shadow-indigo-600/30');
    tabLogin.classList.remove('text-slate-400');
    tabReg.classList.remove('bg-indigo-600', 'text-white', 'shadow-md', 'shadow-indigo-600/30');
    tabReg.classList.add('text-slate-400');
  }
};

window.selectRegAvatar = function(emoji, btn) {
  document.getElementById('reg-avatar').value = emoji;
  const allBtns = document.querySelectorAll('.reg-avatar-btn');
  allBtns.forEach(b => {
    b.classList.remove('bg-indigo-600/40', 'border-indigo-400', 'scale-110');
    b.classList.add('border-transparent');
  });
  btn.classList.add('bg-indigo-600/40', 'border-indigo-400', 'scale-110');
  btn.classList.remove('border-transparent');
};

// Register Form Submit Handler
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const studentId = document.getElementById('reg-student-id').value.trim();
  const password = document.getElementById('reg-password').value.trim();
  const avatar = document.getElementById('reg-avatar').value;

  const errorBox = document.getElementById('register-error');
  const errorText = document.getElementById('register-error-text');
  errorBox.classList.add('hidden');

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, studentId, password, avatar })
    });
    const data = await res.json();
    if (res.ok && data.token) {
      authToken = data.token;
      localStorage.setItem('classverse_token', authToken);
      currentUser = data.user;
      playSound('win');
      confetti({ particleCount: 80, spread: 70 });
      launchApp();
    } else {
      errorText.textContent = data.error || 'Registration failed';
      errorBox.classList.remove('hidden');
    }
  } catch (err) {
    errorText.textContent = 'Unable to connect to server';
    errorBox.classList.remove('hidden');
  }
});

// ==========================================
// NAVIGATION TABS
// ==========================================
window.switchTab = function(tabName) {
  currentTab = tabName;
  ['chat', 'games', 'board', 'leaderboard', 'admin'].forEach(tab => {
    const content = document.getElementById(`tab-content-${tab}`);
    const btn = document.getElementById(`tab-btn-${tab}`);
    const mobBtn = document.getElementById(`mobile-tab-btn-${tab}`);

    if (content) content.classList.add('hidden');
    if (btn) {
      btn.classList.remove('bg-indigo-600', 'text-white', 'shadow-sm');
      btn.classList.add('text-slate-400');
    }
    if (mobBtn) {
      mobBtn.classList.remove('text-indigo-400');
      mobBtn.classList.add('text-slate-400');
    }
  });

  const activeContent = document.getElementById(`tab-content-${tabName}`);
  const activeBtn = document.getElementById(`tab-btn-${tabName}`);
  const activeMobBtn = document.getElementById(`mobile-tab-btn-${tabName}`);

  if (activeContent) activeContent.classList.remove('hidden');
  if (activeBtn) {
    activeBtn.classList.add('bg-indigo-600', 'text-white', 'shadow-sm');
    activeBtn.classList.remove('text-slate-400');
  }
  if (activeMobBtn) {
    activeMobBtn.classList.add('text-indigo-400');
    activeMobBtn.classList.remove('text-slate-400');
  }

  // Update activity on socket
  if (socket) {
    const activityNames = {
      chat: '💬 Class Chat',
      games: '🎮 Game Arena',
      board: '📢 Notice Board',
      leaderboard: '🏆 Leaderboard',
      admin: '🛠️ Admin Console'
    };
    socket.emit('set_activity', activityNames[tabName] || 'Browsing');
  }

  if (tabName === 'board') { loadAnnouncements(); loadPolls(); }
  if (tabName === 'leaderboard') loadLeaderboard();
  if (tabName === 'admin' && currentUser.role === 'admin') loadAdminRoster();
};

window.selectGame = function(gameKey) {
  currentGame = gameKey;
  ['quiz', 'ttt', 'c4', 'rps', 'stumble', 'chess', 'ludo', 'snl', 'scribble', 'mafia'].forEach(g => {
    const el = document.getElementById(`game-container-${g}`);
    if (el) el.classList.add('hidden');
    const pill = document.getElementById(`game-pill-${g}`);
    if (pill) {
      pill.classList.remove('bg-indigo-600', 'text-white', 'shadow');
      pill.classList.add('text-slate-400');
    }
  });

  const activeCont = document.getElementById(`game-container-${gameKey}`);
  if (activeCont) activeCont.classList.remove('hidden');
  const activePill = document.getElementById(`game-pill-${gameKey}`);
  if (activePill) {
    activePill.classList.add('bg-indigo-600', 'text-white', 'shadow');
    activePill.classList.remove('text-slate-400');
  }

  if (gameKey === 'stumble' && typeof window.joinStumbleRoom === 'function') {
    window.joinStumbleRoom();
  } else if (gameKey === 'chess' && typeof window.joinChessRoom === 'function') {
    window.joinChessRoom(false);
  } else if (gameKey === 'ludo' && typeof window.joinLudoRoom === 'function') {
    window.joinLudoRoom();
  } else if (gameKey === 'snl' && typeof window.joinSnlRoom === 'function') {
    window.joinSnlRoom();
  } else if (gameKey === 'scribble' && typeof window.joinScribbleRoom === 'function') {
    window.joinScribbleRoom();
  } else if (gameKey === 'mafia' && typeof window.joinMafiaRoom === 'function') {
    window.joinMafiaRoom();
  }

  if (socket) {
    const gameNames = {
      quiz: '🧠 Quiz Battle',
      ttt: '⚔️ Tic-Tac-Toe',
      c4: '🔴 Connect Four',
      rps: '✊ Rock Paper Scissors',
      stumble: '🏃 Stumble Dash',
      chess: '♟️ Chess Grandmaster',
      ludo: '🎲 Ludo Royale',
      snl: '🐍 Snake & Ladder',
      scribble: '🎨 Scribble Draw & Guess',
      mafia: '🕵️ Mafia Village'
    };
    socket.emit('set_activity', gameNames[gameKey] || 'Gaming');
  }
};

// ==========================================
// "WHO IS ONLINE" LOUNGE MODAL & SIDEBAR
// ==========================================
window.openOnlineLoungeModal = function() {
  document.getElementById('online-lounge-modal').classList.remove('hidden');
  renderLoungeCards(cachedOnlineUsers);
};

window.closeOnlineLoungeModal = function() {
  document.getElementById('online-lounge-modal').classList.add('hidden');
};

window.saveMyStatus = function() {
  const input = document.getElementById('my-status-input');
  const newStatus = input.value.trim();
  if (!newStatus) return;

  fetch('/api/profile/update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ statusMessage: newStatus })
  }).then(r => r.json()).then(data => {
    if (data.success) {
      currentUser.statusMessage = newStatus;
      updateUserUI();
      if (socket) {
        socket.emit('set_status_message', newStatus);
      }
    }
  });
};

function renderOnlineUsers(users) {
  cachedOnlineUsers = users;
  const countText = `${users.length} Classmate${users.length === 1 ? '' : 's'} Online`;
  document.getElementById('header-online-count').textContent = countText;
  document.getElementById('chat-online-count').textContent = users.length;

  const sidebarList = document.getElementById('online-users-list');
  sidebarList.innerHTML = '';

  users.forEach(u => {
    const isMe = currentUser && u.studentId === currentUser.studentId;
    const item = document.createElement('div');
    item.className = 'p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 transition flex items-center justify-between gap-2';
    item.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="avatar-bubble text-xl shrink-0">
          <span>${u.avatar || '🎓'}</span>
          <span class="status-dot bg-emerald-500"></span>
        </div>
        <div class="min-w-0">
          <div class="text-xs font-bold text-white truncate flex items-center gap-1.5">
            <span>${u.name}</span>
            ${isMe ? '<span class="text-[8px] bg-indigo-500/20 text-indigo-300 px-1 rounded">YOU</span>' : ''}
          </div>
          <div class="text-[10px] text-slate-400 font-mono truncate">${u.activity || '💬 Class Chat'}</div>
        </div>
      </div>
      ${!isMe ? `
        <button onclick="challengeClassmate('${u.studentId}', '${u.name}')" class="px-2 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600 border border-indigo-500/40 text-indigo-200 text-[10px] font-bold transition shrink-0" title="Challenge to Game">
          ⚔️ Duel
        </button>
      ` : ''}
    `;
    sidebarList.appendChild(item);
  });

  // Also update modal if open
  if (!document.getElementById('online-lounge-modal').classList.contains('hidden')) {
    renderLoungeCards(users);
  }
}

function renderLoungeCards(users) {
  const container = document.getElementById('lounge-cards-grid');
  container.innerHTML = '';

  users.forEach(u => {
    const isMe = currentUser && u.studentId === currentUser.studentId;
    const level = Math.floor((u.xp || 0) / 100) + 1;

    const card = document.createElement('div');
    card.className = `p-4 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
      isMe ? 'bg-indigo-950/30 border-indigo-800/50' : 'bg-slate-900/70 border-slate-800/90 hover:border-slate-700'
    }`;

    card.innerHTML = `
      <div class="flex items-center gap-4">
        <div class="relative">
          <div class="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-3xl shadow-inner">
            ${u.avatar || '🎓'}
          </div>
          <span class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-slate-900"></span>
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h4 class="text-sm font-black text-white">${u.name}</h4>
            <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-400 border border-slate-700">${u.studentId}</span>
            ${isMe ? '<span class="text-[9px] bg-indigo-500/30 text-indigo-200 px-1.5 py-0.2 rounded font-bold">YOU</span>' : ''}
          </div>
          <div class="text-xs text-amber-300/90 font-medium italic mt-1 flex items-center gap-1.5">
            <i class="fa-solid fa-quote-left text-[9px] opacity-40"></i>
            <span>${u.statusMessage || 'Ready to play!'}</span>
          </div>
          <div class="flex items-center gap-2 mt-2 text-[11px] text-slate-400">
            <span class="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 font-semibold flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              ${u.activity || 'Active Now'}
            </span>
            <span class="font-mono text-purple-300">Lv. ${level}</span>
            <span class="font-mono text-amber-400">${u.xp || 0} XP</span>
          </div>
        </div>
      </div>

      ${!isMe ? `
        <div class="flex items-center gap-1.5 self-end sm:self-center shrink-0 flex-wrap justify-end">
          <button onclick="sendDirectChallenge('${u.studentId}', 'chess')" class="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-indigo-600 border border-slate-700 text-white text-xs font-bold transition flex items-center gap-1" title="Challenge to Chess">
            <span>♟️ Chess</span>
          </button>
          <button onclick="sendDirectChallenge('${u.studentId}', 'ludo')" class="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-amber-600 border border-slate-700 text-white text-xs font-bold transition flex items-center gap-1" title="Challenge to Ludo">
            <span>🎲 Ludo</span>
          </button>
          <button onclick="sendDirectChallenge('${u.studentId}', 'snl')" class="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-emerald-600 border border-slate-700 text-white text-xs font-bold transition flex items-center gap-1" title="Challenge to Snake & Ladder">
            <span>🐍 Snake</span>
          </button>
          <button onclick="sendDirectChallenge('${u.studentId}', 'ttt')" class="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-indigo-600 border border-slate-700 text-white text-xs font-bold transition flex items-center gap-1" title="Challenge to Tic-Tac-Toe">
            <span>⚔️ TTT</span>
          </button>
          <button onclick="sendDirectChallenge('${u.studentId}', 'stumble')" class="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-emerald-600 border border-slate-700 text-white text-xs font-bold transition flex items-center gap-1" title="Challenge to Stumble Dash">
            <span>🏃 Dash</span>
          </button>
        </div>
      ` : `
        <div class="text-xs text-slate-500 font-mono self-end sm:self-center">Online Now</div>
      `}
    `;

    container.appendChild(card);
  });
}

// ==========================================
// 1-ON-1 GAME CHALLENGES
// ==========================================
window.challengeClassmate = function(studentId, name) {
  openOnlineLoungeModal();
};

window.sendDirectChallenge = function(targetStudentId, gameType) {
  if (socket) {
    socket.emit('send_challenge', { targetStudentId, gameType });
    alert(`Challenge sent to ${targetStudentId}! Waiting for them to accept...`);
  }
};

function handleChallengeReceived(data) {
  pendingChallenge = data;
  playSound('challenge');

  const popup = document.getElementById('challenge-popup');
  document.getElementById('challenge-popup-avatar').textContent = data.challenger.avatar || '⚔️';
  document.getElementById('challenge-popup-text').textContent = `${data.challenger.name} (${data.challenger.studentId}) challenged you!`;
  
  const gameNames = {
    ttt: '⚔️ Multiplayer Tic-Tac-Toe',
    c4: '🔴 Multiplayer Connect Four',
    rps: '✊ Rock-Paper-Scissors Face-Off',
    stumble: '🏃 Stumble Dash: Class Royale',
    chess: '♟️ Grandmaster Chess Duel',
    ludo: '🎲 Ludo Royale Face-Off',
    snl: '🐍 Snake & Ladder Race',
    scribble: '🎨 Scribble Draw & Guess',
    mafia: '🕵️ Mafia Social Deduction'
  };
  document.getElementById('challenge-popup-game').textContent = gameNames[data.gameType] || 'A Multiplayer Game';

  popup.classList.remove('hidden');
}

window.acceptIncomingChallenge = function() {
  if (!pendingChallenge) return;
  const { challenger, gameType, roomId } = pendingChallenge;
  socket.emit('respond_challenge', {
    challengerId: challenger.id,
    gameType,
    roomId,
    accepted: true
  });
  document.getElementById('challenge-popup').classList.add('hidden');
  closeOnlineLoungeModal();

  // Jump into the match
  switchTab('games');
  selectGame(gameType);
  if (gameType === 'ttt') {
    document.getElementById('ttt-room-input').value = roomId;
    joinTTTRoom();
  } else if (gameType === 'c4') {
    document.getElementById('c4-room-input').value = roomId;
    joinC4Room();
  } else if (gameType === 'rps') {
    document.getElementById('rps-room-input').value = roomId;
    joinRPSRoom();
  } else if (gameType === 'stumble') {
    document.getElementById('stumble-room-input').value = roomId;
    if (typeof window.joinStumbleRoom === 'function') window.joinStumbleRoom();
  } else if (gameType === 'chess') {
    const el = document.getElementById('chess-room-input');
    if (el) el.value = roomId;
    if (typeof window.joinChessRoom === 'function') window.joinChessRoom(false);
  } else if (gameType === 'ludo') {
    const el = document.getElementById('ludo-room-input');
    if (el) el.value = roomId;
    if (typeof window.joinLudoRoom === 'function') window.joinLudoRoom();
  } else if (gameType === 'snl') {
    const el = document.getElementById('snl-room-input');
    if (el) el.value = roomId;
    if (typeof window.joinSnlRoom === 'function') window.joinSnlRoom();
  } else if (gameType === 'scribble') {
    const el = document.getElementById('scribble-room-input');
    if (el) el.value = roomId;
    if (typeof window.joinScribbleRoom === 'function') window.joinScribbleRoom();
  } else if (gameType === 'mafia') {
    const el = document.getElementById('mafia-room-input');
    if (el) el.value = roomId;
    if (typeof window.joinMafiaRoom === 'function') window.joinMafiaRoom();
  }
};

window.declineIncomingChallenge = function() {
  if (pendingChallenge) {
    socket.emit('respond_challenge', {
      challengerId: pendingChallenge.challenger.id,
      gameType: pendingChallenge.gameType,
      roomId: pendingChallenge.roomId,
      accepted: false
    });
  }
  document.getElementById('challenge-popup').classList.add('hidden');
  pendingChallenge = null;
};

// ==========================================
// SOCKET.IO REAL-TIME CHAT
// ==========================================
function initSocket() {
  socket = io();

  socket.emit('auth', authToken);

  socket.on('online_users', (users) => {
    renderOnlineUsers(users);
  });

  socket.on('chat_message', (msg) => {
    appendChatMessage(msg);
    if (msg.sender.id !== currentUser.id) playSound('message');
  });

  let typingTimeout = null;
  socket.on('user_typing', ({ user, studentId, isTyping }) => {
    const bar = document.getElementById('chat-typing-bar');
    const text = document.getElementById('chat-typing-text');
    if (isTyping) {
      text.textContent = `${user} (${studentId}) is typing...`;
      bar.classList.remove('opacity-0');
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => bar.classList.add('opacity-0'), 3000);
    } else {
      bar.classList.add('opacity-0');
    }
  });

  // Challenge Events
  socket.on('challenge_received', (data) => handleChallengeReceived(data));
  socket.on('challenge_response', ({ respondent, gameType, roomId, accepted }) => {
    if (accepted) {
      alert(`🎉 ${respondent.name} accepted your challenge! Joining duel...`);
      closeOnlineLoungeModal();
      switchTab('games');
      selectGame(gameType);
      if (gameType === 'ttt') {
        document.getElementById('ttt-room-input').value = roomId;
        joinTTTRoom();
      } else if (gameType === 'c4') {
        document.getElementById('c4-room-input').value = roomId;
        joinC4Room();
      } else if (gameType === 'rps') {
        document.getElementById('rps-room-input').value = roomId;
        joinRPSRoom();
      } else if (gameType === 'stumble') {
        document.getElementById('stumble-room-input').value = roomId;
        if (typeof window.joinStumbleRoom === 'function') window.joinStumbleRoom();
      } else if (gameType === 'chess') {
        const el = document.getElementById('chess-room-input');
        if (el) el.value = roomId;
        if (typeof window.joinChessRoom === 'function') window.joinChessRoom(false);
      } else if (gameType === 'ludo') {
        const el = document.getElementById('ludo-room-input');
        if (el) el.value = roomId;
        if (typeof window.joinLudoRoom === 'function') window.joinLudoRoom();
      } else if (gameType === 'snl') {
        const el = document.getElementById('snl-room-input');
        if (el) el.value = roomId;
        if (typeof window.joinSnlRoom === 'function') window.joinSnlRoom();
      } else if (gameType === 'scribble') {
        const el = document.getElementById('scribble-room-input');
        if (el) el.value = roomId;
        if (typeof window.joinScribbleRoom === 'function') window.joinScribbleRoom();
      } else if (gameType === 'mafia') {
        const el = document.getElementById('mafia-room-input');
        if (el) el.value = roomId;
        if (typeof window.joinMafiaRoom === 'function') window.joinMafiaRoom();
      }
    } else {
      alert(`❌ ${respondent.name} declined the challenge.`);
    }
  });

  // Notice & Poll socket listeners
  socket.on('announcement_new', (ann) => {
    loadAnnouncements();
    playSound('message');
  });
  socket.on('announcement_deleted', () => loadAnnouncements());
  socket.on('poll_new', () => { loadPolls(); playSound('message'); });
  socket.on('poll_updated', (updatedPoll) => updateSinglePollUI(updatedPoll));

  // Games Sockets
  setupGameSockets();
}

async function loadChatHistory() {
  try {
    const res = await fetch('/api/messages', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      const container = document.getElementById('chat-messages');
      container.innerHTML = '';
      data.messages.forEach(msg => appendChatMessage(msg, false));
      container.scrollTop = container.scrollHeight;
    }
  } catch (e) {}
}

function appendChatMessage(msg, scroll = true) {
  const container = document.getElementById('chat-messages');
  const isMe = currentUser && msg.sender.studentId === currentUser.studentId;
  const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const msgDiv = document.createElement('div');
  msgDiv.className = `flex gap-3 max-w-3xl ${isMe ? 'ml-auto flex-row-reverse' : ''}`;

  msgDiv.innerHTML = `
    <div class="avatar-frame w-10 h-10 rounded-2xl flex items-center justify-center text-xl shrink-0 select-none">
      ${msg.sender.avatar || '🎓'}
    </div>
    <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-xs font-bold ${isMe ? 'text-indigo-300' : 'text-slate-200'}">${msg.sender.name}</span>
        <span class="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">${msg.sender.studentId}</span>
        <span class="text-[10px] text-slate-500">${time}</span>
      </div>
      <div class="p-3.5 rounded-2xl text-sm leading-relaxed ${
        isMe ? 'chat-bubble-me text-white' : 'chat-bubble-other text-slate-100'
      }">
        ${escapeHtml(msg.text)}
      </div>
    </div>
  `;

  container.appendChild(msgDiv);
  if (scroll) container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.getElementById('chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (text && socket) {
    socket.emit('chat_send', text);
    input.value = '';
    socket.emit('chat_typing', false);
  }
});

let typingTimer;
document.getElementById('chat-input').addEventListener('input', () => {
  if (socket) {
    socket.emit('chat_typing', true);
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => socket.emit('chat_typing', false), 1500);
  }
});

window.insertEmoji = function(emoji) {
  const input = document.getElementById('chat-input');
  input.value += emoji;
  input.focus();
};

// ==========================================
// GAME 1: CLASSROOM QUIZ BATTLE
// ==========================================
let currentQuizRoom = 'CLASS-ROOM';

window.joinQuizRoom = function() {
  const roomInput = document.getElementById('quiz-room-input');
  currentQuizRoom = (roomInput.value.trim() || 'CLASS-ROOM').toUpperCase();
  document.getElementById('quiz-lobby-room-name').textContent = currentQuizRoom;
  if (socket) socket.emit('quiz_join', { roomId: currentQuizRoom });
};

window.startQuizBattle = function() {
  if (socket) socket.emit('quiz_start', { roomId: currentQuizRoom });
};

window.resetQuizLobby = function() {
  if (socket) socket.emit('quiz_reset', { roomId: currentQuizRoom });
};

function renderQuizState(state) {
  const viewLobby = document.getElementById('quiz-view-lobby');
  const viewQuestion = document.getElementById('quiz-view-question');
  const viewFinished = document.getElementById('quiz-view-finished');

  if (state.status === 'lobby') {
    viewLobby.classList.remove('hidden');
    viewQuestion.classList.add('hidden');
    viewFinished.classList.add('hidden');

    document.getElementById('quiz-player-count').textContent = state.players.length;
    const chipsContainer = document.getElementById('quiz-players-chips');
    chipsContainer.innerHTML = '';
    state.players.forEach(p => {
      const chip = document.createElement('span');
      chip.className = 'px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-white flex items-center gap-1.5';
      chip.innerHTML = `<span>${p.avatar || '🎓'}</span><span>${p.name}</span><span class="text-[10px] text-indigo-400 font-mono">${p.studentId}</span>`;
      chipsContainer.appendChild(chip);
    });

    const isHost = currentUser && currentUser.id === state.hostId;
    const startBtn = document.getElementById('quiz-start-btn');
    startBtn.disabled = !isHost && state.players.length < 1;
    startBtn.innerHTML = isHost ? '🚀 Start Quiz Battle!' : '⏳ Waiting for Host to start...';
  } 
  else if (state.status === 'question' || state.status === 'result') {
    viewLobby.classList.add('hidden');
    viewQuestion.classList.remove('hidden');
    viewFinished.classList.add('hidden');

    document.getElementById('quiz-current-q-num').textContent = state.currentQuestionIndex + 1;
    document.getElementById('quiz-total-q-num').textContent = state.totalQuestions;

    if (state.currentQuestion) {
      document.getElementById('quiz-q-category').textContent = state.currentQuestion.category || 'Trivia';
      document.getElementById('quiz-question-text').textContent = state.currentQuestion.question;

      const grid = document.getElementById('quiz-options-grid');
      grid.innerHTML = '';

      state.currentQuestion.options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = `p-4 rounded-xl text-left font-bold text-sm border transition flex items-center justify-between glass-card ${
          state.status === 'result' ? 'cursor-default' : 'hover:border-indigo-500'
        }`;
        
        let optionStyle = 'bg-slate-800/80 border-slate-700/80 text-white';
        if (state.status === 'result' && state.roundResult && idx === state.roundResult.correctAnswerIndex) {
          optionStyle = 'bg-emerald-600/80 border-emerald-400 text-white shadow-lg shadow-emerald-500/30';
        }

        btn.className += ` ${optionStyle}`;
        btn.innerHTML = `
          <div class="flex items-center gap-3">
            <span class="w-7 h-7 rounded-lg bg-slate-700 flex items-center justify-center text-xs font-mono font-bold">${['A','B','C','D'][idx]}</span>
            <span>${opt}</span>
          </div>
        `;

        if (state.status === 'question') {
          btn.onclick = () => {
            playSound('click');
            socket.emit('quiz_answer', { roomId: currentQuizRoom, optionIndex: idx });
            const allBtns = grid.querySelectorAll('button');
            allBtns.forEach(b => { b.disabled = true; b.classList.add('opacity-50'); });
            btn.classList.remove('opacity-50');
            btn.classList.add('border-indigo-400', 'bg-indigo-950/60');
          };
        } else {
          btn.disabled = true;
        }

        grid.appendChild(btn);
      });
    }

    const alertBox = document.getElementById('quiz-round-alert');
    if (state.status === 'result' && state.roundResult) {
      alertBox.classList.remove('hidden');
      alertBox.className = 'p-3 rounded-xl text-center text-sm font-bold border bg-emerald-950/40 border-emerald-700 text-emerald-300';
      alertBox.innerHTML = `✅ Correct Answer: <strong>${state.roundResult.correctAnswerText}</strong>`;
    } else {
      alertBox.classList.add('hidden');
    }
  } 
  else if (state.status === 'finished') {
    viewLobby.classList.add('hidden');
    viewQuestion.classList.add('hidden');
    viewFinished.classList.remove('hidden');

    playSound('win');
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });

    const finalBoard = document.getElementById('quiz-final-leaderboard');
    finalBoard.innerHTML = '';

    const sorted = [...state.players].sort((a, b) => (state.scores[b.id] || 0) - (state.scores[a.id] || 0));
    sorted.forEach((p, idx) => {
      const medals = ['🥇 1st', '🥈 2nd', '🥉 3rd'];
      const row = document.createElement('div');
      row.className = `flex items-center justify-between p-3 rounded-xl border ${
        idx === 0 ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 'bg-slate-900 border-slate-800 text-slate-300'
      }`;
      row.innerHTML = `
        <div class="flex items-center gap-3">
          <span class="font-bold font-mono text-sm">${medals[idx] || `#${idx + 1}`}</span>
          <span class="text-xl">${p.avatar || '🎓'}</span>
          <span class="font-bold text-white">${p.name}</span>
          <span class="text-[10px] text-slate-500 font-mono">(${p.studentId})</span>
        </div>
        <div class="font-mono font-black text-sm text-indigo-400">${state.scores[p.id] || 0} pts</div>
      `;
      finalBoard.appendChild(row);
    });
  }
}

// ==========================================
// GAME 2: TIC-TAC-TOE
// ==========================================
let currentTTTRoom = 'TTT-1';

window.joinTTTRoom = function() {
  const input = document.getElementById('ttt-room-input');
  currentTTTRoom = (input.value.trim() || 'TTT-1').toUpperCase();
  if (socket) socket.emit('ttt_join', { roomId: currentTTTRoom });
};

window.makeTTTMove = function(index) {
  if (socket) {
    playSound('click');
    socket.emit('ttt_move', { roomId: currentTTTRoom, index });
  }
};

window.requestTTTRematch = function() {
  if (socket) socket.emit('ttt_rematch', { roomId: currentTTTRoom });
};

function renderTTTState(room) {
  const pX = room.players[0];
  const pO = room.players[1];

  document.getElementById('ttt-name-x').textContent = pX ? `${pX.avatar} ${pX.name}` : 'Waiting...';
  document.getElementById('ttt-name-o').textContent = pO ? `${pO.avatar} ${pO.name}` : 'Waiting...';

  const badge = document.getElementById('ttt-status-badge');
  const rematchBtn = document.getElementById('ttt-rematch-btn');

  if (room.status === 'waiting') {
    badge.textContent = 'Waiting for second player...';
    badge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30';
    rematchBtn.classList.add('hidden');
  } else if (room.status === 'playing') {
    const turnPlayer = room.players[room.turn];
    const isMyTurn = turnPlayer && turnPlayer.id === currentUser.id;
    badge.textContent = isMyTurn ? `👉 Your Turn (${turnPlayer.symbol})` : `Waiting for ${turnPlayer.name}'s move...`;
    badge.className = isMyTurn 
      ? 'px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-500/50 animate-pulse'
      : 'px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700';
    rematchBtn.classList.add('hidden');
  } else if (room.status === 'win') {
    const isWinner = room.winner && room.winner.id === currentUser.id;
    badge.textContent = isWinner ? '🎉 You Won! (+25 XP)' : `👑 ${room.winner.name} won!`;
    badge.className = isWinner 
      ? 'px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
      : 'px-3 py-1 rounded-full text-xs font-bold bg-rose-500/30 text-rose-300 border border-rose-500/50';
    rematchBtn.classList.remove('hidden');

    if (isWinner) {
      playSound('win');
      confetti({ particleCount: 75, spread: 60 });
    }
  } else if (room.status === 'draw') {
    badge.textContent = "🤝 It's a Draw! (+10 XP)";
    badge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-slate-700 text-slate-300 border border-slate-600';
    rematchBtn.classList.remove('hidden');
  }

  const cells = document.querySelectorAll('.ttt-cell');
  cells.forEach((cell, idx) => {
    const val = room.board[idx];
    cell.textContent = val || '';
    cell.classList.remove('taken', 'text-indigo-400', 'text-pink-400', 'win', 'cell-x', 'cell-o');
    if (val) {
      cell.classList.add('taken');
      cell.classList.add(val === 'X' ? 'cell-x' : 'cell-o');
    }
    if (room.winLine && room.winLine.includes(idx)) cell.classList.add('win');
  });
}

// ==========================================
// GAME 3: CONNECT FOUR
// ==========================================
let currentC4Room = 'C4-ROOM';

window.joinC4Room = function() {
  const input = document.getElementById('c4-room-input');
  currentC4Room = (input.value.trim() || 'C4-ROOM').toUpperCase();
  if (socket) socket.emit('c4_join', { roomId: currentC4Room });
};

window.dropC4Piece = function(col) {
  if (socket) {
    playSound('click');
    socket.emit('c4_drop', { roomId: currentC4Room, col });
  }
};

window.requestC4Rematch = function() {
  if (socket) socket.emit('c4_rematch', { roomId: currentC4Room });
};

function renderC4State(room) {
  const p1 = room.players[0];
  const p2 = room.players[1];

  document.getElementById('c4-name-1').textContent = p1 ? `${p1.avatar} ${p1.name}` : 'Waiting...';
  document.getElementById('c4-name-2').textContent = p2 ? `${p2.avatar} ${p2.name}` : 'Waiting...';

  const badge = document.getElementById('c4-status-badge');
  const rematchBtn = document.getElementById('c4-rematch-btn');

  if (room.status === 'waiting') {
    badge.textContent = 'Waiting for player 2...';
    badge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30';
    rematchBtn.classList.add('hidden');
  } else if (room.status === 'playing') {
    const turnPlayer = room.players[room.turn];
    const isMyTurn = turnPlayer && turnPlayer.id === currentUser.id;
    badge.textContent = isMyTurn ? `👉 Your Turn (${turnPlayer.color.toUpperCase()})` : `Waiting for ${turnPlayer.name}...`;
    badge.className = isMyTurn 
      ? 'px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-500/50 animate-pulse'
      : 'px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700';
    rematchBtn.classList.add('hidden');
  } else if (room.status === 'win') {
    const isWinner = room.winner && room.winner.id === currentUser.id;
    badge.textContent = isWinner ? '🎉 You Won Connect Four! (+35 XP)' : `👑 ${room.winner.name} won!`;
    badge.className = isWinner 
      ? 'px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
      : 'px-3 py-1 rounded-full text-xs font-bold bg-rose-500/30 text-rose-300 border border-rose-500/50';
    rematchBtn.classList.remove('hidden');

    if (isWinner) {
      playSound('win');
      confetti({ particleCount: 90, spread: 70 });
    }
  } else if (room.status === 'draw') {
    badge.textContent = "🤝 Draw! (+15 XP)";
    rematchBtn.classList.remove('hidden');
  }

  const gridEl = document.getElementById('c4-board-grid');
  gridEl.innerHTML = '';

  for (let c = 0; c < 7; c++) {
    const colDiv = document.createElement('div');
    colDiv.className = 'c4-col';
    colDiv.onclick = () => dropC4Piece(c);

    for (let r = 0; r < 6; r++) {
      const slot = document.createElement('div');
      slot.className = 'c4-slot';
      const cellVal = room.grid[r][c];
      if (cellVal === 1) slot.classList.add('red');
      else if (cellVal === 2) slot.classList.add('yellow');
      colDiv.appendChild(slot);
    }
    gridEl.appendChild(colDiv);
  }
}

// ==========================================
// GAME 4: ROCK PAPER SCISSORS (NEW!)
// ==========================================
let currentRPSRoom = 'RPS-ARENA';

window.joinRPSRoom = function() {
  const input = document.getElementById('rps-room-input');
  currentRPSRoom = (input.value.trim() || 'RPS-ARENA').toUpperCase();
  if (socket) socket.emit('rps_join', { roomId: currentRPSRoom });
};

window.submitRPSChoice = function(choice) {
  if (socket) {
    playSound('click');
    socket.emit('rps_choice', { roomId: currentRPSRoom, choice });

    // Highlight selected button with 3D glow
    ['rock', 'paper', 'scissors'].forEach(c => {
      const b = document.getElementById(`rps-btn-${c}`);
      b.classList.remove('selected');
      if (c === choice) b.classList.add('selected');
    });
  }
};

function renderRPSState(room) {
  const p1 = room.players[0];
  const p2 = room.players[1];

  document.getElementById('rps-name-1').textContent = p1 ? `${p1.avatar} ${p1.name}` : 'Waiting...';
  document.getElementById('rps-name-2').textContent = p2 ? `${p2.avatar} ${p2.name}` : 'Waiting...';

  if (p1) document.getElementById('rps-score-1').textContent = `${room.scores[p1.id] || 0} Wins`;
  if (p2) document.getElementById('rps-score-2').textContent = `${room.scores[p2.id] || 0} Wins`;

  document.getElementById('rps-round-num').textContent = room.round;
  const badge = document.getElementById('rps-status-badge');
  const announce = document.getElementById('rps-round-announcement');

  const handEmojis = { rock: '✊', paper: '✋', scissors: '✌️' };

  if (room.status === 'waiting') {
    badge.textContent = 'Waiting for player 2...';
    announce.textContent = 'Waiting for classmate to join...';
  } else if (room.status === 'choosing') {
    const myChoice = currentUser && room.choices[currentUser.id];
    badge.textContent = myChoice ? '✅ Move Locked In! Waiting for opponent...' : '👉 Pick Your Move!';
    badge.className = myChoice 
      ? 'px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
      : 'px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse';

    document.getElementById('rps-hand-p1').textContent = p1 && room.choices[p1.id] ? '🔒' : '❓';
    document.getElementById('rps-hand-p2').textContent = p2 && room.choices[p2.id] ? '🔒' : '❓';
    announce.textContent = 'Rock, Paper, Scissors... SHOOT!';
  } else if (room.status === 'reveal') {
    const c1 = room.choices[p1.id];
    const c2 = room.choices[p2.id];
    document.getElementById('rps-hand-p1').textContent = handEmojis[c1] || '❓';
    document.getElementById('rps-hand-p2').textContent = handEmojis[c2] || '❓';

    if (room.lastWinner === 'draw') {
      announce.textContent = "🤝 It's a Tie! Both chose the same!";
      badge.textContent = 'Tie Round!';
    } else {
      const isWinner = room.lastWinner && room.lastWinner.id === currentUser.id;
      announce.textContent = isWinner ? `🎉 You won this round! (+10 XP)` : `👑 ${room.lastWinner.name} won this round!`;
      badge.textContent = isWinner ? 'Round Won!' : 'Round Lost';

      if (isWinner) {
        playSound('win');
        confetti({ particleCount: 50, spread: 50 });
      }
    }
  }
}

function setupGameSockets() {
  socket.on('quiz_state', (state) => renderQuizState(state));
  socket.on('quiz_timer', ({ timeLeft }) => {
    document.getElementById('quiz-timer-display').textContent = `${timeLeft}s`;
    const bar = document.getElementById('quiz-timer-bar');
    bar.style.width = `${(timeLeft / 10) * 100}%`;
  });
  socket.on('quiz_answer_ack', ({ isCorrect }) => {
    if (isCorrect) playSound('message');
    else playSound('wrong');
  });

  socket.on('ttt_state', (room) => renderTTTState(room));
  socket.on('c4_state', (room) => renderC4State(room));
  socket.on('rps_state', (room) => renderRPSState(room));
}

// ==========================================
// NOTICE BOARD & LIVE POLLS (NEW!)
// ==========================================
async function loadAnnouncements() {
  try {
    const res = await fetch('/api/announcements', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      renderAnnouncements(data.announcements);
    }
  } catch (e) {}
}

function renderAnnouncements(items) {
  document.getElementById('announcements-count').textContent = `${items.length} Notices`;
  const container = document.getElementById('announcements-list');
  container.innerHTML = '';

  const tagColors = {
    Notice: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    Homework: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    Study: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    Event: 'bg-pink-500/20 text-pink-300 border-pink-500/30'
  };

  items.forEach(ann => {
    const canDelete = currentUser && (currentUser.role === 'admin' || currentUser.id === ann.author.id);
    const date = new Date(ann.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' });

    const card = document.createElement('div');
    card.className = 'glass-panel p-5 rounded-2xl border border-slate-800/90 shadow-md space-y-2';
    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-2">
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${tagColors[ann.tag] || tagColors.Notice}">
            ${ann.tag}
          </span>
          <h4 class="text-sm font-black text-white">${escapeHtml(ann.title)}</h4>
        </div>
        ${canDelete ? `
          <button onclick="deleteNotice('${ann.id}')" class="text-slate-500 hover:text-red-400 text-xs transition" title="Delete Notice">
            <i class="fa-solid fa-trash"></i>
          </button>
        ` : ''}
      </div>
      <p class="text-xs text-slate-300 leading-relaxed">${escapeHtml(ann.content)}</p>
      <div class="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
        <div class="flex items-center gap-2">
          <span>${ann.author.avatar || '🎓'}</span>
          <span class="font-bold text-slate-200">${ann.author.name}</span>
          <span class="text-[9px] font-mono text-indigo-400">(${ann.author.studentId})</span>
        </div>
        <span class="text-[10px] text-slate-500">${date}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

window.openNewNoticeModal = function() {
  document.getElementById('new-notice-modal').classList.remove('hidden');
};
window.closeNewNoticeModal = function() {
  document.getElementById('new-notice-modal').classList.add('hidden');
};

document.getElementById('new-notice-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('notice-title-input').value.trim();
  const tag = document.getElementById('notice-tag-input').value;
  const content = document.getElementById('notice-content-input').value.trim();

  try {
    const res = await fetch('/api/announcements', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ title, tag, content })
    });
    if (res.ok) {
      document.getElementById('new-notice-form').reset();
      closeNewNoticeModal();
      loadAnnouncements();
    }
  } catch (err) {}
});

window.deleteNotice = async function(id) {
  if (!confirm('Delete this announcement?')) return;
  await fetch(`/api/announcements/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
};

// Polls Logic
async function loadPolls() {
  try {
    const res = await fetch('/api/polls', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      renderPolls(data.polls);
    }
  } catch (e) {}
}

function renderPolls(pollList) {
  document.getElementById('polls-count').textContent = `${pollList.length} Active`;
  const container = document.getElementById('polls-list');
  container.innerHTML = '';
  pollList.forEach(p => container.appendChild(createPollCard(p)));
}

function createPollCard(poll) {
  const card = document.createElement('div');
  card.id = `poll-card-${poll.id}`;
  card.className = 'glass-panel p-5 rounded-2xl border border-slate-800/90 shadow-md space-y-3';

  const totalVotes = poll.options.reduce((sum, o) => sum + (o.votes ? o.votes.length : 0), 0);

  let optionsHtml = '';
  poll.options.forEach(opt => {
    const count = opt.votes ? opt.votes.length : 0;
    const pct = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100);
    const hasVotedThis = currentUser && opt.votes && opt.votes.includes(currentUser.id);

    optionsHtml += `
      <div onclick="votePoll('${poll.id}', ${opt.id})" class="p-3 rounded-xl border cursor-pointer transition relative overflow-hidden ${
        hasVotedThis 
          ? 'bg-purple-950/40 border-purple-500/60 shadow-sm' 
          : 'bg-slate-900/80 border-slate-700/80 hover:border-slate-600'
      }">
        <div class="absolute inset-y-0 left-0 bg-purple-600/20 transition-all duration-500" style="width: ${pct}%"></div>
        <div class="relative z-10 flex items-center justify-between text-xs font-bold text-white">
          <span class="flex items-center gap-2">
            ${hasVotedThis ? '<i class="fa-solid fa-circle-check text-purple-400"></i>' : '<i class="fa-regular fa-circle text-slate-500"></i>'}
            ${escapeHtml(opt.text)}
          </span>
          <span class="font-mono text-purple-300">${pct}% (${count})</span>
        </div>
      </div>
    `;
  });

  card.innerHTML = `
    <div>
      <span class="text-[10px] font-mono uppercase text-purple-400 font-bold">Class Poll</span>
      <h4 class="text-sm font-black text-white mt-0.5 leading-snug">${escapeHtml(poll.question)}</h4>
    </div>
    <div class="space-y-2">
      ${optionsHtml}
    </div>
    <div class="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500">
      <span>Total: ${totalVotes} votes</span>
      <span>By ${poll.author.name}</span>
    </div>
  `;
  return card;
}

function updateSinglePollUI(updatedPoll) {
  const existing = document.getElementById(`poll-card-${updatedPoll.id}`);
  if (existing) {
    existing.replaceWith(createPollCard(updatedPoll));
  } else {
    loadPolls();
  }
}

window.votePoll = async function(pollId, optionId) {
  playSound('click');
  try {
    await fetch(`/api/polls/${pollId}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ optionId })
    });
  } catch (e) {}
};

window.openNewPollModal = function() {
  document.getElementById('new-poll-modal').classList.remove('hidden');
};
window.closeNewPollModal = function() {
  document.getElementById('new-poll-modal').classList.add('hidden');
};

document.getElementById('new-poll-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const question = document.getElementById('poll-question-input').value.trim();
  const o1 = document.getElementById('poll-opt-1').value.trim();
  const o2 = document.getElementById('poll-opt-2').value.trim();
  const o3 = document.getElementById('poll-opt-3').value.trim();

  const options = [o1, o2];
  if (o3) options.push(o3);

  try {
    const res = await fetch('/api/polls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ question, options })
    });
    if (res.ok) {
      document.getElementById('new-poll-form').reset();
      closeNewPollModal();
      loadPolls();
    }
  } catch (err) {}
});

// ==========================================
// LEADERBOARD & CLASS ROSTER
// ==========================================
async function loadLeaderboard() {
  try {
    const res = await fetch('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    let list = [];
    if (res.ok) {
      const data = await res.json();
      list = data.users;
    } else {
      list = [currentUser];
    }

    list.sort((a, b) => (b.xp || 0) - (a.xp || 0));

    const tbody = document.getElementById('leaderboard-table-body');
    tbody.innerHTML = '';

    list.forEach((u, idx) => {
      const level = Math.floor((u.xp || 0) / 100) + 1;
      const rankBadge = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
      const isMe = currentUser && u.id === currentUser.id;

      const tr = document.createElement('tr');
      tr.className = `hover:bg-slate-800/40 transition ${isMe ? 'bg-indigo-950/30' : ''}`;
      tr.innerHTML = `
        <td class="px-6 py-4 font-mono font-bold text-sm ${idx < 3 ? 'text-amber-400' : 'text-slate-400'}">
          ${rankBadge}
        </td>
        <td class="px-6 py-4">
          <div class="flex items-center gap-3">
            <span class="text-2xl">${u.avatar || '🎓'}</span>
            <div>
              <div class="font-bold text-white flex items-center gap-2">
                <span>${u.name}</span>
                ${isMe ? '<span class="text-[9px] bg-indigo-500/20 text-indigo-300 px-1 rounded font-mono">YOU</span>' : ''}
              </div>
              <div class="text-[10px] text-slate-400">${u.role === 'admin' ? 'Class Admin' : 'Student'}</div>
            </div>
          </div>
        </td>
        <td class="px-6 py-4 font-mono text-indigo-300 font-bold text-xs">${u.studentId}</td>
        <td class="px-6 py-4">
          <span class="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-slate-800 text-purple-300 border border-slate-700">
            Lv. ${level}
          </span>
        </td>
        <td class="px-6 py-4 text-right font-mono font-black text-amber-400 text-sm">${u.xp || 0} XP</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {}
}

// ==========================================
// ADMIN PORTAL
// ==========================================
let adminCachedUsers = [];

async function loadAdminRoster() {
  try {
    const res = await fetch('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      adminCachedUsers = data.users;
      renderAdminUsers(data.users);
    }
  } catch (err) {}
}

function renderAdminUsers(usersList) {
  document.getElementById('admin-roster-count').textContent = `Total: ${usersList.length}`;
  const tbody = document.getElementById('admin-users-table-body');
  tbody.innerHTML = '';

  usersList.forEach(u => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-800/40 transition';
    tr.innerHTML = `
      <td class="px-6 py-3">
        <div class="flex items-center gap-2">
          <span class="text-xl">${u.avatar || '🎓'}</span>
          <span class="font-bold text-white">${u.name}</span>
        </div>
      </td>
      <td class="px-6 py-3 font-mono font-bold text-indigo-400 text-xs">${u.studentId}</td>
      <td class="px-6 py-3">
        <span class="text-[10px] uppercase font-mono px-2 py-0.5 rounded ${u.role === 'admin' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-800 text-slate-300'}">
          ${u.role}
        </span>
      </td>
      <td class="px-6 py-3 font-mono text-amber-400 text-xs">${u.xp || 0} XP</td>
      <td class="px-6 py-3 text-right">
        <div class="flex items-center justify-end gap-2">
          <button onclick="resetPasswordPrompt('${u.id}', '${u.name}')" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition" title="Reset Password">
            <i class="fa-solid fa-key"></i>
          </button>
          ${u.id !== currentUser.id ? `
            <button onclick="deleteStudent('${u.id}', '${u.name}')" class="px-2.5 py-1 rounded-lg bg-red-950/60 hover:bg-red-900/60 border border-red-800/50 text-red-400 text-xs transition" title="Remove Student">
              <i class="fa-solid fa-trash"></i>
            </button>
          ` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('add-student-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('new-student-name').value.trim();
  const studentId = document.getElementById('new-student-id').value.trim();
  const password = document.getElementById('new-student-password').value.trim();
  const feedback = document.getElementById('add-student-feedback');

  feedback.classList.add('hidden');

  try {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ name, studentId, password, role: 'student' })
    });
    const data = await res.json();
    if (res.ok) {
      feedback.textContent = `✅ Successfully created account for ${name} (${studentId})!`;
      feedback.className = 'mt-3 text-xs text-emerald-400 bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-800/40';
      feedback.classList.remove('hidden');
      document.getElementById('add-student-form').reset();
      loadAdminRoster();
    } else {
      feedback.textContent = `❌ ${data.error || 'Failed to create student'}`;
      feedback.className = 'mt-3 text-xs text-rose-400 bg-rose-950/40 p-2.5 rounded-lg border border-rose-800/40';
      feedback.classList.remove('hidden');
    }
  } catch (err) {
    feedback.textContent = '❌ Server connection error';
    feedback.classList.remove('hidden');
  }
});

window.resetPasswordPrompt = async function(userId, userName) {
  const newPass = prompt(`Enter new password for ${userName}:`);
  if (!newPass) return;
  try {
    const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ newPassword: newPass })
    });
    if (res.ok) alert(`Password for ${userName} has been updated.`);
  } catch (e) { alert('Failed to reset password'); }
};

window.deleteStudent = async function(userId, userName) {
  if (!confirm(`Are you sure you want to remove ${userName} from ClassVerse?`)) return;
  try {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (res.ok) loadAdminRoster();
  } catch (e) { alert('Failed to remove student'); }
};

window.printClassCredentials = function() {
  const modal = document.getElementById('export-modal');
  const grid = document.getElementById('export-cards-grid');
  grid.innerHTML = '';

  adminCachedUsers.forEach(u => {
    const card = document.createElement('div');
    card.className = 'border-2 border-dashed border-slate-300 rounded-xl p-4 bg-slate-50 flex flex-col justify-between';
    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-black uppercase tracking-wider text-indigo-600">ClassVerse Student Card</span>
          <span class="text-xl">${u.avatar || '🎓'}</span>
        </div>
        <div class="text-base font-bold text-slate-800">${u.name}</div>
        <div class="mt-2 space-y-1 text-xs">
          <div class="flex justify-between bg-white px-2 py-1 rounded border border-slate-200">
            <span class="text-slate-500 font-semibold">Student ID:</span>
            <span class="font-mono font-bold text-indigo-700">${u.studentId}</span>
          </div>
          <div class="flex justify-between bg-white px-2 py-1 rounded border border-slate-200">
            <span class="text-slate-500 font-semibold">Default Pass:</span>
            <span class="font-mono text-slate-700">pass123</span>
          </div>
        </div>
      </div>
      <div class="text-[9px] text-slate-400 mt-3 text-center">Login at class server address</div>
    `;
    grid.appendChild(card);
  });

  modal.classList.remove('hidden');
};

window.closeExportModal = function() {
  document.getElementById('export-modal').classList.add('hidden');
};

// ==========================================
// AVATAR PICKER MODAL
// ==========================================
const AVATARS = ['🎓', '🦊', '🐼', '🐯', '🦄', '🚀', '🦁', '🐺', '🦅', '🤖', '👾', '👑', '⚡', '🌟', '🍕', '🐱'];

window.openAvatarModal = function() {
  const modal = document.getElementById('avatar-modal');
  const grid = document.getElementById('avatar-grid');
  grid.innerHTML = '';

  AVATARS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'p-3 rounded-xl bg-slate-800/80 hover:bg-indigo-600/30 border border-slate-700 hover:border-indigo-500 transition transform hover:scale-110 flex items-center justify-center';
    btn.textContent = emoji;
    btn.onclick = () => selectAvatar(emoji);
    grid.appendChild(btn);
  });

  modal.classList.remove('hidden');
};

window.closeAvatarModal = function() {
  document.getElementById('avatar-modal').classList.add('hidden');
};

async function selectAvatar(emoji) {
  try {
    const res = await fetch('/api/profile/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ avatar: emoji })
    });
    if (res.ok) {
      currentUser.avatar = emoji;
      updateUserUI();
      closeAvatarModal();
      if (socket) socket.emit('auth', authToken);
    }
  } catch (e) {}
}

init();
