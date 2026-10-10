// ClassVerse 4-Player Ludo Arena
let currentLudoRoom = 'LUDO-CLUB';
let ludoState = null;

// 15x15 Coordinate map for standard Ludo track
// Track coordinates for the 52 common tiles:
const LUDO_TRACK_COORDS = [
  // Red start path (col 1 to 5, row 6; col 6, row 5 to 0)
  { r: 6, c: 1 }, { r: 6, c: 2 }, { r: 6, c: 3 }, { r: 6, c: 4 }, { r: 6, c: 5 },
  { r: 5, c: 6 }, { r: 4, c: 6 }, { r: 3, c: 6 }, { r: 2, c: 6 }, { r: 1, c: 6 }, { r: 0, c: 6 },
  { r: 0, c: 7 }, // 11
  // Green side
  { r: 0, c: 8 }, { r: 1, c: 8 }, { r: 2, c: 8 }, { r: 3, c: 8 }, { r: 4, c: 8 }, { r: 5, c: 8 },
  { r: 6, c: 9 }, { r: 6, c: 10 }, { r: 6, c: 11 }, { r: 6, c: 12 }, { r: 6, c: 13 }, { r: 6, c: 14 },
  { r: 7, c: 14 }, // 24
  // Yellow side
  { r: 8, c: 14 }, { r: 8, c: 13 }, { r: 8, c: 12 }, { r: 8, c: 11 }, { r: 8, c: 10 }, { r: 8, c: 9 },
  { r: 9, c: 8 }, { r: 10, c: 8 }, { r: 11, c: 8 }, { r: 12, c: 8 }, { r: 13, c: 8 }, { r: 14, c: 8 },
  { r: 14, c: 7 }, // 37
  // Blue side
  { r: 14, c: 6 }, { r: 13, c: 6 }, { r: 12, c: 6 }, { r: 11, c: 6 }, { r: 10, c: 6 }, { r: 9, c: 6 },
  { r: 8, c: 5 }, { r: 8, c: 4 }, { r: 8, c: 3 }, { r: 8, c: 2 }, { r: 8, c: 1 }, { r: 8, c: 0 },
  { r: 7, c: 0 }  // 51
];

// Home corridors (100 to 105)
const LUDO_HOME_PATHS = {
  red: [
    { r: 7, c: 1 }, { r: 7, c: 2 }, { r: 7, c: 3 }, { r: 7, c: 4 }, { r: 7, c: 5 }, { r: 7, c: 6 } // 106 = goal
  ],
  green: [
    { r: 1, c: 7 }, { r: 2, c: 7 }, { r: 3, c: 7 }, { r: 4, c: 7 }, { r: 5, c: 7 }, { r: 6, c: 7 }
  ],
  yellow: [
    { r: 7, c: 13 }, { r: 7, c: 12 }, { r: 7, c: 11 }, { r: 7, c: 10 }, { r: 7, c: 9 }, { r: 7, c: 8 }
  ],
  blue: [
    { r: 13, c: 7 }, { r: 12, c: 7 }, { r: 11, c: 7 }, { r: 10, c: 7 }, { r: 9, c: 7 }, { r: 8, c: 7 }
  ]
};

// Yard spawn slots (4 slots inside each base)
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
  const input = document.getElementById('ludo-room-input');
  currentLudoRoom = (input ? input.value.trim() : 'LUDO-CLUB') || 'LUDO-CLUB';
  currentLudoRoom = currentLudoRoom.toUpperCase();

  if (socket) {
    socket.emit('ludo_join', { roomId: currentLudoRoom });
  }
};

window.startLudoMatch = function() {
  if (socket) {
    socket.emit('ludo_start', { roomId: currentLudoRoom });
  }
};

window.rollLudoDice = function() {
  if (!socket || !ludoState || ludoState.status !== 'playing') return;

  const currentPlayer = ludoState.players[ludoState.turnIndex];
  if (!currentPlayer || !currentUser || currentPlayer.id !== currentUser.id) return;
  if (!ludoState.canRoll) return;

  const diceEl = document.getElementById('ludo-dice-box');
  if (diceEl) {
    diceEl.classList.add('rolling');
    setTimeout(() => diceEl.classList.remove('rolling'), 600);
  }

  socket.emit('ludo_roll_dice', { roomId: currentLudoRoom });
};

window.selectLudoToken = function(tokenIndex) {
  if (!socket || !ludoState || ludoState.status !== 'playing') return;

  const currentPlayer = ludoState.players[ludoState.turnIndex];
  if (!currentPlayer || !currentUser || currentPlayer.id !== currentUser.id) return;

  socket.emit('ludo_select_token', { roomId: currentLudoRoom, tokenIndex });
};

window.resetLudoMatch = function() {
  if (socket) {
    socket.emit('ludo_reset', { roomId: currentLudoRoom });
  }
};

