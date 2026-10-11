// ClassVerse Snake & Ladder Multiplayer Game Engine
(function() {
  let currentSnlRoom = 'SNAKE-ARENA';
  let snlState = null;

  const SNL_LADDERS = { 4: 14, 8: 30, 20: 42, 28: 76, 36: 44, 51: 67, 71: 92, 80: 99 };
  const SNL_SNAKES = { 98: 28, 95: 56, 92: 51, 83: 19, 73: 1, 69: 33, 64: 36, 59: 17, 52: 11, 48: 9 };
  const SNL_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

  function getSocket() {
    return window.socket || null;
  }
  function getUser() {
    return window.currentUser || null;
  }

  window.joinSnlRoom = function() {
    window.setupSnlSocketListeners();
    const input = document.getElementById('snl-room-input');
    currentSnlRoom = (input ? input.value.trim() : 'SNAKE-ARENA') || 'SNAKE-ARENA';
    currentSnlRoom = currentSnlRoom.toUpperCase();

    const sock = getSocket();
    if (sock) {
      sock.emit('snl_join', { roomId: currentSnlRoom });
    }
    renderSnlBoard();
  };

  window.playSnlSolo = function() {
    window.setupSnlSocketListeners();
    const input = document.getElementById('snl-room-input');
    currentSnlRoom = (input ? input.value.trim() : 'SNAKE-ARENA') || 'SNAKE-ARENA';
    currentSnlRoom = currentSnlRoom.toUpperCase();

    const sock = getSocket();
    if (sock) {
      sock.emit('snl_play_solo', { roomId: currentSnlRoom });
    }
    renderSnlBoard();
  };

  window.addSnlBot = function() {
    window.setupSnlSocketListeners();
    const sock = getSocket();
    if (sock) {
      sock.emit('snl_add_bot', { roomId: currentSnlRoom });
    }
  };

  window.rollSnlDice = function() {
    const sock = getSocket();
    if (!sock) return;

    if (!snlState || snlState.winner) {
      window.playSnlSolo();
      return;
    }

    const currentPlayer = snlState.players[snlState.turnIndex];
    const u = getUser();
    if (!currentPlayer || !u || currentPlayer.id !== u.id) return;

    const diceEl = document.getElementById('snl-dice-box');
    if (diceEl) {
      diceEl.classList.add('rolling');
      setTimeout(() => diceEl.classList.remove('rolling'), 550);
    }

    sock.emit('snl_roll', { roomId: currentSnlRoom });
  };

  window.resetSnlGame = function() {
    const sock = getSocket();
    if (sock) {
      sock.emit('snl_reset', { roomId: currentSnlRoom });
    }
  };

  function renderSnlBoard() {
    const boardEl = document.getElementById('snl-board-grid');
    if (!boardEl) return;

    boardEl.innerHTML = '';

    const u = getUser();
    const activePlayers = (snlState && snlState.players && snlState.players.length > 0)
      ? snlState.players
      : [
          { id: 'me', name: (u ? u.name : 'You'), avatar: (u ? u.avatar : '🏃'), position: 1, color: SNL_COLORS[0] },
          { id: 'bot_1', name: 'Bot Turbo 🤖', avatar: '🤖', position: 1, color: SNL_COLORS[1] },
          { id: 'bot_2', name: 'Bot Viper 🤖', avatar: '🐍', position: 1, color: SNL_COLORS[2] },
          { id: 'bot_3', name: 'Bot Blaze 🤖', avatar: '⚡', position: 1, color: SNL_COLORS[3] }
        ];

    for (let r = 0; r < 10; r++) {
      const rowFromBottom = 9 - r;
      for (let c = 0; c < 10; c++) {
        const colInRow = (rowFromBottom % 2 === 0) ? c : (9 - c);
        const cellNum = (rowFromBottom * 10) + colInRow + 1;

        const cell = document.createElement('div');
        cell.className = 'snl-cell';
        cell.dataset.cellNum = cellNum;

        const isAlt = (r + c) % 2 === 0;
        cell.style.backgroundColor = isAlt ? 'rgba(30, 41, 59, 0.5)' : 'rgba(15, 23, 42, 0.7)';

        const numLabel = document.createElement('div');
        numLabel.className = 'snl-cell-num flex items-center justify-between';
        numLabel.innerHTML = `<span>${cellNum}</span>`;

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

        const tokenBox = document.createElement('div');
        tokenBox.className = 'snl-tokens-box';
        cell.appendChild(tokenBox);

        activePlayers.forEach(p => {
          if (p.position === cellNum) {
            const chip = document.createElement('div');
            chip.className = 'snl-player-chip';
            chip.style.backgroundColor = p.color;
            chip.textContent = p.avatar || '🏃';
            chip.title = `${p.name}`;
            tokenBox.appendChild(chip);
          }
        });

        boardEl.appendChild(cell);
      }
    }

    updateSnlUI();
  }

  function updateSnlUI() {
    const turnBadge = document.getElementById('snl-turn-badge');
    const diceBox = document.getElementById('snl-dice-box');
    const standingsEl = document.getElementById('snl-standings-list');
    const logContainer = document.getElementById('snl-event-log');

    const u = getUser();
    const players = (snlState && snlState.players && snlState.players.length > 0)
      ? snlState.players
      : [
          { id: 'me', name: (u ? u.name : 'You'), avatar: (u ? u.avatar : '🏃'), position: 1, color: SNL_COLORS[0] },
          { id: 'bot_1', name: 'Bot Turbo 🤖', avatar: '🤖', position: 1, color: SNL_COLORS[1] },
          { id: 'bot_2', name: 'Bot Viper 🤖', avatar: '🐍', position: 1, color: SNL_COLORS[2] },
          { id: 'bot_3', name: 'Bot Blaze 🤖', avatar: '⚡', position: 1, color: SNL_COLORS[3] }
        ];

    const currentPlayer = (snlState && snlState.players) ? snlState.players[snlState.turnIndex] : null;
    const isMyTurn = currentPlayer && u && currentPlayer.id === u.id;

    if (turnBadge) {
      if (!snlState) {
        turnBadge.className = 'px-4 py-1.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
        turnBadge.textContent = 'Roll Die or Click "Play Solo" to Race to 100!';
      } else if (snlState.winner) {
        turnBadge.className = 'px-4 py-1.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse';
        turnBadge.textContent = `👑 ${snlState.winner.name} Reached 100 & Won!`;
      } else if (currentPlayer) {
        turnBadge.className = 'px-4 py-1.5 rounded-full text-xs font-black bg-slate-900 border border-slate-700 text-white';
        turnBadge.textContent = isMyTurn ? `👉 YOUR TURN TO ROLL THE DIE!` : `⏳ ${currentPlayer.name}'s Turn to Roll`;
      }
    }

    if (diceBox) {
      diceBox.textContent = (snlState && snlState.lastRoll) ? `🎲 ${snlState.lastRoll}` : '🎲';
      if ((!snlState || isMyTurn) && !(snlState && snlState.winner)) {
        diceBox.classList.add('ring-4', 'ring-emerald-500', 'animate-bounce');
      } else {
        diceBox.classList.remove('ring-4', 'ring-emerald-500', 'animate-bounce');
      }
    }

    if (standingsEl) {
      standingsEl.innerHTML = '';
      const sorted = [...players].sort((a, b) => b.position - a.position);
      sorted.forEach((p, idx) => {
        const isCurrent = currentPlayer && p.id === currentPlayer.id;
        const row = document.createElement('div');
        row.className = `p-2.5 rounded-xl border flex items-center justify-between text-xs transition ${
          isCurrent ? 'bg-emerald-950/40 border-emerald-500/60 shadow-sm ring-1 ring-emerald-500' : 'bg-slate-900/60 border-slate-800'
        }`;
        row.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full" style="background:${p.color}"></span>
            <span class="text-base">${p.avatar || '🏃'}</span>
            <span class="font-bold text-white truncate max-w-[120px]">${p.name}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="font-mono text-emerald-400 font-black">Tile ${p.position}/100</span>
            ${idx === 0 ? '<span>🥇</span>' : ''}
          </div>
        `;
        standingsEl.appendChild(row);
      });
    }

    if (logContainer) {
      if (snlState && snlState.log && snlState.log.length > 0) {
        logContainer.innerHTML = '';
        snlState.log.slice(-10).forEach(entry => {
          const line = document.createElement('div');
          line.className = 'text-[11px] text-slate-300 font-mono py-1 border-b border-slate-800/40';
          line.textContent = entry;
          logContainer.appendChild(line);
        });
        logContainer.scrollTop = logContainer.scrollHeight;
      } else if (!snlState || !snlState.log || snlState.log.length === 0) {
        logContainer.innerHTML = `
          <div class="text-[11px] text-slate-400 font-mono py-1">🐍 Welcome to Snake & Ladder!</div>
          <div class="text-[11px] text-emerald-400 font-mono py-0.5">Ladders 🪜 advance you up, snakes 🐍 drag you down.</div>
        `;
      }
    }
  }

  window.setupSnlSocketListeners = function() {
    const sock = getSocket();
    if (!sock) return;

    sock.off('snl_state');
    sock.off('snl_error');
    sock.on('snl_state', (state) => {
      snlState = state;
      renderSnlBoard();
    });
    sock.on('snl_error', (msg) => {
      const turnBadge = document.getElementById('snl-turn-badge');
      if (turnBadge) {
        turnBadge.className = 'px-4 py-1.5 rounded-full text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse';
        turnBadge.textContent = `⚠️ ${msg}`;
        setTimeout(updateSnlUI, 2500);
      }
    });
  };

  // Immediate init
  if (typeof window !== 'undefined') {
    if (window.socket) window.setupSnlSocketListeners();
    window.addEventListener('DOMContentLoaded', () => {
      renderSnlBoard();
      if (window.socket) window.setupSnlSocketListeners();
    });
  }
})();
