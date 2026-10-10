// ClassVerse Snake & Ladder Multiplayer Game
let currentSnlRoom = 'SNAKE-ARENA';
let snlState = null;

const SNL_LADDERS = { 4: 14, 8: 30, 20: 42, 28: 76, 36: 44, 51: 67, 71: 92, 80: 99 };
const SNL_SNAKES = { 98: 28, 95: 56, 92: 51, 83: 19, 73: 1, 69: 33, 64: 36, 59: 17, 52: 11, 48: 9 };

window.joinSnlRoom = function() {
  const input = document.getElementById('snl-room-input');
  currentSnlRoom = (input ? input.value.trim() : 'SNAKE-ARENA') || 'SNAKE-ARENA';
  currentSnlRoom = currentSnlRoom.toUpperCase();

  if (socket) {
    socket.emit('snl_join', { roomId: currentSnlRoom });
  }
};

window.rollSnlDice = function() {
  if (!socket || !snlState || snlState.winner) return;

  const currentPlayer = snlState.players[snlState.turnIndex];
  if (!currentPlayer || !currentUser || currentPlayer.id !== currentUser.id) return;

  const diceEl = document.getElementById('snl-dice-box');
  if (diceEl) {
    diceEl.classList.add('rolling');
    setTimeout(() => diceEl.classList.remove('rolling'), 600);
  }

  socket.emit('snl_roll', { roomId: currentSnlRoom });
};

window.resetSnlGame = function() {
  if (socket) {
    socket.emit('snl_reset', { roomId: currentSnlRoom });
  }
};

function getCellCoordForNumber(num) {
  // num is 1 to 100
  // row 0 is top (cells 91-100 or 100-91), row 9 is bottom (cells 1-10)
  const zeroBased = num - 1;
  const rowFromBottom = Math.floor(zeroBased / 10);
  const r = 9 - rowFromBottom;
  const colInRow = zeroBased % 10;
  // If rowFromBottom is even (0, 2, 4): left to right (0 to 9)
  // If rowFromBottom is odd (1, 3, 5): right to left (9 to 0)
  const c = (rowFromBottom % 2 === 0) ? colInRow : (9 - colInRow);
  return { r, c };
}

function renderSnlBoard() {
  const boardEl = document.getElementById('snl-board-grid');
  if (!boardEl) return;

  boardEl.innerHTML = '';

  // 100 cells
  for (let num = 100; num >= 1; num--) {
    // We render by grid order: row 0 to 9, col 0 to 9
  }

  // Iterate row by row (0 to 9), col by col (0 to 9)
  for (let r = 0; r < 10; r++) {
    const rowFromBottom = 9 - r;
    for (let c = 0; c < 10; c++) {
      const colInRow = (rowFromBottom % 2 === 0) ? c : (9 - c);
      const cellNum = (rowFromBottom * 10) + colInRow + 1;

      const cell = document.createElement('div');
      cell.className = 'snl-cell';
      cell.dataset.cellNum = cellNum;

      // Cell background
      const isAlt = (r + c) % 2 === 0;
      cell.style.backgroundColor = isAlt ? 'rgba(30, 41, 59, 0.5)' : 'rgba(15, 23, 42, 0.7)';

      // Number badge
      const numLabel = document.createElement('div');
      numLabel.className = 'snl-cell-num flex items-center justify-between';
      numLabel.innerHTML = `<span>${cellNum}</span>`;

      // Special icons for Snakes or Ladders
      if (SNL_LADDERS[cellNum]) {
        numLabel.innerHTML += `<span class="text-emerald-400 font-bold" title="Ladder to ${SNL_LADDERS[cellNum]}">🪜⬆${SNL_LADDERS[cellNum]}</span>`;
        cell.style.border = '1px solid rgba(16, 185, 129, 0.4)';
        cell.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
      } else if (SNL_SNAKES[cellNum]) {
        numLabel.innerHTML += `<span class="text-rose-400 font-bold" title="Snake down to ${SNL_SNAKES[cellNum]}">🐍⬇${SNL_SNAKES[cellNum]}</span>`;
        cell.style.border = '1px solid rgba(244, 63, 94, 0.4)';
        cell.style.backgroundColor = 'rgba(244, 63, 94, 0.15)';
      } else if (cellNum === 100) {
        numLabel.innerHTML += `<span class="text-amber-400 font-bold">👑 GOAL</span>`;
        cell.style.backgroundColor = 'rgba(245, 158, 11, 0.3)';
      }

      cell.appendChild(numLabel);

      // Token container
      const tokenBox = document.createElement('div');
      tokenBox.className = 'snl-tokens-box';
      cell.appendChild(tokenBox);

      // Put players on this cell
      if (snlState && snlState.players) {
        snlState.players.forEach(p => {
          if (p.position === cellNum) {
            const chip = document.createElement('div');
            chip.className = 'snl-player-chip';
            chip.style.backgroundColor = p.color;
            chip.textContent = p.avatar || '🏃';
            chip.title = `${p.name} (${p.studentId})`;
            tokenBox.appendChild(chip);
          }
        });
      }

      boardEl.appendChild(cell);
    }
  }

  updateSnlUI();
}

