// ClassVerse Scribble (Skribbl Draw & Guess) Engine
let currentScribbleRoom = 'SCRIBBLE-LOUNGE';
let scribbleState = null;
let scribbleCanvas = null;
let scribbleCtx = null;
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let currentColor = '#000000';
let currentSize = 4;
let secretWord = null;

window.joinScribbleRoom = function() {
  const input = document.getElementById('scribble-room-input');
  currentScribbleRoom = (input ? input.value.trim() : 'SCRIBBLE-LOUNGE') || 'SCRIBBLE-LOUNGE';
  currentScribbleRoom = currentScribbleRoom.toUpperCase();

  if (socket) {
    socket.emit('scribble_join', { roomId: currentScribbleRoom });
  }
};

window.startScribbleGame = function() {
  if (socket) {
    socket.emit('scribble_start', { roomId: currentScribbleRoom });
  }
};

window.clearScribbleCanvas = function() {
  if (!scribbleCtx || !scribbleCanvas) return;
  scribbleCtx.fillStyle = '#ffffff';
  scribbleCtx.fillRect(0, 0, scribbleCanvas.width, scribbleCanvas.height);

  if (socket && isCurrentUserArtist()) {
    socket.emit('scribble_clear', { roomId: currentScribbleRoom });
  }
};

window.setScribbleColor = function(color, btn) {
  currentColor = color;
  document.querySelectorAll('.scribble-color-dot').forEach(el => el.classList.remove('active'));
  if (btn) btn.classList.add('active');
};

window.setScribbleSize = function(size) {
  currentSize = size;
};

window.submitScribbleGuess = function(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('scribble-guess-input');
  const text = input ? input.value.trim() : '';
  if (!text || !socket) return;

  socket.emit('scribble_guess', { roomId: currentScribbleRoom, text });
  input.value = '';
};

function isCurrentUserArtist() {
  return scribbleState && scribbleState.artist && currentUser && scribbleState.artist.id === currentUser.id;
}

function initScribbleCanvas() {
  scribbleCanvas = document.getElementById('scribble-canvas');
  if (!scribbleCanvas) return;
  scribbleCtx = scribbleCanvas.getContext('2d');

  scribbleCanvas.width = 680;
  scribbleCanvas.height = 420;

  // Background white
  scribbleCtx.fillStyle = '#ffffff';
  scribbleCtx.fillRect(0, 0, scribbleCanvas.width, scribbleCanvas.height);

  // Mouse & Touch events
  const getCanvasCoords = (e) => {
    const rect = scribbleCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (scribbleCanvas.width / rect.width),
      y: (clientY - rect.top) * (scribbleCanvas.height / rect.height)
    };
  };

  const startDraw = (e) => {
    if (!isCurrentUserArtist() || scribbleState.status !== 'drawing') return;
    isDrawing = true;
    const { x, y } = getCanvasCoords(e);
    lastX = x;
    lastY = y;
  };

  const moveDraw = (e) => {
    if (!isDrawing || !isCurrentUserArtist() || scribbleState.status !== 'drawing') return;
    const { x, y } = getCanvasCoords(e);

    drawLine(lastX, lastY, x, y, currentColor, currentSize);

    // Stream step to peers
    if (socket) {
      socket.emit('scribble_draw_step', {
        roomId: currentScribbleRoom,
        drawData: { fromX: lastX, fromY: lastY, toX: x, toY: y, color: currentColor, size: currentSize }
      });
    }

    lastX = x;
    lastY = y;
  };

  const stopDraw = () => {
    isDrawing = false;
  };

  scribbleCanvas.addEventListener('mousedown', startDraw);
  scribbleCanvas.addEventListener('mousemove', moveDraw);
  window.addEventListener('mouseup', stopDraw);

  scribbleCanvas.addEventListener('touchstart', startDraw, { passive: false });
  scribbleCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    moveDraw(e);
  }, { passive: false });
  window.addEventListener('touchend', stopDraw);
}

function drawLine(fromX, fromY, toX, toY, color, size) {
  if (!scribbleCtx) return;
  scribbleCtx.beginPath();
  scribbleCtx.moveTo(fromX, fromY);
  scribbleCtx.lineTo(toX, toY);
  scribbleCtx.strokeStyle = color;
  scribbleCtx.lineWidth = size;
  scribbleCtx.lineCap = 'round';
  scribbleCtx.lineJoin = 'round';
  scribbleCtx.stroke();
}

