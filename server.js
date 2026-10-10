const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const JWT_SECRET = 'classverse_secret_key_2026_classroom_super_secure';
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// File paths
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const QUESTIONS_FILE = path.join(DATA_DIR, 'quiz-questions.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const ANNOUNCEMENTS_FILE = path.join(DATA_DIR, 'announcements.json');
const POLLS_FILE = path.join(DATA_DIR, 'polls.json');

// In-memory data
let users = [];
let quizQuestions = [];
let chatMessages = [];
let announcements = [];
let polls = [];

function loadData() {
  try {
    if (fs.existsSync(USERS_FILE)) users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    if (fs.existsSync(QUESTIONS_FILE)) quizQuestions = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf-8'));
    if (fs.existsSync(MESSAGES_FILE)) chatMessages = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8'));
    if (fs.existsSync(ANNOUNCEMENTS_FILE)) announcements = JSON.parse(fs.readFileSync(ANNOUNCEMENTS_FILE, 'utf-8'));
    if (fs.existsSync(POLLS_FILE)) polls = JSON.parse(fs.readFileSync(POLLS_FILE, 'utf-8'));
  } catch (err) {
    console.error('Error loading data:', err);
  }
}

function saveUsers() {
  try { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); } catch (e) { console.error(e); }
}
function saveMessages() {
  try { fs.writeFileSync(MESSAGES_FILE, JSON.stringify(chatMessages.slice(-100), null, 2)); } catch (e) { console.error(e); }
}
function saveAnnouncements() {
  try { fs.writeFileSync(ANNOUNCEMENTS_FILE, JSON.stringify(announcements, null, 2)); } catch (e) { console.error(e); }
}
function savePolls() {
  try { fs.writeFileSync(POLLS_FILE, JSON.stringify(polls, null, 2)); } catch (e) { console.error(e); }
}

loadData();

// Auth Middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = users.find(u => u.id === decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user && req.user.role === 'admin') next();
  else res.status(403).json({ error: 'Forbidden: Admin access required' });
}

function awardXP(userId, amount) {
  const u = users.find(x => x.id === userId);
  if (u) {
    u.xp = (u.xp || 0) + amount;
    saveUsers();
    return u.xp;
  }
  return 0;
}

// REST Endpoints
app.post('/api/login', (req, res) => {
  const { studentId, password } = req.body;
  if (!studentId || !password) {
    return res.status(400).json({ error: 'Student ID and password are required' });
  }

  const cleanId = studentId.trim().toUpperCase();
  const user = users.find(u => u.studentId.toUpperCase() === cleanId || u.id.toLowerCase() === studentId.trim().toLowerCase());

  if (!user) return res.status(401).json({ error: 'Invalid Student ID or password' });

  const isValid = bcrypt.compareSync(password, user.passwordHash);
  if (!isValid) return res.status(401).json({ error: 'Invalid Student ID or password' });

  const token = jwt.sign({ id: user.id, studentId: user.studentId, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      studentId: user.studentId,
      role: user.role,
      avatar: user.avatar || '🎓',
      statusMessage: user.statusMessage || 'Exploring ClassVerse 🚀',
      xp: user.xp || 0
    }
  });
});

app.get('/api/me', authMiddleware, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      studentId: req.user.studentId,
      role: req.user.role,
      avatar: req.user.avatar || '🎓',
      statusMessage: req.user.statusMessage || 'Exploring ClassVerse 🚀',
      xp: req.user.xp || 0
    }
  });
});

app.post('/api/profile/update', authMiddleware, (req, res) => {
  const { avatar, name, statusMessage } = req.body;
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (avatar) user.avatar = avatar;
  if (name && name.trim()) user.name = name.trim();
  if (statusMessage !== undefined) user.statusMessage = statusMessage.trim().slice(0, 80);

  saveUsers();
  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      studentId: user.studentId,
      role: user.role,
      avatar: user.avatar,
      statusMessage: user.statusMessage,
      xp: user.xp
    }
  });
});

app.get('/api/messages', authMiddleware, (req, res) => {
  res.json({ messages: chatMessages.slice(-50) });
});