function updateSnlUI() {
  if (!snlState) return;

  const currentPlayer = snlState.players[snlState.turnIndex];
  const turnBadge = document.getElementById('snl-turn-badge');
  const isMyTurn = currentPlayer && currentUser && currentPlayer.id === currentUser.id;

  if (turnBadge && currentPlayer) {
    if (snlState.winner) {
      turnBadge.className = 'px-4 py-1.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse';
      turnBadge.textContent = `👑 ${snlState.winner.name} Reached 100 & Won!`;
    } else {
      turnBadge.className = `px-4 py-1.5 rounded-full text-xs font-black bg-slate-900 border border-slate-700 text-white`;
      turnBadge.textContent = isMyTurn ? `👉 YOUR TURN TO ROLL THE DIE!` : `⏳ ${currentPlayer.name}'s Turn to Roll`;
    }
  }

  const diceBox = document.getElementById('snl-dice-box');
  if (diceBox) {
    diceBox.textContent = snlState.lastRoll ? `🎲 ${snlState.lastRoll}` : '🎲';
    if (isMyTurn && !snlState.winner) {
      diceBox.classList.add('ring-4', 'ring-emerald-500', 'animate-bounce');
    } else {
      diceBox.classList.remove('ring-4', 'ring-emerald-500', 'animate-bounce');
    }
  }

  // Players standings list
  const standingsEl = document.getElementById('snl-standings-list');
  if (standingsEl && snlState.players) {
    standingsEl.innerHTML = '';
    const sorted = [...snlState.players].sort((a, b) => b.position - a.position);
    sorted.forEach((p, idx) => {
      const isCurrent = currentPlayer && p.id === currentPlayer.id;
      const row = document.createElement('div');
      row.className = `p-2.5 rounded-xl border flex items-center justify-between text-xs ${
        isCurrent ? 'bg-indigo-950/40 border-indigo-500/60 shadow-sm' : 'bg-slate-900/60 border-slate-800'
      }`;
      row.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full" style="background:${p.color}"></span>
          <span class="text-base">${p.avatar || '🏃'}</span>
          <span class="font-bold text-white">${p.name}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="font-mono text-emerald-400 font-black">Tile ${p.position}/100</span>
          ${idx === 0 ? '<span>🥇</span>' : ''}
        </div>
      `;
      standingsEl.appendChild(row);
    });
  }

  // Log feed
  const logContainer = document.getElementById('snl-event-log');
  if (logContainer && snlState.log) {
    logContainer.innerHTML = '';
    snlState.log.slice(-10).forEach(entry => {
      const line = document.createElement('div');
      line.className = 'text-[11px] text-slate-300 font-mono py-1 border-b border-slate-800/40';
      line.textContent = entry;
      logContainer.appendChild(line);
    });
    logContainer.scrollTop = logContainer.scrollHeight;
  }
}

function setupSnlSocketListeners() {
  if (!socket) return;

  socket.on('snl_state', (state) => {
    snlState = state;
    renderSnlBoard();
  });
}

window.addEventListener('DOMContentLoaded', () => {
  const checkSocket = setInterval(() => {
    if (window.socket) {
      clearInterval(checkSocket);
      setupSnlSocketListeners();
    }
  }, 200);
});
