// ClassVerse Chess Engine with Live Spectator Mode
let currentChessRoom = 'GRANDMASTER-1';
let chessState = null;
let selectedSquare = null;
let boardFlipped = false;

const UNICODE_PIECES = {
  'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
  'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
};

const PIECE_NAMES = {
  'K': 'White King', 'Q': 'White Queen', 'R': 'White Rook', 'B': 'White Bishop', 'N': 'White Knight', 'P': 'White Pawn',
  'k': 'Black King', 'q': 'Black Queen', 'r': 'Black Rook', 'b': 'Black Bishop', 'n': 'Black Knight', 'p': 'Black Pawn'
};

window.joinChessRoom = function(asSpectator = false) {
  const input = document.getElementById('chess-room-input');
  currentChessRoom = (input ? input.value.trim() : 'GRANDMASTER-1') || 'GRANDMASTER-1';
  currentChessRoom = currentChessRoom.toUpperCase();

  if (socket) {
    socket.emit('chess_join', { roomId: currentChessRoom, asSpectator });
  }
};

window.joinChessAsSpectator = function() {
  window.joinChessRoom(true);
};

window.flipChessBoard = function() {
  boardFlipped = !boardFlipped;
  renderChessBoard();
};

window.requestChessRematch = function() {
  if (socket) {
    socket.emit('chess_rematch', { roomId: currentChessRoom });
  }
};

window.sendChessCheer = function(emoji) {
  if (socket) {
    socket.emit('chess_cheer', { roomId: currentChessRoom, emoji });
    triggerCheerVisual({ sender: 'You', emoji });
  }
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

// Convert FEN board representation into 8x8 2D array
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

function squareToCoord(sq) {
  const file = sq.charCodeAt(0) - 97; // a=0, h=7
  const rank = 8 - parseInt(sq[1], 10); // 8=0, 1=7
  return { r: rank, c: file };
}

function coordToSquare(r, c) {
  const file = String.fromCharCode(97 + c);
  const rank = 8 - r;
  return `${file}${rank}`;
}

function renderChessBoard() {
  const boardEl = document.getElementById('chess-board-grid');
  if (!boardEl || !chessState) return;

  boardEl.innerHTML = '';
  const board2D = parseFen(chessState.fen);

  const isWhitePlayer = chessState.whitePlayer && currentUser && chessState.whitePlayer.id === currentUser.id;
  const isBlackPlayer = chessState.blackPlayer && currentUser && chessState.blackPlayer.id === currentUser.id;
  const isSpectator = !isWhitePlayer && !isBlackPlayer;

  // Auto-flip for black player unless manually overridden
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
        // Is king in check?
        const isKing = (piece === 'K' && chessState.turn === 'w') || (piece === 'k' && chessState.turn === 'b');
        if (isKing && chessState.inCheck) {
          cell.classList.add('in-check');
        }

        const pSpan = document.createElement('span');
        pSpan.textContent = UNICODE_PIECES[piece] || piece;
        pSpan.className = piece === piece.toUpperCase() ? 'text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]' : 'text-slate-900 drop-shadow-[0_1px_2px_rgba(255,255,255,0.4)]';
        cell.appendChild(pSpan);
      }

      // Legal dot placeholder if square selected
      if (selectedSquare && selectedSquare !== sqName) {
        // Show target indicator
      }

      cell.onclick = () => onSquareClick(sqName, piece);
      boardEl.appendChild(cell);
    }
  }

  updateChessStatusUI();
}

