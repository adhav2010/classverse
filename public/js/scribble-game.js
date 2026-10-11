// ClassVerse Scribble (Skribbl Draw & Guess) Engine
(function() {
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

  function getSocket() {
    return window.socket || null;
  }
  function getUser() {
    return window.currentUser || null;
  }

  window.joinScribbleRoom = function() {
    window.setupScribbleSocketListeners();
    const input = document.getElementById('scribble-room-input');
    currentScribbleRoom = (input ? input.value.trim() : 'SCRIBBLE-LOUNGE') || 'SCRIBBLE-LOUNGE';
    currentScribbleRoom = currentScribbleRoom.toUpperCase();

    const sock = getSocket();
    if (sock) {
      sock.emit('scribble_join', { roomId: currentScribbleRoom });
    }
    initScribbleCanvas();
    updateScribbleUI();
  };

  window.resetScribbleGame = function() {
    const sock = getSocket();
    if (sock) {
      sock.emit('scribble_reset', { roomId: currentScribbleRoom });
    }
  };

  window.startScribbleGame = function() {
    window.setupScribbleSocketListeners();
    const sock = getSocket();
    if (sock) {
      sock.emit('scribble_start', { roomId: currentScribbleRoom });
    }
  };

  window.clearScribbleCanvas = function() {
    if (!scribbleCtx || !scribbleCanvas) return;
    scribbleCtx.fillStyle = '#ffffff';
    scribbleCtx.fillRect(0, 0, scribbleCanvas.width, scribbleCanvas.height);

    const sock = getSocket();
    if (sock && isCurrentUserArtist()) {
      sock.emit('scribble_clear', { roomId: currentScribbleRoom });
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
    if (!text) return;

    const sock = getSocket();
    if (sock) {
      sock.emit('scribble_guess', { roomId: currentScribbleRoom, text });
    } else {
      // Local fallback display in chat
      const guessLog = document.getElementById('scribble-chat-log');
      if (guessLog) {
        const u = getUser();
        const line = document.createElement('div');
        line.className = 'text-xs text-slate-300 py-0.5';
        line.innerHTML = `<span class="font-bold text-indigo-300">${u ? u.name : 'You'}:</span> <span>${escapeHtml(text)}</span>`;
        guessLog.appendChild(line);
        guessLog.scrollTop = guessLog.scrollHeight;
      }
    }
    input.value = '';
  };

  function isCurrentUserArtist() {
    const u = getUser();
    if (!scribbleState || !scribbleState.artist || !u || scribbleState.status === 'lobby') return true; // In lobby allow free draw
    return scribbleState.artist.id === u.id;
  }

  function initScribbleCanvas() {
    scribbleCanvas = document.getElementById('scribble-canvas');
    if (!scribbleCanvas) return;
    scribbleCtx = scribbleCanvas.getContext('2d');

    // Set internal canvas resolution
    scribbleCanvas.width = 680;
    scribbleCanvas.height = 420;
    scribbleCanvas.style.touchAction = 'none';

    scribbleCtx.fillStyle = '#ffffff';
    scribbleCtx.fillRect(0, 0, scribbleCanvas.width, scribbleCanvas.height);

    const getCanvasCoords = (e) => {
      const rect = scribbleCanvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const w = (rect.width > 0) ? rect.width : (scribbleCanvas.clientWidth || 680);
      const h = (rect.height > 0) ? rect.height : (scribbleCanvas.clientHeight || 420);
      return {
        x: (clientX - rect.left) * (scribbleCanvas.width / w),
        y: (clientY - rect.top) * (scribbleCanvas.height / h)
      };
    };

    const startDraw = (e) => {
      if (scribbleState && scribbleState.status === 'drawing' && !isCurrentUserArtist()) return;
      isDrawing = true;
      const { x, y } = getCanvasCoords(e);
      lastX = x;
      lastY = y;
    };

    const moveDraw = (e) => {
      if (!isDrawing) return;
      if (scribbleState && scribbleState.status === 'drawing' && !isCurrentUserArtist()) return;
      const { x, y } = getCanvasCoords(e);

      drawLine(lastX, lastY, x, y, currentColor, currentSize);

      const sock = getSocket();
      if (sock) {
        sock.emit('scribble_draw_step', {
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

    scribbleCanvas.onmousedown = startDraw;
    scribbleCanvas.onmousemove = moveDraw;
    window.onmouseup = stopDraw;

    scribbleCanvas.ontouchstart = (e) => { startDraw(e); };
    scribbleCanvas.ontouchmove = (e) => { e.preventDefault(); moveDraw(e); };
    window.ontouchend = stopDraw;
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
    const isArtist = isCurrentUserArtist();
    const toolbar = document.getElementById('scribble-toolbar');
    if (toolbar) {
      if (!scribbleState || isArtist || scribbleState.status === 'lobby') {
        toolbar.classList.remove('opacity-30', 'pointer-events-none');
      } else {
        toolbar.classList.add('opacity-30', 'pointer-events-none');
      }
    }

    const wordDisplay = document.getElementById('scribble-word-display');
    if (wordDisplay) {
      if (!scribbleState || scribbleState.status === 'lobby') {
        wordDisplay.innerHTML = `<span class="text-xs text-pink-400 uppercase font-mono block">🎨 Free Draw Mode</span><span class="text-white font-bold text-sm">Waiting for round to start — Click "Start Round" when classmates join!</span>`;
      } else if (scribbleState.status === 'drawing') {
        if (isArtist && secretWord) {
          wordDisplay.innerHTML = `<span class="text-xs text-slate-400 uppercase font-mono block">Draw This Secret Word:</span><span class="text-emerald-400 font-black text-2xl tracking-wider">${secretWord.toUpperCase()}</span>`;
        } else {
          wordDisplay.innerHTML = `<span class="text-xs text-slate-400 uppercase font-mono block">Guess the Secret Word:</span><span class="text-amber-300 font-mono text-2xl font-bold tracking-[0.25em]">${scribbleState.maskedWord}</span>`;
        }
      } else if (scribbleState.status === 'reveal') {
        wordDisplay.innerHTML = `<span class="text-xs text-slate-400 uppercase font-mono block">Word Revealed:</span><span class="text-emerald-400 font-bold text-xl">${(scribbleState.revealedWord || secretWord || '').toUpperCase()}</span>`;
      }
    }

    const timerEl = document.getElementById('scribble-timer');
    if (timerEl) timerEl.textContent = `${(scribbleState && scribbleState.timeLeft) || 60}s`;

    const roundEl = document.getElementById('scribble-round-badge');
    if (roundEl) roundEl.textContent = `Round ${(scribbleState && scribbleState.round) || 1}/${(scribbleState && scribbleState.totalRounds) || 3}`;

    const startBtn = document.getElementById('scribble-start-btn');
    if (startBtn) {
      if (!scribbleState || scribbleState.status === 'lobby') {
        startBtn.classList.remove('hidden');
        startBtn.disabled = false;
        startBtn.textContent = '🚀 Start Round';
      } else {
        startBtn.classList.add('hidden');
      }
    }

    const u = getUser();
    const players = (scribbleState && scribbleState.players && scribbleState.players.length > 0)
      ? scribbleState.players
      : [
          { id: (u ? u.id : 'me'), name: (u ? u.name : 'You'), avatar: (u ? u.avatar : '🎨'), score: 0 }
        ];

    const scoreboard = document.getElementById('scribble-scoreboard');
    if (scoreboard) {
      scoreboard.innerHTML = '';
      const sorted = [...players].sort((a, b) => b.score - a.score);
      sorted.forEach((p) => {
        const isDrawingPlayer = scribbleState && scribbleState.artist && p.id === scribbleState.artist.id;
        const row = document.createElement('div');
        row.className = `p-2 rounded-xl border flex items-center justify-between text-xs transition ${
          isDrawingPlayer ? 'bg-pink-950/40 border-pink-500/60 shadow-sm ring-1 ring-pink-500' : 'bg-slate-900/60 border-slate-800'
        }`;
        row.innerHTML = `
          <div class="flex items-center gap-2">
            <span>${p.avatar || '🎨'}</span>
            <span class="font-bold text-white truncate max-w-[120px]">${p.name} ${isDrawingPlayer ? '✏️' : ''}</span>
          </div>
          <span class="font-mono text-amber-400 font-black">${p.score} pts</span>
        `;
        scoreboard.appendChild(row);
      });
    }

    const guessLog = document.getElementById('scribble-chat-log');
    if (guessLog) {
      if (scribbleState && scribbleState.chatLog && scribbleState.chatLog.length > 0) {
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
      } else if (!scribbleState || !scribbleState.chatLog || scribbleState.chatLog.length === 0) {
        guessLog.innerHTML = `
          <div class="text-xs text-slate-400 font-mono py-1">🎨 Welcome to Scribble Lounge!</div>
          <div class="text-xs text-pink-400 font-mono py-0.5">Pick a color, draw on canvas, and guess words in chat!</div>
        `;
      }
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  window.setupScribbleSocketListeners = function() {
    const sock = getSocket();
    if (!sock) return;

    sock.off('scribble_state');
    sock.off('scribble_secret_word');
    sock.off('scribble_tick');
    sock.off('scribble_draw_step');
    sock.off('scribble_clear_canvas');
    sock.off('scribble_chat');

    sock.on('scribble_state', (state) => {
      scribbleState = state;
      updateScribbleUI();
    });

    sock.on('scribble_secret_word', (word) => {
      secretWord = word;
      updateScribbleUI();
    });

    sock.on('scribble_tick', ({ timeLeft, maskedWord }) => {
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

    sock.on('scribble_draw_step', (drawData) => {
      drawLine(drawData.fromX, drawData.fromY, drawData.toX, drawData.toY, drawData.color, drawData.size);
    });

    sock.on('scribble_clear_canvas', () => {
      if (!scribbleCtx || !scribbleCanvas) return;
      scribbleCtx.fillStyle = '#ffffff';
      scribbleCtx.fillRect(0, 0, scribbleCanvas.width, scribbleCanvas.height);
    });

    sock.on('scribble_chat', (msg) => {
      const guessLog = document.getElementById('scribble-chat-log');
      if (guessLog) {
        const line = document.createElement('div');
        line.className = 'text-xs text-slate-300 py-0.5';
        line.innerHTML = `<span class="font-bold text-indigo-300">${msg.sender}:</span> <span>${escapeHtml(msg.text)}</span>`;
        guessLog.appendChild(line);
        guessLog.scrollTop = guessLog.scrollHeight;
      }
    });
  };

  // Immediate init
  if (typeof window !== 'undefined') {
    if (window.socket) window.setupScribbleSocketListeners();
    window.addEventListener('DOMContentLoaded', () => {
      initScribbleCanvas();
      updateScribbleUI();
      if (window.socket) window.setupScribbleSocketListeners();
    });
  }
})();
