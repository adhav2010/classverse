// ClassVerse 4-Player Ludo Arena
(function() {
  let currentLudoRoom = 'LUDO-CLUB';
  let ludoState = null;

  function getSocket() {
    return window.socket || null;
  }
  function getUser() {
    return window.currentUser || null;
  }

  // 15x15 Coordinate map for standard Ludo track
  const LUDO_TRACK_COORDS = [
    { r: 6, c: 1 }, { r: 6, c: 2 }, { r: 6, c: 3 }, { r: 6, c: 4 }, { r: 6, c: 5 },
    { r: 5, c: 6 }, { r: 4, c: 6 }, { r: 3, c: 6 }, { r: 2, c: 6 }, { r: 1, c: 6 }, { r: 0, c: 6 },
    { r: 0, c: 7 },
    { r: 0, c: 8 }, { r: 1, c: 8 }, { r: 2, c: 8 }, { r: 3, c: 8 }, { r: 4, c: 8 }, { r: 5, c: 8 },
    { r: 6, c: 9 }, { r: 6, c: 10 }, { r: 6, c: 11 }, { r: 6, c: 12 }, { r: 6, c: 13 }, { r: 6, c: 14 },
    { r: 7, c: 14 },
    { r: 8, c: 14 }, { r: 8, c: 13 }, { r: 8, c: 12 }, { r: 8, c: 11 }, { r: 8, c: 10 }, { r: 8, c: 9 },
    { r: 9, c: 8 }, { r: 10, c: 8 }, { r: 11, c: 8 }, { r: 12, c: 8 }, { r: 13, c: 8 }, { r: 14, c: 8 },
    { r: 14, c: 7 },
    { r: 14, c: 6 }, { r: 13, c: 6 }, { r: 12, c: 6 }, { r: 11, c: 6 }, { r: 10, c: 6 }, { r: 9, c: 6 },
    { r: 8, c: 5 }, { r: 8, c: 4 }, { r: 8, c: 3 }, { r: 8, c: 2 }, { r: 8, c: 1 }, { r: 8, c: 0 },
    { r: 7, c: 0 }
  ];

  const LUDO_HOME_PATHS = {
    red:    [{ r: 7, c: 1 }, { r: 7, c: 2 }, { r: 7, c: 3 }, { r: 7, c: 4 }, { r: 7, c: 5 }, { r: 7, c: 6 }],
    green:  [{ r: 1, c: 7 }, { r: 2, c: 7 }, { r: 3, c: 7 }, { r: 4, c: 7 }, { r: 5, c: 7 }, { r: 6, c: 7 }],
    yellow: [{ r: 7, c: 13 }, { r: 7, c: 12 }, { r: 7, c: 11 }, { r: 7, c: 10 }, { r: 7, c: 9 }, { r: 7, c: 8 }],
    blue:   [{ r: 13, c: 7 }, { r: 12, c: 7 }, { r: 11, c: 7 }, { r: 10, c: 7 }, { r: 9, c: 7 }, { r: 8, c: 7 }]
  };

  const LUDO_YARD_COORDS = {
    red:    [{ r: 2, c: 2 }, { r: 2, c: 3 }, { r: 3, c: 2 }, { r: 3, c: 3 }],
    green:  [{ r: 2, c: 11 }, { r: 2, c: 12 }, { r: 3, c: 11 }, { r: 3, c: 12 }],
    yellow: [{ r: 11, c: 11 }, { r: 11, c: 12 }, { r: 12, c: 11 }, { r: 12, c: 12 }],
    blue:   [{ r: 11, c: 2 }, { r: 11, c: 3 }, { r: 12, c: 2 }, { r: 12, c: 3 }]
  };

  const LUDO_COLOR_THEMES = {
    red: { bg: '#ef4444', text: 'text-red-400', border: 'border-red-500', name: 'Red' },
    green: { bg: '#10b981', text: 'text-emerald-400', border: 'border-emerald-500', name: 'Green' },
    yellow: { bg: '#f59e0b', text: 'text-amber-400', border: 'border-amber-500', name: 'Yellow' },
    blue: { bg: '#3b82f6', text: 'text-blue-400', border: 'border-blue-500', name: 'Blue' }
  };

  window.joinLudoRoom = function() {
    window.setupLudoSocketListeners();
    const input = document.getElementById('ludo-room-input');
    currentLudoRoom = (input ? input.value.trim() : 'LUDO-CLUB') || 'LUDO-CLUB';
    currentLudoRoom = currentLudoRoom.toUpperCase();

    const sock = getSocket();
    if (sock) {
      sock.emit('ludo_join', { roomId: currentLudoRoom });
    }
    renderLudoBoard();
  };

  window.playLudoSolo = function() {
    window.setupLudoSocketListeners();
    const input = document.getElementById('ludo-room-input');
    currentLudoRoom = (input ? input.value.trim() : 'LUDO-CLUB') || 'LUDO-CLUB';
    currentLudoRoom = currentLudoRoom.toUpperCase();

    const sock = getSocket();
    if (sock) {
      sock.emit('ludo_play_solo', { roomId: currentLudoRoom });
    }
    renderLudoBoard();
  };

  window.addLudoBot = function() {
    window.setupLudoSocketListeners();
    const sock = getSocket();
    if (sock) {
      sock.emit('ludo_add_bot', { roomId: currentLudoRoom });
    }
  };

  window.startLudoMatch = function() {
    window.setupLudoSocketListeners();
    const sock = getSocket();
    if (sock) {
      sock.emit('ludo_start', { roomId: currentLudoRoom });
    }
  };

  window.rollLudoDice = function() {
    const sock = getSocket();
    if (!sock) return;

    // If game has not started yet, automatically launch solo match vs bots
    if (!ludoState || ludoState.status !== 'playing') {
      window.playLudoSolo();
      return;
    }

    const currentPlayer = ludoState.players[ludoState.turnIndex];
    const u = getUser();
    if (!currentPlayer || !u || currentPlayer.id !== u.id) return;
    if (!ludoState.canRoll) return;

    const diceEl = document.getElementById('ludo-dice-box');
    if (diceEl) {
      diceEl.classList.add('rolling');
      setTimeout(() => diceEl.classList.remove('rolling'), 550);
    }

    sock.emit('ludo_roll_dice', { roomId: currentLudoRoom });
  };

  window.selectLudoToken = function(tokenIndex) {
    const sock = getSocket();
    if (!sock || !ludoState || ludoState.status !== 'playing') return;

    const currentPlayer = ludoState.players[ludoState.turnIndex];
    const u = getUser();
    if (!currentPlayer || !u || currentPlayer.id !== u.id) return;

    sock.emit('ludo_select_token', { roomId: currentLudoRoom, tokenIndex });
  };

  window.resetLudoMatch = function() {
    const sock = getSocket();
    if (sock) {
      sock.emit('ludo_reset', { roomId: currentLudoRoom });
    }
  };

  function renderLudoBoard() {
    const gridEl = document.getElementById('ludo-board-grid');
    if (!gridEl) return;

    gridEl.innerHTML = '';

    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        const cell = document.createElement('div');
        cell.className = 'ludo-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;

        if (r < 6 && c < 6) {
          cell.style.backgroundColor = 'rgba(239, 68, 68, 0.25)';
        } else if (r < 6 && c >= 9) {
          cell.style.backgroundColor = 'rgba(16, 185, 129, 0.25)';
        } else if (r >= 9 && c >= 9) {
          cell.style.backgroundColor = 'rgba(245, 158, 11, 0.25)';
        } else if (r >= 9 && c < 6) {
          cell.style.backgroundColor = 'rgba(59, 130, 246, 0.25)';
        } else if (r >= 6 && r <= 8 && c >= 6 && c <= 8) {
          cell.style.backgroundColor = '#1e1b4b';
          if (r === 7 && c === 7) cell.innerHTML = '👑';
        } else {
          cell.style.backgroundColor = '#0b0f19';
        }

        const safeCoords = [
          { r: 6, c: 1 }, { r: 2, c: 6 }, { r: 1, c: 8 }, { r: 6, c: 12 },
          { r: 8, c: 13 }, { r: 12, c: 8 }, { r: 13, c: 6 }, { r: 8, c: 2 }
        ];
        if (safeCoords.some(sc => sc.r === r && sc.c === c)) {
          cell.innerHTML = '⭐';
        }

        gridEl.appendChild(cell);
      }
    }

    // Determine players to render: active state or fallback preview
    const playersToRender = (ludoState && ludoState.players && ludoState.players.length > 0)
      ? ludoState.players
      : [
          { id: 'me', name: (getUser() ? getUser().name : 'You'), color: 'red', tokens: [-1, -1, -1, -1] },
          { id: 'bot_green', name: 'Bot Green 🤖', color: 'green', tokens: [-1, -1, -1, -1] },
          { id: 'bot_yellow', name: 'Bot Yellow 🤖', color: 'yellow', tokens: [-1, -1, -1, -1] },
          { id: 'bot_blue', name: 'Bot Blue 🤖', color: 'blue', tokens: [-1, -1, -1, -1] }
        ];

    const currentPlayer = (ludoState && ludoState.players) ? ludoState.players[ludoState.turnIndex] : null;
    const u = getUser();
    const isMyTurn = currentPlayer && u && currentPlayer.id === u.id;

    playersToRender.forEach(p => {
      const pTheme = LUDO_COLOR_THEMES[p.color] || LUDO_COLOR_THEMES.red;

      p.tokens.forEach((pos, tIdx) => {
        let targetCoord = null;

        if (pos === -1) {
          targetCoord = LUDO_YARD_COORDS[p.color][tIdx];
        } else if (pos >= 100) {
          const step = Math.min(pos - 100, 5);
          targetCoord = LUDO_HOME_PATHS[p.color][step];
        } else if (pos >= 0 && pos < 52) {
          targetCoord = LUDO_TRACK_COORDS[pos];
        }

        if (targetCoord) {
          const targetCell = gridEl.querySelector(`[data-r="${targetCoord.r}"][data-c="${targetCoord.c}"]`);
          if (targetCell) {
            const tokenDisc = document.createElement('div');
            tokenDisc.className = 'ludo-token-disc';
            tokenDisc.style.backgroundColor = pTheme.bg;
            tokenDisc.textContent = (tIdx + 1);

            if (isMyTurn && ludoState && ludoState.movableTokens && ludoState.movableTokens.includes(tIdx) && p.id === u.id) {
              tokenDisc.classList.add('ludo-token-movable');
              tokenDisc.onclick = () => window.selectLudoToken(tIdx);
            }

            targetCell.appendChild(tokenDisc);
          }
        }
      });
    });

    updateLudoUI();
  }

  function updateLudoUI() {
    const startBtn = document.getElementById('ludo-start-btn');
    const turnBadge = document.getElementById('ludo-turn-badge');
    const diceBox = document.getElementById('ludo-dice-box');
    const rosterList = document.getElementById('ludo-lobby-players');
    const logContainer = document.getElementById('ludo-history-log');

    const u = getUser();
    const players = (ludoState && ludoState.players && ludoState.players.length > 0)
      ? ludoState.players
      : [
          { id: 'me', name: (u ? u.name : 'You'), avatar: (u ? u.avatar : '🎲'), color: 'red', tokens: [-1, -1, -1, -1] },
          { id: 'bot_green', name: 'Bot Green 🤖', avatar: '🤖', color: 'green', tokens: [-1, -1, -1, -1] },
          { id: 'bot_yellow', name: 'Bot Yellow 🤖', avatar: '🤖', color: 'yellow', tokens: [-1, -1, -1, -1] },
          { id: 'bot_blue', name: 'Bot Blue 🤖', avatar: '🤖', color: 'blue', tokens: [-1, -1, -1, -1] }
        ];

    // Render roster
    if (rosterList) {
      rosterList.innerHTML = '';
      players.forEach(p => {
        const theme = LUDO_COLOR_THEMES[p.color] || LUDO_COLOR_THEMES.red;
        const isCurrent = ludoState && ludoState.status === 'playing' && ludoState.players && ludoState.players[ludoState.turnIndex] && ludoState.players[ludoState.turnIndex].id === p.id;
        const card = document.createElement('div');
        card.className = `p-2.5 rounded-xl border flex items-center justify-between text-xs transition ${
          isCurrent ? 'bg-indigo-950/60 border-indigo-400 shadow-md ring-1 ring-indigo-400' : `bg-slate-900/80 ${theme.border}`
        }`;
        card.innerHTML = `
          <div class="flex items-center gap-2.5">
            <div class="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm" style="background:${theme.bg}">
              ${p.avatar || '🎲'}
            </div>
            <div>
              <div class="text-xs font-black text-white truncate max-w-[110px]">${p.name}</div>
              <div class="text-[9px] font-mono ${theme.text} font-bold">${theme.name.toUpperCase()} TEAM</div>
            </div>
          </div>
          ${isCurrent ? '<span class="text-xs animate-bounce">🎲</span>' : ''}
        `;
        rosterList.appendChild(card);
      });
    }

    if (!ludoState || ludoState.status === 'lobby') {
      if (turnBadge) {
        turnBadge.className = 'px-3.5 py-1.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40';
        turnBadge.textContent = 'Roll Dice or Click "Play Solo" to Begin!';
      }
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.textContent = '🚀 Start Match';
      }
      if (diceBox) {
        diceBox.textContent = '🎲';
        diceBox.classList.add('ring-2', 'ring-amber-500');
      }
      if (logContainer && (!ludoState || !ludoState.historyLog || ludoState.historyLog.length === 0)) {
        logContainer.innerHTML = `
          <div class="text-[11px] text-slate-400 font-mono py-1">🎲 Welcome to Ludo Royale!</div>
          <div class="text-[11px] text-indigo-400 font-mono py-0.5">Click "Roll Dice" or "Play Solo" to start.</div>
        `;
      }
    } else {
      const currentPlayer = ludoState.players[ludoState.turnIndex];
      const isMyTurn = currentPlayer && u && currentPlayer.id === u.id;

      if (turnBadge && currentPlayer) {
        const theme = LUDO_COLOR_THEMES[currentPlayer.color] || LUDO_COLOR_THEMES.red;
        if (ludoState.status === 'finished') {
          turnBadge.className = 'px-4 py-1.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse';
          turnBadge.textContent = `🏆 ${ludoState.winner.name} Won the Match!`;
        } else {
          turnBadge.className = `px-4 py-1.5 rounded-full text-xs font-black bg-slate-900 border ${theme.border} ${theme.text}`;
          turnBadge.textContent = isMyTurn ? `👉 YOUR TURN TO ROLL (${theme.name.toUpperCase()})` : `⏳ ${currentPlayer.name}'s Turn`;
        }
      }

      if (diceBox) {
        diceBox.textContent = ludoState.diceValue ? `🎲 ${ludoState.diceValue}` : '🎲';
        if (isMyTurn && ludoState.canRoll) {
          diceBox.classList.add('ring-4', 'ring-indigo-500', 'animate-bounce');
        } else {
          diceBox.classList.remove('ring-4', 'ring-indigo-500', 'animate-bounce');
        }
      }

      if (startBtn) {
        startBtn.textContent = 'In Progress';
        startBtn.disabled = true;
      }

      if (logContainer && ludoState.historyLog) {
        logContainer.innerHTML = '';
        ludoState.historyLog.slice(-10).forEach(msg => {
          const line = document.createElement('div');
          line.className = 'text-[11px] text-slate-300 font-mono py-0.5 border-b border-slate-800/40';
          line.textContent = msg;
          logContainer.appendChild(line);
        });
        logContainer.scrollTop = logContainer.scrollHeight;
      }
    }
  }

  window.setupLudoSocketListeners = function() {
    const sock = getSocket();
    if (!sock) return;

    sock.off('ludo_state');
    sock.off('ludo_error');
    sock.on('ludo_state', (state) => {
      ludoState = state;
      renderLudoBoard();
    });
    sock.on('ludo_error', (msg) => {
      const turnBadge = document.getElementById('ludo-turn-badge');
      if (turnBadge) {
        turnBadge.className = 'px-4 py-1.5 rounded-full text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse';
        turnBadge.textContent = `⚠️ ${msg}`;
        setTimeout(updateLudoUI, 2500);
      }
    });
  };

  // Immediate init
  if (typeof window !== 'undefined') {
    if (window.socket) window.setupLudoSocketListeners();
    window.addEventListener('DOMContentLoaded', () => {
      renderLudoBoard();
      if (window.socket) window.setupLudoSocketListeners();
    });
  }
})();