// Announcements Endpoints
app.get('/api/announcements', authMiddleware, (req, res) => {
  res.json({ announcements });
});

app.post('/api/announcements', authMiddleware, (req, res) => {
  const { title, content, tag } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Title and content required' });

  const newAnn = {
    id: 'ann-' + uuidv4().slice(0, 8),
    title: title.trim(),
    content: content.trim(),
    tag: tag || 'Notice',
    author: {
      id: req.user.id,
      name: req.user.name,
      studentId: req.user.studentId,
      avatar: req.user.avatar || '🎓',
      role: req.user.role
    },
    createdAt: new Date().toISOString()
  };

  announcements.unshift(newAnn);
  saveAnnouncements();
  awardXP(req.user.id, 15);
  io.emit('announcement_new', newAnn);

  res.status(201).json({ success: true, announcement: newAnn });
});

app.delete('/api/announcements/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const item = announcements.find(a => a.id === id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  // Only author or admin can delete
  if (req.user.role !== 'admin' && item.author.id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized to delete this notice' });
  }

  announcements = announcements.filter(a => a.id !== id);
  saveAnnouncements();
  io.emit('announcement_deleted', id);
  res.json({ success: true });
});

// Polls Endpoints
app.get('/api/polls', authMiddleware, (req, res) => {
  res.json({ polls });
});

app.post('/api/polls', authMiddleware, (req, res) => {
  const { question, options } = req.body;
  if (!question || !options || options.length < 2) {
    return res.status(400).json({ error: 'Question and at least 2 options required' });
  }

  const newPoll = {
    id: 'poll-' + uuidv4().slice(0, 8),
    question: question.trim(),
    options: options.map((opt, idx) => ({
      id: idx,
      text: opt.trim(),
      votes: []
    })),
    author: {
      id: req.user.id,
      name: req.user.name,
      studentId: req.user.studentId
    },
    createdAt: new Date().toISOString()
  };

  polls.unshift(newPoll);
  savePolls();
  awardXP(req.user.id, 20);
  io.emit('poll_new', newPoll);
  res.status(201).json({ success: true, poll: newPoll });
});

app.post('/api/polls/:id/vote', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { optionId } = req.body;
  const poll = polls.find(p => p.id === id);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });

  // Remove existing vote by this user in any option
  poll.options.forEach(opt => {
    opt.votes = opt.votes.filter(uId => uId !== req.user.id);
  });

  const selectedOpt = poll.options.find(o => o.id === optionId);
  if (!selectedOpt) return res.status(400).json({ error: 'Invalid option' });

  selectedOpt.votes.push(req.user.id);
  savePolls();
  awardXP(req.user.id, 5);

  io.emit('poll_updated', poll);
  res.json({ success: true, poll });
});

// Admin endpoints
app.get('/api/admin/users', [authMiddleware, adminMiddleware], (req, res) => {
  const studentList = users.map(u => ({
    id: u.id,
    name: u.name,
    studentId: u.studentId,
    role: u.role,
    avatar: u.avatar || '🎓',
    statusMessage: u.statusMessage || '',
    xp: u.xp || 0,
    createdAt: u.createdAt
  }));
  res.json({ users: studentList });
});

app.post('/api/admin/users', [authMiddleware, adminMiddleware], (req, res) => {
  const { name, studentId, password, role } = req.body;
  if (!name || !studentId || !password) {
    return res.status(400).json({ error: 'Name, Student ID, and Password are required' });
  }

  const cleanId = studentId.trim().toUpperCase();
  const exists = users.find(u => u.studentId.toUpperCase() === cleanId);
  if (exists) return res.status(400).json({ error: 'Student ID already exists' });

  const newUser = {
    id: 'user_' + uuidv4().slice(0, 8),
    name: name.trim(),
    studentId: cleanId,
    passwordHash: bcrypt.hashSync(password, 10),
    role: role === 'admin' ? 'admin' : 'student',
    avatar: '🎓',
    statusMessage: 'New Classmate! 👋',
    xp: 0,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  saveUsers();

  res.status(201).json({ success: true, user: newUser });
});

app.delete('/api/admin/users/:id', [authMiddleware, adminMiddleware], (req, res) => {
  const { id } = req.params;
  if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });

  const index = users.findIndex(u => u.id === id);
  if (index === -1) return res.status(404).json({ error: 'Student not found' });

  users.splice(index, 1);
  saveUsers();
  res.json({ success: true, message: 'Student removed successfully' });
});

