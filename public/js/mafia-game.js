// ClassVerse Mafia (Social Deduction Party Game)
let currentMafiaRoom = 'MAFIA-MANOR';
let mafiaState = null;
let myRole = null;
let isMyPlayerAlive = true;
let selectedNightTarget = null;
let selectedDayVote = null;

const ROLE_INFO = {
  mafia: { name: 'Mafia', icon: '🕵️', color: 'text-rose-400', desc: 'Choose a villager to eliminate each night in secret.' },
  doctor: { name: 'Doctor', icon: '🩺', color: 'text-emerald-400', desc: 'Choose one player each night to protect from the mafia.' },
  detective: { name: 'Detective', icon: '🔍', color: 'text-cyan-400', desc: 'Investigate one suspect each night to reveal if they are Mafia.' },
  villager: { name: 'Villager', icon: '🧑‍🌾', color: 'text-amber-400', desc: 'Discuss and vote during the day to find and exile the Mafia.' }
};

window.joinMafiaRoom = function() {
  const input = document.getElementById('mafia-room-input');
  currentMafiaRoom = (input ? input.value.trim() : 'MAFIA-MANOR') || 'MAFIA-MANOR';
  currentMafiaRoom = currentMafiaRoom.toUpperCase();

  if (socket) {
    socket.emit('mafia_join', { roomId: currentMafiaRoom });
  }
};

window.startMafiaGame = function() {
  if (socket) {
    socket.emit('mafia_start', { roomId: currentMafiaRoom });
  }
};

window.submitNightAction = function(targetId) {
  if (!socket || !mafiaState || mafiaState.phase !== 'night') return;
  if (!isMyPlayerAlive) return;

  selectedNightTarget = targetId;

  let actionType = 'kill';
  if (myRole === 'doctor') actionType = 'protect';
  if (myRole === 'detective') actionType = 'inspect';

  socket.emit('mafia_action', {
    roomId: currentMafiaRoom,
    type: actionType,
    targetId
  });

  updateMafiaUI();
};

window.submitDayVote = function(targetId) {
  if (!socket || !mafiaState || mafiaState.phase !== 'day') return;
  if (!isMyPlayerAlive) return;

  selectedDayVote = targetId;

  socket.emit('mafia_vote', {
    roomId: currentMafiaRoom,
    targetId
  });

  updateMafiaUI();
};

window.resetMafiaGame = function() {
  if (socket) {
    socket.emit('mafia_reset', { roomId: currentMafiaRoom });
  }
};

