// ClassVerse Grandmaster Chess Engine with Live Spectators & Bot Mode
(function() {
  let currentChessRoom = 'GRANDMASTER-1';
  let chessState = null;
  let selectedSquare = null;
  let legalMovesForSelected = [];
  let boardFlipped = false;
  let vsBotMode = false;
  let localChess = null;

  const UNICODE_PIECES = {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
  };

  function getSocket() {
    return window.socket || null;
  }
  function getUser() {
    return window.currentUser || null;
  }

  function initLocalChess() {
    if (typeof Chess !== 'undefined') {
      localChess = new Chess();
    }
  }

  let allChessRooms = [];

  window.joinChessRoom = function(asSpectator = false, targetRoomId = null) {
    vsBotMode = false;
    if (targetRoomId) {
      currentChessRoom = targetRoomId.toUpperCase();
      const input = document.getElementById('chess-room-input');
      if (input) input.value = currentChessRoom;
    } else {
      const input = document.getElementById('chess-room-input');
      currentChessRoom = (input ? input.value.trim() : 'GRANDMASTER-1') || 'GRANDMASTER-1';
      currentChessRoom = currentChessRoom.toUpperCase();
    }

    const select = document.getElementById('chess-room-select');
    if (select) select.value = currentChessRoom;

    const sock = getSocket();
    if (sock) {
      sock.emit('chess_join', { roomId: currentChessRoom, asSpectator });
    } else {
      initLocalChess();
      renderChessBoard();
    }
  };

  window.joinChessAsSpectator = function(roomId) {
    window.joinChessRoom(true, roomId);
  };

  window.watchSpecificChessMatch = function(roomId) {
    if (!roomId) return;
    window.joinChessRoom(true, roomId);
    const dir = document.getElementById('chess-matches-directory');
    if (dir && !dir.classList.contains('hidden')) {
      dir.classList.add('hidden');
    }
  };

  window.switchChessTableFromSelect = function(roomId) {
    if (!roomId) return;
    window.joinChessRoom(true, roomId);
  };

  window.toggleChessMatchesDirectory = function() {
    const dir = document.getElementById('chess-matches-directory');
    if (!dir) return;
    dir.classList.toggle('hidden');
    if (!dir.classList.contains('hidden')) {
      const sock = getSocket();
      if (sock) sock.emit('chess_get_rooms');
    }
  };

  window.openChessNewMatchModal = function() {
    const modal = document.getElementById('chess-new-match-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    populateChessOpponentsDropdown();
  };

  window.closeChessNewMatchModal = function() {
    const modal = document.getElementById('chess-new-match-modal');
    if (modal) modal.classList.add('hidden');
  };

  function populateChessOpponentsDropdown() {
    const select = document.getElementById('chess-modal-opponent-select');
    if (!select) return;

    const users = (window.cachedOnlineUsers || []).filter(u => {
      const me = getUser();
      return !me || u.studentId !== me.studentId;
    });

    select.innerHTML = '';
    if (users.length === 0) {
      select.innerHTML = '<option value="">No other classmates online right now</option>';
    } else {
      select.innerHTML = '<option value="">-- Choose Classmate to Duel --</option>';
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.studentId;
        opt.textContent = `${u.avatar || '🎓'} ${u.name} (${u.studentId})`;
        select.appendChild(opt);
      });
    }
  }

  window.onOnlineUsersUpdated = function() {
    const modal = document.getElementById('chess-new-match-modal');
    if (modal && !modal.classList.contains('hidden')) {
      populateChessOpponentsDropdown();
    }
  };

  window.sendChessDuelInvite = function() {
    const select = document.getElementById('chess-modal-opponent-select');
    const targetStudentId = select ? select.value : '';
    if (!targetStudentId) {
      alert('Please select an online classmate to challenge!');
      return;
    }

    const u = getUser();
    const myIdClean = u ? u.studentId.replace(/[^a-zA-Z0-9]/g, '') : 'ME';
    const targetClean = targetStudentId.replace(/[^a-zA-Z0-9]/g, '');
    const roomName = `CHESS-${myIdClean}-VS-${targetClean}`;

    const sock = getSocket();
    if (sock) {
      sock.emit('chess_create_match', { roomName, targetStudentId });
      window.joinChessRoom(false, roomName);
      window.closeChessNewMatchModal();
      alert(`⚔️ Chess Challenge sent! Table "${roomName}" created. You are playing White ⚪. Waiting for your classmate to accept!`);
    }
  };

  window.createCustomChessTable = function() {
    const input = document.getElementById('chess-modal-room-name');
    let roomName = (input ? input.value.trim() : '') || `TABLE-${Math.floor(100 + Math.random() * 900)}`;
    roomName = roomName.toUpperCase();

    const sock = getSocket();
    if (sock) {
      sock.emit('chess_create_match', { roomName });
      window.joinChessRoom(false, roomName);
      window.closeChessNewMatchModal();
    }
  };

  window.startChessVsBot = function() {
    vsBotMode = true;
    initLocalChess();
    if (localChess) localChess.reset();
    selectedSquare = null;
    legalMovesForSelected = [];

    chessState = {
      id: 'SOLO-BOT',
      fen: localChess ? localChess.fen() : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'w',
      status: 'playing',
      winner: null,
      whitePlayer: getUser() || { name: 'You', avatar: '🎓', studentId: 'YOU' },
      blackPlayer: { name: 'Chess Bot 🤖', avatar: '🤖', studentId: 'BOT-AI' },
      spectators: [],
      history: [],
      lastMove: null,
      inCheck: false,
      isCheckmate: false,
      isDraw: false
    };

    renderChessBoard();
  };

  window.flipChessBoard = function() {
    boardFlipped = !boardFlipped;
    renderChessBoard();
  };

  window.requestChessRematch = function() {
    if (vsBotMode) {
      window.startChessVsBot();
      return;
    }
    const sock = getSocket();
    if (sock) {
      sock.emit('chess_rematch', { roomId: currentChessRoom });
    }
  };

  window.sendChessCheer = function(emoji) {
    const sock = getSocket();
    if (sock) {
      sock.emit('chess_cheer', { roomId: currentChessRoom, emoji });
    }
    triggerCheerVisual({ sender: 'You', emoji });
  };

  function triggerCheerVisual({ sender, emoji }) {
    const boardEl = document.getElementById('chess-board-grid');
    if (!boardEl) return;

    const cheer = document.createElement('div');
    cheer.className = 'cheer-float-emoji';
    cheer.textContent = emoji;
    const randX = Math.floor(Math.random() * 200) - 100;
    cheer.style.setProperty('--rand-x', randX);
    cheer.style.left = `calc(50% + ${randX}px)`;
    cheer.style.bottom = '20px';
    boardEl.appendChild(cheer);

    setTimeout(() => cheer.remove(), 2100);
  }

  function parseFen(fen) {
    const parts = fen.split(' ');
    const rows = parts[0].split('/');
    const board = [];

    for (let r = 0; r < 8; r++) {
      const row = [];
      const fenRow = rows[r];
      for (let c = 0; c < fenRow.length; c++) {
        const char = fenRow[c];
        if (/\d/.test(char)) {
          const count = parseInt(char, 10);
          for (let i = 0; i < count; i++) row.push(null);
        } else {
          row.push(char);
        }
      }
      board.push(row);
    }
    return board;
  }

  function coordToSquare(r, c) {
    const file = String.fromCharCode(97 + c);
    const rank = 8 - r;
    return `${file}${rank}`;
  }

  function squareToCoord(sq) {
    const file = sq.charCodeAt(0) - 97;
    const rank = 8 - parseInt(sq[1], 10);
    return { r: rank, c: file };
  }

  function renderChessBoard() {
    const boardEl = document.getElementById('chess-board-grid');
    if (!boardEl) return;

    if (!chessState) {
      // Default starting state
      chessState = {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        status: 'waiting',
        winner: null,
        whitePlayer: getUser() || { name: 'Player 1', avatar: '🎓' },
        blackPlayer: null,
        spectators: [],
        history: [],
        lastMove: null,
        inCheck: false
      };
    }

    boardEl.innerHTML = '';
    const board2D = parseFen(chessState.fen);

    const u = getUser();
    const isWhitePlayer = chessState.whitePlayer && u && chessState.whitePlayer.id === u.id;
    const isBlackPlayer = chessState.blackPlayer && u && chessState.blackPlayer.id === u.id;

    const shouldFlip = boardFlipped || (isBlackPlayer && !boardFlipped);

    const rOrder = shouldFlip ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];
    const cOrder = shouldFlip ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];

    for (const r of rOrder) {
      for (const c of cOrder) {
        const sqName = coordToSquare(r, c);
        const piece = board2D[r][c];

        const cell = document.createElement('div');
        const isLight = (r + c) % 2 === 0;
        cell.className = `chess-sq ${isLight ? 'chess-sq-light' : 'chess-sq-dark'}`;
        cell.dataset.sq = sqName;

        if (selectedSquare === sqName) {
          cell.classList.add('selected');
        }

        if (chessState.lastMove && (chessState.lastMove.from === sqName || chessState.lastMove.to === sqName)) {
          cell.classList.add('last-move');
        }

        if (piece) {
          const isKing = (piece === 'K' && chessState.turn === 'w') || (piece === 'k' && chessState.turn === 'b');
          if (isKing && chessState.inCheck) {
            cell.classList.add('in-check');
          }

          const pSpan = document.createElement('span');
          pSpan.textContent = UNICODE_PIECES[piece] || piece;
          pSpan.className = piece === piece.toUpperCase()
            ? 'text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]'
            : 'text-slate-900 drop-shadow-[0_1px_2px_rgba(255,255,255,0.4)]';
          cell.appendChild(pSpan);
        }

        // Show legal move dots on destinations
        if (legalMovesForSelected && legalMovesForSelected.includes(sqName)) {
          const dot = document.createElement('div');
          dot.className = piece ? 'chess-legal-capture' : 'chess-legal-dot';
          cell.appendChild(dot);
        }

        cell.onclick = () => onSquareClick(sqName, piece);
        boardEl.appendChild(cell);
      }
    }

    updateChessStatusUI();
  }

  function onSquareClick(sqName, piece) {
    if (!chessState) return;

    if (vsBotMode) {
      handleBotGameClick(sqName, piece);
      return;
    }

    // Multiplayer mode
    const u = getUser();
    const isWhiteTurn = chessState.turn === 'w';
    const isMyTurn = (isWhiteTurn && chessState.whitePlayer && u && chessState.whitePlayer.id === u.id) ||
                     (!isWhiteTurn && chessState.blackPlayer && u && chessState.blackPlayer.id === u.id);

    // If waiting for 2nd player and user clicks, inform them
    if (chessState.status === 'waiting') {
      alert("⏳ Waiting for Player 2 to join match! Or click 'Play vs Bot 🤖' to play immediately.");
      return;
    }

    if (!isMyTurn) return;

    if (!selectedSquare) {
      if (!piece) return;
      const isWhitePiece = piece === piece.toUpperCase();
      if ((isWhiteTurn && !isWhitePiece) || (!isWhiteTurn && isWhitePiece)) return;

      selectedSquare = sqName;
      // Calculate legal moves using client chess if available
      legalMovesForSelected = [];
      if (typeof Chess !== 'undefined') {
        try {
          const tempC = new Chess(chessState.fen);
          const legal = tempC.moves({ square: sqName, verbose: true });
          legalMovesForSelected = legal.map(m => m.to);
        } catch (e) {}
      }
      renderChessBoard();
    } else {
      if (selectedSquare === sqName) {
        selectedSquare = null;
        legalMovesForSelected = [];
        renderChessBoard();
        return;
      }

      const from = selectedSquare;
      const to = sqName;
      selectedSquare = null;
      legalMovesForSelected = [];

      let promotion = undefined;
      const board2D = parseFen(chessState.fen);
      const coordFrom = squareToCoord(from);
      const pieceMoving = board2D[coordFrom.r][coordFrom.c];
      if (pieceMoving && pieceMoving.toLowerCase() === 'p') {
        if ((pieceMoving === 'P' && to[1] === '8') || (pieceMoving === 'p' && to[1] === '1')) {
          promotion = 'q';
        }
      }

      const sock = getSocket();
      if (sock) {
        sock.emit('chess_move', {
          roomId: currentChessRoom,
          from,
          to,
          promotion
        });
      }
      renderChessBoard();
    }
  }

  function handleBotGameClick(sqName, piece) {
    if (!localChess || localChess.turn() !== 'w' || localChess.game_over()) return;

    if (!selectedSquare) {
      if (!piece || piece !== piece.toUpperCase()) return; // Must be white piece
      selectedSquare = sqName;
      const legal = localChess.moves({ square: sqName, verbose: true });
      legalMovesForSelected = legal.map(m => m.to);
      renderChessBoard();
    } else {
      if (selectedSquare === sqName) {
        selectedSquare = null;
        legalMovesForSelected = [];
        renderChessBoard();
        return;
      }

      const from = selectedSquare;
      const to = sqName;
      selectedSquare = null;
      legalMovesForSelected = [];

      let promotion = 'q';
      const move = localChess.move({ from, to, promotion });

      if (move) {
        syncStateFromLocalChess({ from, to });
        renderChessBoard();

        // Bot move after 450ms
        if (!localChess.game_over()) {
          setTimeout(makeBotMove, 450);
        }
      } else {
        renderChessBoard();
      }
    }
  }

  function makeBotMove() {
    if (!localChess || localChess.turn() !== 'b' || localChess.game_over()) return;

    const moves = localChess.moves({ verbose: true });
    if (moves.length === 0) return;

    // Prioritize captures or checks, otherwise random move
    const captures = moves.filter(m => m.captured);
    const chosen = captures.length > 0
      ? captures[Math.floor(Math.random() * captures.length)]
      : moves[Math.floor(Math.random() * moves.length)];

    localChess.move(chosen);
    syncStateFromLocalChess({ from: chosen.from, to: chosen.to });
    renderChessBoard();
  }

  function syncStateFromLocalChess(lastMove) {
    if (!localChess) return;
    chessState.fen = localChess.fen();
    chessState.turn = localChess.turn();
    chessState.lastMove = lastMove;
    chessState.history = localChess.history();
    chessState.inCheck = localChess.in_check();

    if (localChess.in_checkmate()) {
      chessState.status = 'checkmate';
      chessState.winner = localChess.turn() === 'w' ? 'black' : 'white';
    } else if (localChess.in_draw()) {
      chessState.status = 'draw';
    } else {
      chessState.status = 'playing';
    }
  }

  function updateChessStatusUI() {
    if (!chessState) return;

    const u = getUser();
    const isWhitePlayer = chessState.whitePlayer && u && chessState.whitePlayer.id === u.id;
    const isBlackPlayer = chessState.blackPlayer && u && chessState.blackPlayer.id === u.id;
    const isSpectator = !isWhitePlayer && !isBlackPlayer;

    const pWhiteName = document.getElementById('chess-name-white');
    const pBlackName = document.getElementById('chess-name-black');
    if (pWhiteName) pWhiteName.textContent = chessState.whitePlayer ? chessState.whitePlayer.name : 'Waiting...';
    if (pBlackName) pBlackName.textContent = chessState.blackPlayer ? chessState.blackPlayer.name : (vsBotMode ? 'Chess Bot 🤖' : 'Waiting...');

    const roleBadge = document.getElementById('chess-role-badge');
    if (roleBadge) {
      if (vsBotMode) {
        roleBadge.className = 'px-3 py-1 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 shadow-sm';
        roleBadge.innerHTML = '🤖 Solo vs Bot AI';
      } else if (isSpectator) {
        roleBadge.className = 'px-3 py-1 rounded-full text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1.5 shadow-sm';
        roleBadge.innerHTML = '<i class="fa-solid fa-eye text-purple-400"></i> Spectator Mode';
      } else if (isWhitePlayer) {
        roleBadge.className = 'px-3 py-1 rounded-full text-xs font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5 shadow-sm';
        roleBadge.innerHTML = '♔ Playing as White';
      } else {
        roleBadge.className = 'px-3 py-1 rounded-full text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1.5 shadow-sm';
        roleBadge.innerHTML = '♚ Playing as Black';
      }
    }

    const turnBadge = document.getElementById('chess-turn-badge');
    if (turnBadge) {
      if (chessState.status === 'checkmate') {
        const winnerName = chessState.winner === 'white' ? 'White' : 'Black';
        turnBadge.className = 'px-4 py-1.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse';
        turnBadge.textContent = `🏆 Checkmate! ${winnerName} Wins!`;
      } else if (chessState.status === 'draw') {
        turnBadge.className = 'px-4 py-1.5 rounded-full text-xs font-black bg-slate-500/20 text-slate-300 border border-slate-500/40';
        turnBadge.textContent = `🤝 Game Drawn`;
      } else if (chessState.status === 'waiting' && !vsBotMode) {
        turnBadge.className = 'px-4 py-1.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40';
        turnBadge.textContent = `⏳ Waiting for opponent to join...`;
      } else {
        const isWhiteTurn = chessState.turn === 'w';
        turnBadge.className = `px-4 py-1.5 rounded-full text-xs font-black ${
          isWhiteTurn ? 'bg-slate-200 text-slate-900 shadow-md' : 'bg-slate-900 text-white border border-slate-700'
        }`;
        turnBadge.textContent = isWhiteTurn ? "⚪ White's Move" : "⚫ Black's Move";
        if (chessState.inCheck) {
          turnBadge.textContent += " (Check!)";
        }
      }
    }

    const specCount = document.getElementById('chess-spectator-count');
    if (specCount) specCount.textContent = chessState.spectators ? chessState.spectators.length : 0;

    const specList = document.getElementById('chess-spectators-list');
    if (specList) {
      specList.innerHTML = '';
      if (chessState.spectators && chessState.spectators.length > 0) {
        chessState.spectators.forEach(s => {
          const chip = document.createElement('span');
          chip.className = 'px-2.5 py-1 rounded-xl bg-slate-800/90 border border-slate-700 text-[11px] font-bold text-slate-300 flex items-center gap-1';
          chip.innerHTML = `<span>${s.avatar || '👁️'}</span><span>${s.name}</span>`;
          specList.appendChild(chip);
        });
      } else {
        specList.innerHTML = '<span class="text-xs text-slate-500 italic">No spectators watching yet</span>';
      }
    }

    const historyList = document.getElementById('chess-move-history');
    if (historyList) {
      historyList.innerHTML = '';
      if (chessState.history && chessState.history.length > 0) {
        const moves = chessState.history;
        for (let i = 0; i < moves.length; i += 2) {
          const moveNum = Math.floor(i / 2) + 1;
          const whiteMove = moves[i];
          const blackMove = moves[i + 1] || '';
          const row = document.createElement('div');
          row.className = 'flex items-center text-xs font-mono py-0.5 border-b border-slate-800/60';
          row.innerHTML = `
            <span class="w-8 text-slate-500 font-bold">${moveNum}.</span>
            <span class="w-16 font-bold text-slate-200">${whiteMove}</span>
            <span class="w-16 font-bold text-slate-400">${blackMove}</span>
          `;
          historyList.appendChild(row);
        }
        historyList.scrollTop = historyList.scrollHeight;
      } else {
        historyList.innerHTML = '<span class="text-xs text-slate-500 italic">Game has not started</span>';
      }
    }

    const rematchBtn = document.getElementById('chess-rematch-btn');
    if (rematchBtn) {
      if (chessState.status === 'checkmate' || chessState.status === 'draw') {
        rematchBtn.classList.remove('hidden');
      } else {
        rematchBtn.classList.add('hidden');
      }
    }
  }

  function updateChessRoomsDirectoryUI() {
    // 1. Update active count badge
    const countBadge = document.getElementById('chess-active-matches-count');
    if (countBadge) {
      countBadge.textContent = allChessRooms.length;
    }

    // 2. Update Table Switcher Dropdown
    const select = document.getElementById('chess-room-select');
    if (select) {
      const prevVal = select.value || currentChessRoom;
      select.innerHTML = '';
      if (allChessRooms.length === 0) {
        select.innerHTML = `<option value="GRANDMASTER-1">GRANDMASTER-1</option>`;
      } else {
        allChessRooms.forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.id;
          const wName = r.whitePlayer ? r.whitePlayer.name : 'Waiting';
          const bName = r.blackPlayer ? r.blackPlayer.name : 'Open';
          const statusDesc = r.status === 'playing' ? `Move ${Math.ceil(r.movesCount / 2)}` : r.status;
          opt.textContent = `${r.id}: ${wName} vs ${bName} (${statusDesc}) • 👁️ ${r.spectatorCount}`;
          if (r.id === currentChessRoom) opt.selected = true;
          select.appendChild(opt);
        });
      }
      if (select.querySelector(`option[value="${currentChessRoom}"]`)) {
        select.value = currentChessRoom;
      }
    }

    // 3. Update Matches Directory Grid
    const grid = document.getElementById('chess-matches-grid');
    if (!grid) return;

    if (allChessRooms.length === 0) {
      grid.innerHTML = '<div class="col-span-full py-6 text-center text-xs text-slate-500 italic">No matches created yet. Click "Start New Game" to open a table!</div>';
      return;
    }

    grid.innerHTML = '';
    const u = getUser();

    allChessRooms.forEach(r => {
      const isCurrent = r.id === currentChessRoom;
      const isMeWhite = u && r.whitePlayer && r.whitePlayer.id === u.id;
      const isMeBlack = u && r.blackPlayer && r.blackPlayer.id === u.id;
      const isMePlaying = isMeWhite || isMeBlack;

      let statusBadge = '';
      if (r.status === 'playing') {
        const turnText = r.turn === 'w' ? 'White turn' : 'Black turn';
        statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span> Move ${Math.ceil(r.movesCount / 2)} (${turnText})
        </span>`;
      } else if (r.status === 'checkmate') {
        statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">🏆 Checkmate</span>`;
      } else if (r.status === 'draw') {
        statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/20 text-slate-300 border border-slate-500/30">🤝 Draw</span>`;
      } else {
        statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">⏳ Waiting for Opponent</span>`;
      }

      const card = document.createElement('div');
      card.className = `p-3.5 rounded-2xl bg-slate-900/90 border transition-all ${
        isCurrent ? 'border-purple-500 shadow-lg shadow-purple-500/10 ring-1 ring-purple-500/50' : 'border-slate-800 hover:border-slate-700'
      }`;

      card.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <span class="font-mono text-xs font-black text-indigo-300 flex items-center gap-1.5">
            <span>♟️</span>
            <span>${r.id}</span>
            ${isCurrent ? '<span class="text-[9px] bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded-full font-sans font-bold">VIEWING</span>' : ''}
          </span>
          ${statusBadge}
        </div>

        <div class="space-y-1.5 mb-3 bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/80 text-xs">
          <div class="flex items-center justify-between">
            <span class="text-slate-400 font-mono text-[11px] flex items-center gap-1">
              <span class="w-2 h-2 rounded-full bg-white inline-block"></span> White:
            </span>
            <span class="font-bold text-white flex items-center gap-1">
              <span>${r.whitePlayer ? (r.whitePlayer.avatar || '🎓') : '⏳'}</span>
              <span>${r.whitePlayer ? r.whitePlayer.name : 'Waiting...'}</span>
              ${isMeWhite ? '<span class="text-[9px] bg-indigo-500/20 text-indigo-300 px-1 rounded">YOU</span>' : ''}
            </span>
          </div>
          <div class="flex items-center justify-between border-t border-slate-800/60 pt-1.5">
            <span class="text-slate-400 font-mono text-[11px] flex items-center gap-1">
              <span class="w-2 h-2 rounded-full bg-slate-800 border border-slate-600 inline-block"></span> Black:
            </span>
            <span class="font-bold text-white flex items-center gap-1">
              <span>${r.blackPlayer ? (r.blackPlayer.avatar || '🎓') : '⏳'}</span>
              <span>${r.blackPlayer ? r.blackPlayer.name : (r.status === 'waiting' ? '<span class="text-emerald-400">Seat Open!</span>' : 'None')}</span>
              ${isMeBlack ? '<span class="text-[9px] bg-indigo-500/20 text-indigo-300 px-1 rounded">YOU</span>' : ''}
            </span>
          </div>
        </div>

        <div class="flex items-center justify-between gap-2">
          <span class="text-[11px] font-bold text-slate-400 flex items-center gap-1">
            <i class="fa-solid fa-eye text-purple-400 text-xs"></i>
            <span>${r.spectatorCount} Spectator${r.spectatorCount === 1 ? '' : 's'}</span>
          </span>

          <div class="flex items-center gap-1.5">
            ${
              isMePlaying
                ? `<span class="px-2.5 py-1 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[11px] font-bold">🎮 In Match</span>`
                : `<button onclick="watchSpecificChessMatch('${r.id}')" class="px-3 py-1.5 rounded-xl ${isCurrent ? 'bg-purple-600/30 border border-purple-500 text-purple-200' : 'bg-purple-600 hover:bg-purple-500 text-white'} text-[11px] font-bold transition flex items-center gap-1 shadow-sm active:scale-95">
                    <i class="fa-solid fa-eye text-[10px]"></i> ${isCurrent ? 'Watching' : 'Watch'}
                  </button>`
            }
            ${
              !isMePlaying && r.status === 'waiting' && !r.blackPlayer
                ? `<button onclick="joinChessRoom(false, '${r.id}')" class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition shadow-sm flex items-center gap-1 active:scale-95">
                    <i class="fa-solid fa-swords text-[10px]"></i> Join
                  </button>`
                : ''
            }
          </div>
        </div>
      `;

      grid.appendChild(card);
    });
  }

  window.setupChessSocketListeners = function() {
    const sock = getSocket();
    if (!sock) return;

    sock.off('chess_state');
    sock.off('chess_cheer_event');
    sock.off('chess_error');
    sock.off('chess_rooms_list');

    sock.on('chess_state', (state) => {
      if (!vsBotMode && state && state.id === currentChessRoom) {
        chessState = state;
        renderChessBoard();
      }
    });

    sock.on('chess_cheer_event', (event) => {
      triggerCheerVisual(event);
    });

    sock.on('chess_error', (msg) => {
      alert(`⚠️ Chess Notice: ${msg}`);
    });

    sock.on('chess_rooms_list', (rooms) => {
      allChessRooms = rooms || [];
      updateChessRoomsDirectoryUI();
    });

    // Request active rooms list
    sock.emit('chess_get_rooms');
  };

  // Auto-init on page load
  window.addEventListener('DOMContentLoaded', () => {
    initLocalChess();
    renderChessBoard();
    if (window.socket) window.setupChessSocketListeners();
  });
})();