function updateScribbleUI() {
  if (!scribbleState) return;

  const isArtist = isCurrentUserArtist();
  const toolbar = document.getElementById('scribble-toolbar');
  if (toolbar) {
    if (isArtist && scribbleState.status === 'drawing') {
      toolbar.classList.remove('opacity-30', 'pointer-events-none');
    } else {
      toolbar.classList.add('opacity-30', 'pointer-events-none');
    }
  }

  // Word display
  const wordDisplay = document.getElementById('scribble-word-display');
  if (wordDisplay) {
    if (scribbleState.status === 'drawing') {
      if (isArtist && secretWord) {
        wordDisplay.innerHTML = `<span class="text-xs text-slate-400 uppercase font-mono block">Draw This:</span><span class="text-emerald-400 font-black text-xl tracking-wider">${secretWord.toUpperCase()}</span>`;
      } else {
        wordDisplay.innerHTML = `<span class="text-xs text-slate-400 uppercase font-mono block">Guess the Word:</span><span class="text-amber-300 font-mono text-2xl font-bold tracking-[0.25em]">${scribbleState.maskedWord}</span>`;
      }
    } else if (scribbleState.status === 'reveal') {
      wordDisplay.innerHTML = `<span class="text-xs text-slate-400 uppercase font-mono block">Word Revealed:</span><span class="text-emerald-400 font-bold text-xl">${secretWord ? secretWord.toUpperCase() : ''}</span>`;
    } else {
      wordDisplay.textContent = 'Waiting to start...';
    }
  }

  // Timer & Round
  const timerEl = document.getElementById('scribble-timer');
  if (timerEl) timerEl.textContent = `${scribbleState.timeLeft || 60}s`;

  const roundEl = document.getElementById('scribble-round-badge');
  if (roundEl) roundEl.textContent = `Round ${scribbleState.round || 1}/${scribbleState.totalRounds || 3}`;

  // Start button in lobby
  const startBtn = document.getElementById('scribble-start-btn');
  if (startBtn) {
    if (scribbleState.status === 'lobby') {
      startBtn.classList.remove('hidden');
      startBtn.disabled = scribbleState.players.length < 2;
    } else {
      startBtn.classList.add('hidden');
    }
  }

  // Scoreboard sidebar
  const scoreboard = document.getElementById('scribble-scoreboard');
  if (scoreboard && scribbleState.players) {
    scoreboard.innerHTML = '';
    const sorted = [...scribbleState.players].sort((a, b) => b.score - a.score);
    sorted.forEach((p, idx) => {
      const isDrawingPlayer = scribbleState.artist && p.id === scribbleState.artist.id;
      const row = document.createElement('div');
      row.className = `p-2.5 rounded-xl border flex items-center justify-between text-xs ${
        isDrawingPlayer ? 'bg-indigo-950/40 border-indigo-500/60 shadow-sm' : 'bg-slate-900/60 border-slate-800'
      }`;
      row.innerHTML = `
        <div class="flex items-center gap-2">
          <span>${p.avatar || '🎨'}</span>
          <span class="font-bold text-white">${p.name} ${isDrawingPlayer ? '✏️' : ''}</span>
        </div>
        <span class="font-mono text-amber-400 font-black">${p.score} pts</span>
      `;
      scoreboard.appendChild(row);
    });
  }

  // Chat/Guess Log
  const guessLog = document.getElementById('scribble-chat-log');
  if (guessLog && scribbleState.chatLog) {
    guessLog.innerHTML = '';
    scribbleState.chatLog.slice(-15).forEach(msg => {
      const line = document.createElement('div');
      if (msg.system) {
        line.className = 'text-xs text-emerald-400 font-bold py-1 border-b border-emerald-950/40';
        line.textContent = msg.text;
      } else {
        line.className = 'text-xs text-slate-300 py-0.5';
        line.innerHTML = `<span class="font-bold text-indigo-300">${msg.sender}:</span> <span>${escapeHtml(msg.text)}</span>`;
      }
      guessLog.appendChild(line);
    });
    guessLog.scrollTop = guessLog.scrollHeight;
  }
}

function setupScribbleSocketListeners() {
  if (!socket) return;

  socket.on('scribble_state', (state) => {
    scribbleState = state;
    updateScribbleUI();
  });

  socket.on('scribble_secret_word', (word) => {
    secretWord = word;
    updateScribbleUI();
  });

  socket.on('scribble_tick', ({ timeLeft, maskedWord }) => {
    if (scribbleState) {
      scribbleState.timeLeft = timeLeft;
      scribbleState.maskedWord = maskedWord;
      const timerEl = document.getElementById('scribble-timer');
      if (timerEl) timerEl.textContent = `${timeLeft}s`;
      const wordDisplay = document.getElementById('scribble-word-display');
      if (wordDisplay && !isCurrentUserArtist()) {
        wordDisplay.innerHTML = `<span class="text-xs text-slate-400 uppercase font-mono block">Guess the Word:</span><span class="text-amber-300 font-mono text-2xl font-bold tracking-[0.25em]">${maskedWord}</span>`;
      }
    }
  });

  socket.on('scribble_draw_step', (drawData) => {
    drawLine(drawData.fromX, drawData.fromY, drawData.toX, drawData.toY, drawData.color, drawData.size);
  });

  socket.on('scribble_clear_canvas', () => {
    if (!scribbleCtx || !scribbleCanvas) return;
    scribbleCtx.fillStyle = '#ffffff';
    scribbleCtx.fillRect(0, 0, scribbleCanvas.width, scribbleCanvas.height);
  });

  socket.on('scribble_chat', (msg) => {
    const guessLog = document.getElementById('scribble-chat-log');
    if (guessLog) {
      const line = document.createElement('div');
      line.className = 'text-xs text-slate-300 py-0.5';
      line.innerHTML = `<span class="font-bold text-indigo-300">${msg.sender}:</span> <span>${escapeHtml(msg.text)}</span>`;
      guessLog.appendChild(line);
      guessLog.scrollTop = guessLog.scrollHeight;
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  const checkSocket = setInterval(() => {
    if (window.socket) {
      clearInterval(checkSocket);
      setupScribbleSocketListeners();
      initScribbleCanvas();
    }
  }, 200);
});