function updateMafiaUI() {
  if (!mafiaState) return;

  const container = document.getElementById('game-container-mafia');
  const phaseTheme = mafiaState.phase === 'night' ? 'mafia-night-theme' : 'mafia-day-theme';

  if (container) {
    container.classList.remove('mafia-night-theme', 'mafia-day-theme');
    if (mafiaState.phase === 'night' || mafiaState.phase === 'day') {
      container.classList.add(phaseTheme);
    }
  }

  // Phase & Timer Banner
  const phaseBanner = document.getElementById('mafia-phase-badge');
  if (phaseBanner) {
    if (mafiaState.phase === 'lobby') {
      phaseBanner.className = 'px-4 py-1.5 rounded-full text-xs font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/40';
      phaseBanner.textContent = 'Gathering Villagers in Town Square';
    } else if (mafiaState.phase === 'night') {
      phaseBanner.className = 'px-4 py-1.5 rounded-full text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/40 animate-pulse';
      phaseBanner.innerHTML = `🌙 NIGHT PHASE — Town Asleep (${mafiaState.timeLeft}s)`;
    } else if (mafiaState.phase === 'day') {
      phaseBanner.className = 'px-4 py-1.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40';
      phaseBanner.innerHTML = `☀️ DAY PHASE — Discussion & Voting (${mafiaState.timeLeft}s)`;
    } else if (mafiaState.phase === 'ended') {
      phaseBanner.className = 'px-4 py-1.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
      phaseBanner.textContent = mafiaState.winner === 'villagers' ? '🏆 VILLAGERS SAVED THE TOWN!' : '🩸 MAFIA OVERTOOK THE TOWN!';
    }
  }

  // Role Card UI
  const roleCard = document.getElementById('mafia-my-role-card');
  if (roleCard) {
    if (myRole && mafiaState.phase !== 'lobby') {
      roleCard.classList.remove('hidden');
      const rInfo = ROLE_INFO[myRole] || ROLE_INFO.villager;
      roleCard.innerHTML = `
        <div class="flex items-center gap-3">
          <span class="text-3xl">${rInfo.icon}</span>
          <div>
            <div class="text-[10px] uppercase font-mono tracking-wider text-slate-400">Secret Identity:</div>
            <div class="text-lg font-black ${rInfo.color}">${rInfo.name.toUpperCase()} ${isMyPlayerAlive ? '' : '(DECEASED)'}</div>
          </div>
        </div>
        <p class="text-xs text-slate-300 mt-2">${rInfo.desc}</p>
      `;
    } else {
      roleCard.classList.add('hidden');
    }
  }

  // Players list and interactive action targets
  const playersGrid = document.getElementById('mafia-players-grid');
  if (playersGrid && mafiaState.players) {
    playersGrid.innerHTML = '';
    mafiaState.players.forEach(p => {
      const isMe = currentUser && p.id === currentUser.id;
      const isDead = !p.isAlive;
      const card = document.createElement('div');
      card.className = `p-3.5 rounded-2xl border transition relative overflow-hidden ${
        isDead ? 'bg-slate-950/80 border-slate-800 opacity-50 grayscale' : 'glass-card border-slate-700/80'
      }`;

      // Target selection state
      const isNightSelected = selectedNightTarget === p.id;
      const isDayVoteSelected = selectedDayVote === p.id;

      if (isNightSelected || isDayVoteSelected) {
        card.style.borderColor = '#ec4899';
        card.style.boxShadow = '0 0 15px rgba(236,72,153,0.5)';
      }

      // Votes received count
      let votesCount = 0;
      if (mafiaState.votes) {
        votesCount = Object.values(mafiaState.votes).filter(tId => tId === p.id).length;
      }

      card.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <span class="text-2xl">${p.avatar || '👤'}</span>
          <span class="text-[10px] font-mono px-2 py-0.5 rounded-full ${
            isDead ? 'bg-rose-950 text-rose-400 border border-rose-800' : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
          }">${isDead ? 'DEAD' : 'ALIVE'}</span>
        </div>
        <div class="text-sm font-black text-white truncate">${p.name}</div>
        <div class="text-[10px] text-slate-400 font-mono mb-2">${isMe ? '(You)' : ''}</div>
        ${votesCount > 0 ? `<div class="text-[10px] font-mono text-amber-400 font-bold mb-2">🗳️ ${votesCount} Votes</div>` : ''}
      `;

      // Action buttons depending on phase
      if (isMyPlayerAlive && !isDead) {
        if (mafiaState.phase === 'night') {
          if (myRole === 'mafia' && !isMe) {
            const btn = document.createElement('button');
            btn.className = `w-full py-1.5 rounded-xl text-xs font-bold transition ${
              isNightSelected ? 'bg-rose-600 text-white' : 'bg-slate-800 hover:bg-rose-700 text-rose-300'
            }`;
            btn.textContent = isNightSelected ? 'Target Locked 🎯' : 'Target to Eliminate';
            btn.onclick = () => window.submitNightAction(p.id);
            card.appendChild(btn);
          } else if (myRole === 'doctor') {
            const btn = document.createElement('button');
            btn.className = `w-full py-1.5 rounded-xl text-xs font-bold transition ${
              isNightSelected ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-emerald-700 text-emerald-300'
            }`;
            btn.textContent = isNightSelected ? 'Protected 🩺' : 'Protect Patient';
            btn.onclick = () => window.submitNightAction(p.id);
            card.appendChild(btn);
          } else if (myRole === 'detective' && !isMe) {
            const btn = document.createElement('button');
            btn.className = `w-full py-1.5 rounded-xl text-xs font-bold transition ${
              isNightSelected ? 'bg-cyan-600 text-white' : 'bg-slate-800 hover:bg-cyan-700 text-cyan-300'
            }`;
            btn.textContent = isNightSelected ? 'Inspecting 🔍' : 'Investigate Suspect';
            btn.onclick = () => window.submitNightAction(p.id);
            card.appendChild(btn);
          }
        } else if (mafiaState.phase === 'day' && !isMe) {
          const btn = document.createElement('button');
          btn.className = `w-full py-1.5 rounded-xl text-xs font-bold transition ${
            isDayVoteSelected ? 'bg-amber-600 text-white' : 'bg-slate-800 hover:bg-amber-700 text-amber-300'
          }`;
          btn.textContent = isDayVoteSelected ? 'Voted to Exile 🗳️' : 'Vote to Exile';
          btn.onclick = () => window.submitDayVote(p.id);
          card.appendChild(btn);
        }
      }

      playersGrid.appendChild(card);
    });
  }

  // Lobby start button
  const startBtn = document.getElementById('mafia-start-btn');
  if (startBtn) {
    if (mafiaState.phase === 'lobby') {
      startBtn.classList.remove('hidden');
      startBtn.disabled = mafiaState.players.length < 3;
      startBtn.textContent = mafiaState.players.length < 3 ? 'Waiting for 3+ Players to Start' : '🚀 Start Mafia Match!';
    } else {
      startBtn.classList.add('hidden');
    }
  }

  // Reset button in ended phase
  const resetBtn = document.getElementById('mafia-reset-btn');
  if (resetBtn) {
    if (mafiaState.phase === 'ended') {
      resetBtn.classList.remove('hidden');
    } else {
      resetBtn.classList.add('hidden');
    }
  }

  // Town chronicle log
  const logEl = document.getElementById('mafia-story-log');
  if (logEl && mafiaState.log) {
    logEl.innerHTML = '';
    mafiaState.log.slice(-15).forEach(line => {
      const row = document.createElement('div');
      row.className = 'text-xs text-slate-300 py-1 border-b border-slate-800/60 leading-relaxed';
      row.textContent = line;
      logEl.appendChild(row);
    });
    logEl.scrollTop = logEl.scrollHeight;
  }
}

function setupMafiaSocketListeners() {
  if (!socket) return;

  socket.on('mafia_state', (state) => {
    mafiaState = state;
    updateMafiaUI();
  });

  socket.on('mafia_my_role', ({ role, isAlive }) => {
    myRole = role;
    isMyPlayerAlive = isAlive;
    updateMafiaUI();
  });

  socket.on('mafia_inspect_result', ({ targetName, isMafia }) => {
    alert(`🔍 Detective Investigation Report:\n${targetName} is ${isMafia ? 'MAFIA! 🚨' : 'INNOCENT! ✅'}`);
  });

  socket.on('mafia_error', (msg) => {
    alert(`⚠️ Mafia Notice: ${msg}`);
  });

  socket.on('mafia_tick', ({ timeLeft }) => {
    if (mafiaState) {
      mafiaState.timeLeft = timeLeft;
      const phaseBanner = document.getElementById('mafia-phase-badge');
      if (phaseBanner) {
        if (mafiaState.phase === 'night') {
          phaseBanner.innerHTML = `🌙 NIGHT PHASE — Town Asleep (${timeLeft}s)`;
        } else if (mafiaState.phase === 'day') {
          phaseBanner.innerHTML = `☀️ DAY PHASE — Discussion & Voting (${timeLeft}s)`;
        }
      }
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  const checkSocket = setInterval(() => {
    if (window.socket) {
      clearInterval(checkSocket);
      setupMafiaSocketListeners();
    }
  }, 200);
});