function renderLudoBoard() {
  const gridEl = document.getElementById('ludo-board-grid');
  if (!gridEl) return;

  gridEl.innerHTML = '';

  // Base yard regions
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const cell = document.createElement('div');
      cell.className = 'ludo-cell';
      cell.dataset.r = r;
      cell.dataset.c = c;

      // Color base backgrounds
      if (r < 6 && c < 6) {
        cell.style.backgroundColor = 'rgba(239, 68, 68, 0.25)';
      } else if (r < 6 && c >= 9) {
        cell.style.backgroundColor = 'rgba(16, 185, 129, 0.25)';
      } else if (r >= 9 && c >= 9) {
        cell.style.backgroundColor = 'rgba(245, 158, 11, 0.25)';
      } else if (r >= 9 && c < 6) {
        cell.style.backgroundColor = 'rgba(59, 130, 246, 0.25)';
      } else if (r >= 6 && r <= 8 && c >= 6 && c <= 8) {
        // Center Home Triangle
        cell.style.backgroundColor = '#1e1b4b';
        if (r === 7 && c === 7) cell.innerHTML = '👑';
      } else {
        cell.style.backgroundColor = '#0b0f19';
      }

      // Safe star cells
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

  // Render player tokens on board
  if (ludoState && ludoState.players) {
    const currentPlayer = ludoState.players[ludoState.turnIndex];
    const isMyTurn = currentPlayer && currentUser && currentPlayer.id === currentUser.id;

    ludoState.players.forEach(p => {
      const pTheme = LUDO_COLOR_THEMES[p.color];

      p.tokens.forEach((pos, tIdx) => {
        let targetCoord = null;

        if (pos === -1) {
          // In yard
          targetCoord = LUDO_YARD_COORDS[p.color][tIdx];
        } else if (pos >= 100) {
          // Home path or goal
          const step = Math.min(pos - 100, 5);
          targetCoord = LUDO_HOME_PATHS[p.color][step];
        } else if (pos >= 0 && pos < 52) {
          // Common track
          targetCoord = LUDO_TRACK_COORDS[pos];
        }

        if (targetCoord) {
          const targetCell = gridEl.querySelector(`[data-r="${targetCoord.r}"][data-c="${targetCoord.c}"]`);
          if (targetCell) {
            const tokenDisc = document.createElement('div');
            tokenDisc.className = 'ludo-token-disc';
            tokenDisc.style.backgroundColor = pTheme.bg;
            tokenDisc.textContent = (tIdx + 1);

            // Is this token movable right now?
            if (isMyTurn && ludoState.movableTokens && ludoState.movableTokens.includes(tIdx) && p.id === currentUser.id) {
              tokenDisc.classList.add('ludo-token-movable');
              tokenDisc.onclick = () => window.selectLudoToken(tIdx);
            }

            targetCell.appendChild(tokenDisc);
          }
        }
      });
    });
  }

  updateLudoUI();
}

function updateLudoUI() {
  if (!ludoState) return;

  const lobbyView = document.getElementById('ludo-lobby-view');
  const gameView = document.getElementById('ludo-game-view');
  const startBtn = document.getElementById('ludo-start-btn');

  if (ludoState.status === 'lobby') {
    if (lobbyView) lobbyView.classList.remove('hidden');
    if (gameView) gameView.classList.add('hidden');

    // Populate players list in lobby
    const playerList = document.getElementById('ludo-lobby-players');
    if (playerList) {
      playerList.innerHTML = '';
      ludoState.players.forEach(p => {
        const theme = LUDO_COLOR_THEMES[p.color];
        const card = document.createElement('div');
        card.className = `p-3 rounded-2xl bg-slate-900 border ${theme.border} flex items-center gap-3`;
        card.innerHTML = `
          <div class="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs" style="background:${theme.bg}">
            ${p.avatar || '🎲'}
          </div>
          <div>
            <div class="text-xs font-black text-white">${p.name}</div>
            <div class="text-[10px] font-mono ${theme.text} font-bold">${theme.name.toUpperCase()} TEAM</div>
          </div>
        `;
        playerList.appendChild(card);
      });
    }

    if (startBtn) {
      startBtn.disabled = ludoState.players.length < 2;
      startBtn.innerHTML = ludoState.players.length < 2 ? '⏳ Waiting for 2+ Players...' : '🚀 Start Ludo Match!';
    }
  } else {
    if (lobbyView) lobbyView.classList.add('hidden');
    if (gameView) gameView.classList.remove('hidden');

    // Turn indicator
    const currentPlayer = ludoState.players[ludoState.turnIndex];
    const turnBadge = document.getElementById('ludo-turn-badge');
    const isMyTurn = currentPlayer && currentUser && currentPlayer.id === currentUser.id;

    if (turnBadge && currentPlayer) {
      const theme = LUDO_COLOR_THEMES[currentPlayer.color];
      if (ludoState.status === 'finished') {
        turnBadge.className = 'px-4 py-1.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse';
        turnBadge.textContent = `🏆 ${ludoState.winner.name} Won the Match!`;
      } else {
        turnBadge.className = `px-4 py-1.5 rounded-full text-xs font-black bg-slate-900 border ${theme.border} ${theme.text}`;
        turnBadge.textContent = isMyTurn ? `👉 YOUR TURN TO ROLL (${theme.name.toUpperCase()})` : `⏳ ${currentPlayer.name}'s Turn`;
      }
    }

    // Dice display
    const diceBox = document.getElementById('ludo-dice-box');
    if (diceBox) {
      diceBox.textContent = ludoState.diceValue || '🎲';
      if (isMyTurn && ludoState.canRoll) {
        diceBox.classList.add('ring-4', 'ring-indigo-500', 'animate-bounce');
      } else {
        diceBox.classList.remove('ring-4', 'ring-indigo-500', 'animate-bounce');
      }
    }

    // History log
    const logContainer = document.getElementById('ludo-history-log');
    if (logContainer && ludoState.historyLog) {
      logContainer.innerHTML = '';
      ludoState.historyLog.slice(-8).forEach(msg => {
        const line = document.createElement('div');
        line.className = 'text-[11px] text-slate-300 font-mono py-0.5 border-b border-slate-800/40';
        line.textContent = msg;
        logContainer.appendChild(line);
      });
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  }
}

function setupLudoSocketListeners() {
  if (!socket) return;

  socket.on('ludo_state', (state) => {
    ludoState = state;
    renderLudoBoard();
  });
}

window.addEventListener('DOMContentLoaded', () => {
  const checkSocket = setInterval(() => {
    if (window.socket) {
      clearInterval(checkSocket);
      setupLudoSocketListeners();
    }
  }, 200);
});
