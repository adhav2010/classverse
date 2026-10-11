// ClassVerse Mafia (Social Deduction Party Game) Engine
(function() {
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

  function getSocket() {
    return window.socket || null;
  }
  function getUser() {
    return window.currentUser || null;
  }

  window.joinMafiaRoom = function() {
    window.setupMafiaSocketListeners();
    const input = document.getElementById('mafia-room-input');
    currentMafiaRoom = (input ? input.value.trim() : 'MAFIA-MANOR') || 'MAFIA-MANOR';
    currentMafiaRoom = currentMafiaRoom.toUpperCase();

    const sock = getSocket();
    if (sock) {
      sock.emit('mafia_join', { roomId: currentMafiaRoom });
    }
    updateMafiaUI();
  };

  window.fastForwardMafia = function() {
    const sock = getSocket();
    if (sock) {
      sock.emit('mafia_fast_forward', { roomId: currentMafiaRoom });
    }
  };

  window.startMafiaGame = function() {
    window.setupMafiaSocketListeners();
    const sock = getSocket();
    if (sock) {
      sock.emit('mafia_start', { roomId: currentMafiaRoom });
    }
  };

  window.submitNightAction = function(targetId) {
    const sock = getSocket();
    if (!sock) return;

    if (!mafiaState || mafiaState.phase !== 'night') {
      return;
    }
    if (!isMyPlayerAlive) return;

    selectedNightTarget = targetId;

    let actionType = 'kill';
    if (myRole === 'doctor') actionType = 'protect';
    if (myRole === 'detective') actionType = 'inspect';

    sock.emit('mafia_action', {
      roomId: currentMafiaRoom,
      type: actionType,
      targetId
    });

    updateMafiaUI();
  };

  window.submitDayVote = function(targetId) {
    const sock = getSocket();
    if (!sock) return;

    if (!mafiaState || mafiaState.phase !== 'day') {
      return;
    }
    if (!isMyPlayerAlive) return;

    selectedDayVote = targetId;

    sock.emit('mafia_vote', {
      roomId: currentMafiaRoom,
      targetId
    });

    updateMafiaUI();
  };

  window.resetMafiaGame = function() {
    const sock = getSocket();
    if (sock) {
      sock.emit('mafia_reset', { roomId: currentMafiaRoom });
    }
  };

  function updateMafiaUI() {
    const container = document.getElementById('game-container-mafia');
    const phase = mafiaState ? mafiaState.phase : 'lobby';
    const phaseTheme = phase === 'night' ? 'mafia-night-theme' : 'mafia-day-theme';

    if (container) {
      container.classList.remove('mafia-night-theme', 'mafia-day-theme');
      if (phase === 'night' || phase === 'day') {
        container.classList.add(phaseTheme);
      }
    }

    const phaseBanner = document.getElementById('mafia-phase-badge');
    if (phaseBanner) {
      if (!mafiaState || phase === 'lobby') {
        phaseBanner.className = 'px-4 py-1.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40';
        phaseBanner.textContent = 'Gathering Villagers in Town Square — Waiting for classmates to join (Min 3 players)';
      } else if (phase === 'night') {
        phaseBanner.className = 'px-4 py-1.5 rounded-full text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/40 animate-pulse';
        if (myRole === 'villager') {
          phaseBanner.innerHTML = `🌙 NIGHT PHASE (${mafiaState.timeLeft}s) — You are safe asleep! Click ⏩ Fast Forward to morning.`;
        } else {
          phaseBanner.innerHTML = `🌙 NIGHT PHASE (${mafiaState.timeLeft}s) — Select your night target below!`;
        }
      } else if (phase === 'day') {
        phaseBanner.className = 'px-4 py-1.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40';
        phaseBanner.innerHTML = `☀️ DAY PHASE (${mafiaState.timeLeft}s) — Click a suspect to vote exile!`;
      } else if (phase === 'ended') {
        phaseBanner.className = 'px-4 py-1.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
        phaseBanner.textContent = mafiaState.winner === 'villagers' ? '🏆 VILLAGERS SAVED THE TOWN!' : '🩸 MAFIA OVERTOOK THE TOWN!';
      }
    }

    const roleCard = document.getElementById('mafia-my-role-card');
    if (roleCard) {
      if (myRole && mafiaState && mafiaState.phase !== 'lobby') {
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

    const playersGrid = document.getElementById('mafia-players-grid');
    const u = getUser();
    const players = (mafiaState && mafiaState.players && mafiaState.players.length > 0)
      ? mafiaState.players
      : [
          { id: (u ? u.id : 'me'), name: (u ? u.name : 'You'), avatar: (u ? u.avatar : '🧑‍🌾'), isAlive: true }
        ];

    if (playersGrid) {
      playersGrid.innerHTML = '';
      players.forEach(p => {
        const isMe = u && p.id === u.id;
        const isDead = p.isAlive === false;
        const card = document.createElement('div');
        card.className = `p-3.5 rounded-2xl border transition relative overflow-hidden ${
          isDead ? 'bg-slate-950/80 border-slate-800 opacity-50 grayscale' : 'glass-card border-slate-700/80'
        }`;

        const isNightSelected = selectedNightTarget === p.id;
        const isDayVoteSelected = selectedDayVote === p.id;

        if (isNightSelected || isDayVoteSelected) {
          card.style.borderColor = '#ec4899';
          card.style.boxShadow = '0 0 15px rgba(236,72,153,0.5)';
        }

        let votesCount = 0;
        if (mafiaState && mafiaState.votes) {
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

        if (isMyPlayerAlive && !isDead && mafiaState) {
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

    const startBtn = document.getElementById('mafia-start-btn');
    if (startBtn) {
      if (!mafiaState || mafiaState.phase === 'lobby') {
        startBtn.classList.remove('hidden');
        startBtn.textContent = '🚀 Start Match';
      } else {
        startBtn.classList.add('hidden');
      }
    }

    const resetBtn = document.getElementById('mafia-reset-btn');
    if (resetBtn) {
      if (mafiaState && mafiaState.phase === 'ended') {
        resetBtn.classList.remove('hidden');
      } else {
        resetBtn.classList.add('hidden');
      }
    }

    const logEl = document.getElementById('mafia-story-log');
    if (logEl) {
      if (mafiaState && mafiaState.log && mafiaState.log.length > 0) {
        logEl.innerHTML = '';
        mafiaState.log.slice(-15).forEach(line => {
          const row = document.createElement('div');
          row.className = 'text-xs text-slate-300 py-1 border-b border-slate-800/60 leading-relaxed';
          row.textContent = line;
          logEl.appendChild(row);
        });
        logEl.scrollTop = logEl.scrollHeight;
      } else if (!mafiaState || !mafiaState.log || mafiaState.log.length === 0) {
        logEl.innerHTML = `
          <div class="text-xs text-slate-400 py-1">🕵️ Welcome to Mafia Manor!</div>
          <div class="text-xs text-purple-400 py-0.5">Gather 3+ classmates in room and click "Start Match" to begin secret night actions and day voting!</div>
        `;
      }
    }
  }

  window.setupMafiaSocketListeners = function() {
    const sock = getSocket();
    if (!sock) return;

    sock.off('mafia_state');
    sock.off('mafia_my_role');
    sock.off('mafia_inspect_result');
    sock.off('mafia_error');
    sock.off('mafia_tick');

    sock.on('mafia_state', (state) => {
      mafiaState = state;
      updateMafiaUI();
    });

    sock.on('mafia_my_role', ({ role, isAlive }) => {
      myRole = role;
      isMyPlayerAlive = isAlive;
      updateMafiaUI();
    });

    sock.on('mafia_inspect_result', ({ targetName, isMafia }) => {
      alert(`🔍 Detective Investigation Report:\n${targetName} is ${isMafia ? 'MAFIA! 🚨' : 'INNOCENT! ✅'}`);
    });

    sock.on('mafia_error', (msg) => {
      alert(`⚠️ Mafia Notice: ${msg}`);
    });

    sock.on('mafia_tick', ({ timeLeft }) => {
      if (mafiaState) {
        mafiaState.timeLeft = timeLeft;
        const phaseBanner = document.getElementById('mafia-phase-badge');
        if (phaseBanner) {
          if (mafiaState.phase === 'night') {
            if (myRole === 'villager') {
              phaseBanner.innerHTML = `🌙 NIGHT PHASE (${timeLeft}s) — You are safe asleep! Click ⏩ Fast Forward to morning.`;
            } else {
              phaseBanner.innerHTML = `🌙 NIGHT PHASE (${timeLeft}s) — Select your night target below!`;
            }
          } else if (mafiaState.phase === 'day') {
            phaseBanner.innerHTML = `☀️ DAY PHASE (${timeLeft}s) — Click a suspect to vote exile!`;
          }
        }
      }
    });
  };

  // Immediate init
  if (typeof window !== 'undefined') {
    if (window.socket) window.setupMafiaSocketListeners();
    window.addEventListener('DOMContentLoaded', () => {
      updateMafiaUI();
      if (window.socket) window.setupMafiaSocketListeners();
    });
  }
})();