app.post('/api/admin/users/:id/reset-password', [authMiddleware, adminMiddleware], (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters long' });
  }

  const user = users.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: 'Student not found' });

  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  saveUsers();
  res.json({ success: true, message: 'Password reset successfully' });
});

// ==========================================
// SOCKET.IO REALTIME STATE & EVENT HANDLING
// ==========================================
const onlineSockets = new Map(); // socketId -> { user, socketId, activity, onlineSince }
const activeRooms = {
  ttt: new Map(),
  c4: new Map(),
  quiz: new Map(),
  rps: new Map(),
  stumble: new Map() // Multiplayer Stumble Dash Royale
};

function getOnlineUsersList() {
  const uniqueUsers = new Map();
  for (const [, session] of onlineSockets.entries()) {
    uniqueUsers.set(session.user.studentId, {
      id: session.user.id,
      name: session.user.name,
      studentId: session.user.studentId,
      avatar: session.user.avatar || '🎓',
      role: session.user.role,
      xp: session.user.xp || 0,
      statusMessage: session.user.statusMessage || 'Ready to chat & play 🚀',
      activity: session.activity || '💬 Class Chat',
      onlineSince: session.onlineSince,
      socketId: session.socketId
    });
  }
  return Array.from(uniqueUsers.values());
}