function onSquareClick(sqName, piece) {
  if (!chessState || chessState.status !== 'playing') return;

  const isWhiteTurn = chessState.turn === 'w';
  const isMyTurn = (isWhiteTurn && chessState.whitePlayer && currentUser && chessState.whitePlayer.id === currentUser.id) ||
                   (!isWhiteTurn && chessState.blackPlayer && currentUser && chessState.blackPlayer.id === currentUser.id);

  if (!isMyTurn) {
    // Spectators or waiting opponent
    return;
  }

  if (!selectedSquare) {
    // Select piece
    if (!piece) return;
    const isWhitePiece = piece === piece.toUpperCase();
    if ((isWhiteTurn && !isWhitePiece) || (!isWhiteTurn && isWhitePiece)) return;

    selectedSquare = sqName;
    renderChessBoard();
  } else {
    // Making a move from selectedSquare to sqName
    if (selectedSquare === sqName) {
      selectedSquare = null;
      renderChessBoard();
      return;
    }

    const from = selectedSquare;
    const to = sqName;
    selectedSquare = null;

    // Check pawn promotion to Queen
    let promotion = undefined;
    const board2D = parseFen(chessState.fen);
    const coordFrom = squareToCoord(from);
    const pieceMoving = board2D[coordFrom.r][coordFrom.c];
    if (pieceMoving && pieceMoving.toLowerCase() === 'p') {
      if ((pieceMoving === 'P' && to[1] === '8') || (pieceMoving === 'p' && to[1] === '1')) {
        promotion = 'q';
      }
    }

    if (socket) {
      socket.emit('chess_move', {
        roomId: currentChessRoom,
        from,
        to,
        promotion
      });
    }

    renderChessBoard();
  }
}

function updateChessStatusUI() {
  if (!chessState) return;

  const isWhitePlayer = chessState.whitePlayer && currentUser && chessState.whitePlayer.id === currentUser.id;
  const isBlackPlayer = chessState.blackPlayer && currentUser && chessState.blackPlayer.id === currentUser.id;
  const isSpectator = !isWhitePlayer && !isBlackPlayer;

  // Header players info
  const pWhiteName = document.getElementById('chess-name-white');
  const pBlackName = document.getElementById('chess-name-black');
  if (pWhiteName) pWhiteName.textContent = chessState.whitePlayer ? chessState.whitePlayer.name : 'Waiting...';
  if (pBlackName) pBlackName.textContent = chessState.blackPlayer ? chessState.blackPlayer.name : 'Waiting...';

  // Role badge (Spectator vs Player)
  const roleBadge = document.getElementById('chess-role-badge');
  if (roleBadge) {
    if (isSpectator) {
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

  // Turn badge
  const turnBadge = document.getElementById('chess-turn-badge');
  if (turnBadge) {
    if (chessState.status === 'checkmate') {
      const winnerName = chessState.winner === 'white' ? 'White' : 'Black';
      turnBadge.className = 'px-4 py-1.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse';
      turnBadge.textContent = `🏆 Checkmate! ${winnerName} Wins!`;
    } else if (chessState.status === 'draw') {
      turnBadge.className = 'px-4 py-1.5 rounded-full text-xs font-black bg-slate-500/20 text-slate-300 border border-slate-500/40';
      turnBadge.textContent = `🤝 Game Drawn`;
    } else if (chessState.status === 'waiting') {
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

  // Spectator count & chips
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

  // Move history
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

  // Rematch button toggle
  const rematchBtn = document.getElementById('chess-rematch-btn');
  if (rematchBtn) {
    if (chessState.status === 'checkmate' || chessState.status === 'draw') {
      rematchBtn.classList.remove('hidden');
    } else {
      rematchBtn.classList.add('hidden');
    }
  }
}

// Socket hooks
function setupChessSocketListeners() {
  if (!socket) return;

  socket.on('chess_state', (state) => {
    chessState = state;
    renderChessBoard();
  });

  socket.on('chess_cheer_event', (event) => {
    triggerCheerVisual(event);
  });

  socket.on('chess_error', (msg) => {
    alert(`⚠️ Chess Notice: ${msg}`);
  });
}

window.addEventListener('DOMContentLoaded', () => {
  // Wait for socket to be initialized
  const checkSocket = setInterval(() => {
    if (window.socket) {
      clearInterval(checkSocket);
      setupChessSocketListeners();
    }
  }, 200);
});