io.on('connection', (socket) => {
  let currentUser = null;

  socket.on('auth', (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = users.find(u => u.id === decoded.id);
      if (user) {
        currentUser = user;
        onlineSockets.set(socket.id, {
          user,
          socketId: socket.id,
          activity: '💬 Class Chat',
          onlineSince: new Date().toISOString()
        });
        io.emit('online_users', getOnlineUsersList());
        socket.emit('auth_success', { user });
      }
    } catch (e) {
      socket.emit('auth_error', 'Authentication failed');
    }
  });

  // User updates their current activity
  socket.on('set_activity', (activity) => {
    const session = onlineSockets.get(socket.id);
    if (session) {
      session.activity = activity;
      io.emit('online_users', getOnlineUsersList());
    }
  });

  // User updates their custom status message
  socket.on('set_status_message', (statusMessage) => {
    if (!currentUser) return;
    currentUser.statusMessage = statusMessage.trim().slice(0, 80);
    saveUsers();
    const session = onlineSockets.get(socket.id);
    if (session) {
      session.user.statusMessage = currentUser.statusMessage;
    }
    io.emit('online_users', getOnlineUsersList());
  });

  // 1-on-1 Game Challenge Invite system
  socket.on('send_challenge', ({ targetStudentId, gameType }) => {
    if (!currentUser) return;
    const targetSession = Array.from(onlineSockets.values()).find(s => s.user.studentId === targetStudentId);
    if (!targetSession) {
      return socket.emit('challenge_error', 'Classmate is no longer online');
    }

    const roomId = `DUEL-${Math.floor(1000 + Math.random() * 9000)}`;

    io.to(targetSession.socketId).emit('challenge_received', {
      challenger: {
        id: currentUser.id,
        name: currentUser.name,
        studentId: currentUser.studentId,
        avatar: currentUser.avatar
      },
      gameType,
      roomId
    });

    socket.emit('challenge_sent_ack', {
      targetName: targetSession.user.name,
      gameType,
      roomId
    });
  });

  socket.on('respond_challenge', ({ challengerId, gameType, roomId, accepted }) => {
    if (!currentUser) return;
    const challengerSession = Array.from(onlineSockets.values()).find(s => s.user.id === challengerId);
    
    if (challengerSession) {
      io.to(challengerSession.socketId).emit('challenge_response', {
        respondent: {
          id: currentUser.id,
          name: currentUser.name,
          studentId: currentUser.studentId
        },
        gameType,
        roomId,
        accepted
      });
    }

    if (accepted) {
      socket.emit('challenge_join_match', { gameType, roomId });
    }
  });

  // Chat message handler
  socket.on('chat_send', (text) => {
    if (!currentUser || !text || !text.trim()) return;

    const message = {
      id: 'msg_' + uuidv4().slice(0, 8),
      sender: {
        id: currentUser.id,
        name: currentUser.name,
        studentId: currentUser.studentId,
        avatar: currentUser.avatar || '🎓',
        role: currentUser.role
      },
      text: text.trim().slice(0, 500),
      timestamp: new Date().toISOString()
    };

    chatMessages.push(message);
    if (chatMessages.length > 100) chatMessages.shift();
    saveMessages();

    awardXP(currentUser.id, 2);
    io.emit('chat_message', message);
  });

  socket.on('chat_typing', (isTyping) => {
    if (!currentUser) return;
    socket.broadcast.emit('user_typing', {
      user: currentUser.name,
      studentId: currentUser.studentId,
      isTyping
    });
  });

  // ==========================================
  // MULTIPLAYER GAME 1: TIC-TAC-TOE
  // ==========================================
  socket.on('ttt_join', ({ roomId }) => {
    if (!currentUser) return;
    const rId = (roomId || 'GLOBAL-1').trim().toUpperCase();
    socket.join('ttt_' + rId);

    let room = activeRooms.ttt.get(rId);
    if (!room) {
      room = {
        id: rId,
        players: [],
        board: Array(9).fill(null),
        turn: 0,
        status: 'waiting',
        winner: null,
        scores: { X: 0, O: 0, draws: 0 }
      };
      activeRooms.ttt.set(rId, room);
    }

    const existingIndex = room.players.findIndex(p => p.id === currentUser.id);
    if (existingIndex === -1 && room.players.length < 2) {
      room.players.push({
        id: currentUser.id,
        name: currentUser.name,
        studentId: currentUser.studentId,
        avatar: currentUser.avatar,
        symbol: room.players.length === 0 ? 'X' : 'O',
        socketId: socket.id
      });
    }

    if (room.players.length === 2 && room.status === 'waiting') {
      room.status = 'playing';
      room.board = Array(9).fill(null);
      room.turn = 0;
    }

    io.to('ttt_' + rId).emit('ttt_state', room);
  });

  socket.on('ttt_move', ({ roomId, index }) => {
    if (!currentUser) return;
    const rId = (roomId || 'GLOBAL-1').trim().toUpperCase();
    const room = activeRooms.ttt.get(rId);
    if (!room || room.status !== 'playing') return;

    const playerIndex = room.players.findIndex(p => p.id === currentUser.id);
    if (playerIndex === -1 || playerIndex !== room.turn) return;
    if (room.board[index] !== null) return;

    const symbol = room.players[playerIndex].symbol;
    room.board[index] = symbol;

    const winLines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    let isWin = false;
    for (const [a, b, c] of winLines) {
      if (room.board[a] && room.board[a] === room.board[b] && room.board[a] === room.board[c]) {
        isWin = true;
        room.status = 'win';
        room.winner = room.players[playerIndex];
        room.winLine = [a, b, c];
        room.scores[symbol]++;
        awardXP(currentUser.id, 25);
        break;
      }
    }

    if (!isWin) {
      if (room.board.every(cell => cell !== null)) {
        room.status = 'draw';
        room.scores.draws++;
        awardXP(room.players[0].id, 10);
        awardXP(room.players[1].id, 10);
      } else {
        room.turn = 1 - room.turn;
      }
    }

    io.to('ttt_' + rId).emit('ttt_state', room);
  });

  socket.on('ttt_rematch', ({ roomId }) => {
    const rId = (roomId || 'GLOBAL-1').trim().toUpperCase();
    const room = activeRooms.ttt.get(rId);
    if (!room || room.players.length !== 2) return;

    room.board = Array(9).fill(null);
    room.status = 'playing';
    room.winner = null;
    room.winLine = null;
    room.turn = (room.turn === 0 ? 1 : 0);

    io.to('ttt_' + rId).emit('ttt_state', room);
  });

  // ==========================================
  // MULTIPLAYER GAME 2: CONNECT FOUR
  // ==========================================
  socket.on('c4_join', ({ roomId }) => {
    if (!currentUser) return;
    const rId = (roomId || 'C4-LOBBY').trim().toUpperCase();
    socket.join('c4_' + rId);

    let room = activeRooms.c4.get(rId);
    if (!room) {
      room = {
        id: rId,
        players: [],
        grid: Array.from({ length: 6 }, () => Array(7).fill(0)),
        turn: 0,
        status: 'waiting',
        winner: null,
        scores: { 1: 0, 2: 0 }
      };
      activeRooms.c4.set(rId, room);
    }

    const existingIndex = room.players.findIndex(p => p.id === currentUser.id);
    if (existingIndex === -1 && room.players.length < 2) {
      room.players.push({
        id: currentUser.id,
        name: currentUser.name,
        studentId: currentUser.studentId,
        avatar: currentUser.avatar,
        color: room.players.length === 0 ? 'red' : 'yellow',
        playerNumber: room.players.length + 1,
        socketId: socket.id
      });
    }

    if (room.players.length === 2 && room.status === 'waiting') {
      room.status = 'playing';
      room.grid = Array.from({ length: 6 }, () => Array(7).fill(0));
      room.turn = 0;
    }

    io.to('c4_' + rId).emit('c4_state', room);
  });

  function checkConnect4Win(grid, player) {
    const ROWS = 6;
    const COLS = 7;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS - 3; c++) {
        if (grid[r][c] === player && grid[r][c+1] === player && grid[r][c+2] === player && grid[r][c+3] === player) return true;
      }
    }
    for (let r = 0; r < ROWS - 3; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c] === player && grid[r+1][c] === player && grid[r+2][c] === player && grid[r+3][c] === player) return true;
      }
    }
    for (let r = 0; r < ROWS - 3; r++) {
      for (let c = 0; c < COLS - 3; c++) {
        if (grid[r][c] === player && grid[r+1][c+1] === player && grid[r+2][c+2] === player && grid[r+3][c+3] === player) return true;
      }
    }
    for (let r = 3; r < ROWS; r++) {
      for (let c = 0; c < COLS - 3; c++) {
        if (grid[r][c] === player && grid[r-1][c+1] === player && grid[r-2][c+2] === player && grid[r-3][c+3] === player) return true;
      }
    }
    return false;
  }

  socket.on('c4_drop', ({ roomId, col }) => {
    if (!currentUser) return;
    const rId = (roomId || 'C4-LOBBY').trim().toUpperCase();
    const room = activeRooms.c4.get(rId);
    if (!room || room.status !== 'playing') return;

    const playerIndex = room.players.findIndex(p => p.id === currentUser.id);
    if (playerIndex === -1 || playerIndex !== room.turn) return;

    const playerNum = room.players[playerIndex].playerNumber;
    let targetRow = -1;
    for (let r = 5; r >= 0; r--) {
      if (room.grid[r][col] === 0) {
        targetRow = r;
        break;
      }
    }
    if (targetRow === -1) return;

    room.grid[targetRow][col] = playerNum;

    if (checkConnect4Win(room.grid, playerNum)) {
      room.status = 'win';
      room.winner = room.players[playerIndex];
      room.scores[playerNum]++;
      awardXP(currentUser.id, 35);
    } else {
      const isFull = room.grid[0].every(cell => cell !== 0);
      if (isFull) {
        room.status = 'draw';
        awardXP(room.players[0].id, 15);
        awardXP(room.players[1].id, 15);
      } else {
        room.turn = 1 - room.turn;
      }
    }

    io.to('c4_' + rId).emit('c4_state', room);
  });

  socket.on('c4_rematch', ({ roomId }) => {
    const rId = (roomId || 'C4-LOBBY').trim().toUpperCase();
    const room = activeRooms.c4.get(rId);
    if (!room || room.players.length !== 2) return;

    room.grid = Array.from({ length: 6 }, () => Array(7).fill(0));
    room.status = 'playing';
    room.winner = null;
    room.turn = (room.turn === 0 ? 1 : 0);

    io.to('c4_' + rId).emit('c4_state', room);
  });

  // ==========================================
  // MULTIPLAYER GAME 3: CLASS QUIZ BATTLE
  // ==========================================
  socket.on('quiz_join', ({ roomId }) => {
    if (!currentUser) return;
    const rId = (roomId || 'CLASS-QUIZ').trim().toUpperCase();
    socket.join('quiz_' + rId);

    let room = activeRooms.quiz.get(rId);
    if (!room) {
      room = {
        id: rId,
        hostId: currentUser.id,
        players: [],
        status: 'lobby',
        currentQuestionIndex: 0,
        totalQuestions: 5,
        questions: [],
        scores: {},
        answersGiven: {},
        timeLeft: 10,
        timerInterval: null
      };
      activeRooms.quiz.set(rId, room);
    }

    if (!room.players.find(p => p.id === currentUser.id)) {
      room.players.push({
        id: currentUser.id,
        name: currentUser.name,
        studentId: currentUser.studentId,
        avatar: currentUser.avatar
      });
      room.scores[currentUser.id] = room.scores[currentUser.id] || 0;
    }

    emitQuizState(rId);
  });

  function emitQuizState(rId) {
    const room = activeRooms.quiz.get(rId);
    if (!room) return;

    const sanitizedQuestions = room.questions.map(q => ({
      id: q.id,
      question: q.question,
      options: q.options,
      category: q.category
    }));

    io.to('quiz_' + rId).emit('quiz_state', {
      id: room.id,
      hostId: room.hostId,
      players: room.players,
      status: room.status,
      currentQuestionIndex: room.currentQuestionIndex,
      totalQuestions: room.totalQuestions,
      currentQuestion: sanitizedQuestions[room.currentQuestionIndex] || null,
      scores: room.scores,
      timeLeft: room.timeLeft,
      roundResult: room.roundResult || null
    });
  }

  socket.on('quiz_start', ({ roomId }) => {
    if (!currentUser) return;
    const rId = (roomId || 'CLASS-QUIZ').trim().toUpperCase();
    const room = activeRooms.quiz.get(rId);
    if (!room || room.status !== 'lobby') return;

    const shuffled = [...quizQuestions].sort(() => 0.5 - Math.random());
    room.questions = shuffled.slice(0, 5);
    room.currentQuestionIndex = 0;
    room.scores = {};
    room.players.forEach(p => room.scores[p.id] = 0);

    startQuizQuestion(rId);
  });

  function startQuizQuestion(rId) {
    const room = activeRooms.quiz.get(rId);
    if (!room) return;

    clearInterval(room.timerInterval);
    room.status = 'question';
    room.timeLeft = 10;
    room.answersGiven = {};
    room.roundResult = null;
    room.questionStartTime = Date.now();

    emitQuizState(rId);

    room.timerInterval = setInterval(() => {
      room.timeLeft--;
      if (room.timeLeft <= 0) {
        clearInterval(room.timerInterval);
        endQuizQuestion(rId);
      } else {
        io.to('quiz_' + rId).emit('quiz_timer', { timeLeft: room.timeLeft });
      }
    }, 1000);
  }

  socket.on('quiz_answer', ({ roomId, optionIndex }) => {
    if (!currentUser) return;
    const rId = (roomId || 'CLASS-QUIZ').trim().toUpperCase();
    const room = activeRooms.quiz.get(rId);
    if (!room || room.status !== 'question') return;
    if (room.answersGiven[currentUser.id] !== undefined) return;

    const timeTaken = (Date.now() - room.questionStartTime) / 1000;
    const currentQ = room.questions[room.currentQuestionIndex];
    const isCorrect = optionIndex === currentQ.answer;

    let points = 0;
    if (isCorrect) {
      points = Math.round(100 + Math.max(0, (10 - timeTaken) * 5));
      room.scores[currentUser.id] = (room.scores[currentUser.id] || 0) + points;
    }

    room.answersGiven[currentUser.id] = { option: optionIndex, correct: isCorrect, points };
    socket.emit('quiz_answer_ack', { isCorrect, correctAnswer: currentQ.answer, points });

    if (Object.keys(room.answersGiven).length >= room.players.length) {
      clearInterval(room.timerInterval);
      endQuizQuestion(rId);
    }
  });

  function endQuizQuestion(rId) {
    const room = activeRooms.quiz.get(rId);
    if (!room) return;

    const currentQ = room.questions[room.currentQuestionIndex];
    room.status = 'result';
    room.roundResult = {
      correctAnswerIndex: currentQ.answer,
      correctAnswerText: currentQ.options[currentQ.answer],
      answers: room.answersGiven
    };

    emitQuizState(rId);

    setTimeout(() => {
      room.currentQuestionIndex++;
      if (room.currentQuestionIndex < room.questions.length) {
        startQuizQuestion(rId);
      } else {
        room.status = 'finished';
        const sorted = [...room.players].sort((a, b) => (room.scores[b.id] || 0) - (room.scores[a.id] || 0));
        if (sorted[0]) awardXP(sorted[0].id, 50);
        if (sorted[1]) awardXP(sorted[1].id, 30);
        if (sorted[2]) awardXP(sorted[2].id, 20);
        emitQuizState(rId);
      }
    }, 3500);
  }

  socket.on('quiz_reset', ({ roomId }) => {
    const rId = (roomId || 'CLASS-QUIZ').trim().toUpperCase();
    const room = activeRooms.quiz.get(rId);
    if (!room) return;
    clearInterval(room.timerInterval);
    room.status = 'lobby';
    room.currentQuestionIndex = 0;
    emitQuizState(rId);
  });

  // ==========================================
  // MULTIPLAYER GAME 4: ROCK-PAPER-SCISSORS (NEW!)
  // ==========================================
  socket.on('rps_join', ({ roomId }) => {
    if (!currentUser) return;
    const rId = (roomId || 'RPS-ARENA').trim().toUpperCase();
    socket.join('rps_' + rId);

    let room = activeRooms.rps.get(rId);
    if (!room) {
      room = {
        id: rId,
        players: [],
        choices: {}, // userId -> 'rock'|'paper'|'scissors'
        status: 'waiting', // waiting, choosing, reveal
        scores: {}, // userId -> score
        round: 1,
        lastWinner: null
      };
      activeRooms.rps.set(rId, room);
    }

    if (!room.players.find(p => p.id === currentUser.id) && room.players.length < 2) {
      room.players.push({
        id: currentUser.id,
        name: currentUser.name,
        studentId: currentUser.studentId,
        avatar: currentUser.avatar
      });
      room.scores[currentUser.id] = 0;
    }

    if (room.players.length === 2 && room.status === 'waiting') {
      room.status = 'choosing';
      room.choices = {};
    }

    emitRPSState(rId);
  });

  function emitRPSState(rId) {
    const room = activeRooms.rps.get(rId);
    if (!room) return;

    // Mask choices unless reveal
    const maskedChoices = {};
    room.players.forEach(p => {
      maskedChoices[p.id] = room.status === 'reveal' ? room.choices[p.id] : (room.choices[p.id] ? 'locked' : null);
    });

    io.to('rps_' + rId).emit('rps_state', {
      id: room.id,
      players: room.players,
      status: room.status,
      choices: maskedChoices,
      scores: room.scores,
      round: room.round,
      lastWinner: room.lastWinner
    });
  }

  socket.on('rps_choice', ({ roomId, choice }) => {
    if (!currentUser) return;
    const rId = (roomId || 'RPS-ARENA').trim().toUpperCase();
    const room = activeRooms.rps.get(rId);
    if (!room || room.status !== 'choosing') return;

    room.choices[currentUser.id] = choice;

    if (room.players.every(p => room.choices[p.id])) {
      // Both locked in -> evaluate
      room.status = 'reveal';
      const [p1, p2] = room.players;
      const c1 = room.choices[p1.id];
      const c2 = room.choices[p2.id];

      if (c1 === c2) {
        room.lastWinner = 'draw';
      } else if (
        (c1 === 'rock' && c2 === 'scissors') ||
        (c1 === 'paper' && c2 === 'rock') ||
        (c1 === 'scissors' && c2 === 'paper')
      ) {
        room.lastWinner = p1;
        room.scores[p1.id] = (room.scores[p1.id] || 0) + 1;
        awardXP(p1.id, 10);
      } else {
        room.lastWinner = p2;
        room.scores[p2.id] = (room.scores[p2.id] || 0) + 1;
        awardXP(p2.id, 10);
      }

      emitRPSState(rId);

      setTimeout(() => {
        room.round++;
        room.status = 'choosing';
        room.choices = {};
        emitRPSState(rId);
      }, 3000);
    }
  });

  // ==========================================
  // MULTIPLAYER GAME 5: STUMBLE DASH ROYALE
  // ==========================================
  socket.on('stumble_join', ({ roomId }) => {
    if (!currentUser) return;
    const rId = (roomId || 'DASH-ARENA').trim().toUpperCase();
    socket.join('stumble_' + rId);

    let room = activeRooms.stumble.get(rId);
    if (!room) {
      room = {
        id: rId,
        players: new Map(),
        status: 'racing',
        winner: null,
        startTime: Date.now()
      };
      activeRooms.stumble.set(rId, room);
    }

    room.players.set(currentUser.id, {
      id: currentUser.id,
      name: currentUser.name,
      studentId: currentUser.studentId,
      avatar: currentUser.avatar || '🏃',
      x: 60,
      y: 200 + Math.random() * 80,
      vx: 0,
      vy: 0,
      isJumping: false,
      finished: false,
      socketId: socket.id,
      color: ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'][room.players.size % 6]
    });

    emitStumbleRacers(rId);
  });

  function emitStumbleRacers(rId) {
    const room = activeRooms.stumble.get(rId);
    if (!room) return;
    const racers = Array.from(room.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      studentId: p.studentId,
      avatar: p.avatar,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      isJumping: p.isJumping,
      finished: p.finished,
      color: p.color
    }));

    io.to('stumble_' + rId).emit('stumble_racers', {
      roomId: room.id,
      status: room.status,
      winner: room.winner,
      racers
    });
  }

  socket.on('stumble_move', ({ roomId, x, y, vx, vy, isJumping }) => {
    if (!currentUser) return;
    const rId = (roomId || 'DASH-ARENA').trim().toUpperCase();
    const room = activeRooms.stumble.get(rId);
    if (!room) return;

    const player = room.players.get(currentUser.id);
    if (player && !player.finished) {
      player.x = x;
      player.y = y;
      player.vx = vx;
      player.vy = vy;
      player.isJumping = isJumping;

      socket.to('stumble_' + rId).emit('stumble_racer_update', {
        id: currentUser.id,
        x, y, vx, vy, isJumping
      });
    }
  });

  socket.on('stumble_finish', ({ roomId }) => {
    if (!currentUser) return;
    const rId = (roomId || 'DASH-ARENA').trim().toUpperCase();
    const room = activeRooms.stumble.get(rId);
    if (!room) return;

    const player = room.players.get(currentUser.id);
    if (player && !player.finished) {
      player.finished = true;
      if (!room.winner) {
        room.winner = {
          id: currentUser.id,
          name: currentUser.name,
          studentId: currentUser.studentId,
          avatar: currentUser.avatar
        };
        awardXP(currentUser.id, 75);
      } else {
        awardXP(currentUser.id, 25);
      }
      emitStumbleRacers(rId);
    }
  });

  socket.on('stumble_restart', ({ roomId }) => {
    const rId = (roomId || 'DASH-ARENA').trim().toUpperCase();
    const room = activeRooms.stumble.get(rId);
    if (!room) return;

    room.status = 'racing';
    room.winner = null;
    room.players.forEach(p => {
      p.x = 60;
      p.y = 200 + Math.random() * 80;
      p.vx = 0;
      p.vy = 0;
      p.isJumping = false;
      p.finished = false;
    });

    emitStumbleRacers(rId);
    io.to('stumble_' + rId).emit('stumble_reset_stage');
  });

  socket.on('disconnect', () => {
    if (currentUser) {
      onlineSockets.delete(socket.id);
      io.emit('online_users', getOnlineUsersList());
    }
  });
});

// Fallback for SPA routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 ClassVerse Server running on http://localhost:${PORT}`);
});
