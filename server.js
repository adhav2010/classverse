const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { Chess } = require('chess.js');

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

// Lightweight keep-alive & health check endpoints
app.get(['/ping', '/health', '/api/ping'], (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
});

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

app.post('/api/register', (req, res) => {
  const { name, studentId, password, avatar } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Full Name is required' });
  }
  if (!studentId || !studentId.trim()) {
    return res.status(400).json({ error: 'Student ID is required' });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters long' });
  }

  const cleanId = studentId.trim().toUpperCase();
  const existing = users.find(u => u.studentId.toUpperCase() === cleanId);
  if (existing) {
    return res.status(400).json({ error: `Student ID "${cleanId}" is already registered. Please sign in or use another ID.` });
  }

  const newUser = {
    id: 'user_' + uuidv4().slice(0, 8),
    name: name.trim(),
    studentId: cleanId,
    passwordHash: bcrypt.hashSync(password, 10),
    role: 'student',
    avatar: avatar || '🎓',
    statusMessage: 'Just joined ClassVerse! 👋',
    xp: 50,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  saveUsers();

  const token = jwt.sign({ id: newUser.id, studentId: newUser.studentId, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });

  res.status(201).json({
    success: true,
    token,
    user: {
      id: newUser.id,
      name: newUser.name,
      studentId: newUser.studentId,
      role: newUser.role,
      avatar: newUser.avatar,
      statusMessage: newUser.statusMessage,
      xp: newUser.xp
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
app.get('/api/leaderboard', authMiddleware, (req, res) => {
  const leaderboard = users.map(u => ({
    id: u.id,
    name: u.name,
    studentId: u.studentId,
    role: u.role,
    avatar: u.avatar || '🎓',
    statusMessage: u.statusMessage || '',
    xp: u.xp || 0,
    createdAt: u.createdAt
  })).sort((a, b) => (b.xp || 0) - (a.xp || 0));
  res.json({ leaderboard });
});

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
  stumble: new Map(), // Multiplayer Stumble Dash Royale
  chess: new Map(),   // Multiplayer Chess with Spectators
  ludo: new Map(),    // Multiplayer 4-Player Ludo
  snl: new Map(),     // Snake and Ladder
  scribble: new Map(),// Skribbl Draw & Guess
  mafia: new Map()    // Mafia Social Deduction
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

  // ==========================================
  // MULTIPLAYER GAME 6: CHESS WITH SPECTATORS
  // ==========================================
  function getChessRoomsList() {
    const list = [];
    for (const [roomId, room] of activeRooms.chess.entries()) {
      list.push({
        id: roomId,
        status: room.status,
        winner: room.winner,
        whitePlayer: room.players.white ? {
          id: room.players.white.id,
          name: room.players.white.name,
          studentId: room.players.white.studentId,
          avatar: room.players.white.avatar
        } : null,
        blackPlayer: room.players.black ? {
          id: room.players.black.id,
          name: room.players.black.name,
          studentId: room.players.black.studentId,
          avatar: room.players.black.avatar
        } : null,
        spectatorCount: room.spectators ? room.spectators.length : 0,
        spectators: (room.spectators || []).map(s => ({
          id: s.id,
          name: s.name,
          avatar: s.avatar
        })),
        movesCount: room.history ? room.history.length : 0,
        turn: room.chess ? room.chess.turn() : 'w'
      });
    }
    return list;
  }

  function broadcastChessRoomsList() {
    io.emit('chess_rooms_list', getChessRoomsList());
  }

  // Ensure default table exists
  if (!activeRooms.chess.has('GRANDMASTER-1')) {
    activeRooms.chess.set('GRANDMASTER-1', {
      id: 'GRANDMASTER-1',
      chess: new Chess(),
      players: { white: null, black: null },
      spectators: [],
      status: 'waiting',
      winner: null,
      history: [],
      lastMove: null
    });
  }

  socket.on('chess_get_rooms', () => {
    socket.emit('chess_rooms_list', getChessRoomsList());
  });

  socket.on('chess_join', ({ roomId, asSpectator }) => {
    if (!currentUser) return;
    const rId = (roomId || 'GRANDMASTER-1').trim().toUpperCase();

    // Clean up spectator membership from any other chess rooms
    for (const [otherId, otherRoom] of activeRooms.chess.entries()) {
      if (otherId !== rId) {
        const specIdx = otherRoom.spectators.findIndex(s => s.id === currentUser.id);
        if (specIdx !== -1) {
          otherRoom.spectators.splice(specIdx, 1);
          socket.leave('chess_' + otherId);
          emitChessState(otherId);
        }
      }
    }

    socket.join('chess_' + rId);

    let room = activeRooms.chess.get(rId);
    if (!room) {
      room = {
        id: rId,
        chess: new Chess(),
        players: { white: null, black: null },
        spectators: [],
        status: 'waiting',
        winner: null,
        history: [],
        lastMove: null
      };
      activeRooms.chess.set(rId, room);
    }

    const isWhite = room.players.white && room.players.white.id === currentUser.id;
    const isBlack = room.players.black && room.players.black.id === currentUser.id;

    if (isWhite) {
      room.players.white.socketId = socket.id;
    } else if (isBlack) {
      room.players.black.socketId = socket.id;
    } else if (!asSpectator && !room.players.white) {
      room.players.white = {
        id: currentUser.id,
        name: currentUser.name,
        studentId: currentUser.studentId,
        avatar: currentUser.avatar,
        socketId: socket.id
      };
    } else if (!asSpectator && !room.players.black) {
      room.players.black = {
        id: currentUser.id,
        name: currentUser.name,
        studentId: currentUser.studentId,
        avatar: currentUser.avatar,
        socketId: socket.id
      };
      if (room.players.white) room.status = 'playing';
    } else {
      const specIdx = room.spectators.findIndex(s => s.id === currentUser.id);
      if (specIdx === -1) {
        room.spectators.push({
          id: currentUser.id,
          name: currentUser.name,
          studentId: currentUser.studentId,
          avatar: currentUser.avatar,
          socketId: socket.id
        });
      } else {
        room.spectators[specIdx].socketId = socket.id;
      }
    }

    emitChessState(rId);
    broadcastChessRoomsList();
  });

  socket.on('chess_create_match', ({ roomName, targetStudentId }) => {
    if (!currentUser) return;
    const rId = (roomName || `TABLE-${Math.floor(100 + Math.random() * 900)}`).trim().toUpperCase();

    // Leave old rooms
    for (const [otherId, otherRoom] of activeRooms.chess.entries()) {
      const specIdx = otherRoom.spectators.findIndex(s => s.id === currentUser.id);
      if (specIdx !== -1) {
        otherRoom.spectators.splice(specIdx, 1);
        socket.leave('chess_' + otherId);
        emitChessState(otherId);
      }
    }

    let room = activeRooms.chess.get(rId);
    if (!room) {
      room = {
        id: rId,
        chess: new Chess(),
        players: {
          white: {
            id: currentUser.id,
            name: currentUser.name,
            studentId: currentUser.studentId,
            avatar: currentUser.avatar,
            socketId: socket.id
          },
          black: null
        },
        spectators: [],
        status: 'waiting',
        winner: null,
        history: [],
        lastMove: null
      };
      activeRooms.chess.set(rId, room);
    } else if (!room.players.white) {
      room.players.white = {
        id: currentUser.id,
        name: currentUser.name,
        studentId: currentUser.studentId,
        avatar: currentUser.avatar,
        socketId: socket.id
      };
    }

    socket.join('chess_' + rId);
    emitChessState(rId);
    broadcastChessRoomsList();

    // Send direct challenge invite if targetStudentId provided
    if (targetStudentId) {
      const targetSession = Array.from(onlineSockets.values()).find(s => s.user.studentId === targetStudentId);
      if (targetSession) {
        io.to(targetSession.socketId).emit('challenge_received', {
          challenger: {
            id: currentUser.id,
            name: currentUser.name,
            studentId: currentUser.studentId,
            avatar: currentUser.avatar
          },
          gameType: 'chess',
          roomId: rId
        });
      }
    }
  });

  socket.on('chess_leave', ({ roomId }) => {
    if (!currentUser) return;
    const rId = (roomId || '').trim().toUpperCase();
    const room = activeRooms.chess.get(rId);
    if (room) {
      room.spectators = room.spectators.filter(s => s.id !== currentUser.id);
      socket.leave('chess_' + rId);
      emitChessState(rId);
      broadcastChessRoomsList();
    }
  });

  function emitChessState(rId) {
    const room = activeRooms.chess.get(rId);
    if (!room) return;

    io.to('chess_' + rId).emit('chess_state', {
      id: room.id,
      fen: room.chess.fen(),
      turn: room.chess.turn(),
      status: room.status,
      winner: room.winner,
      whitePlayer: room.players.white,
      blackPlayer: room.players.black,
      spectators: room.spectators,
      history: room.history,
      lastMove: room.lastMove,
      inCheck: room.chess.inCheck(),
      isCheckmate: room.chess.isCheckmate(),
      isDraw: room.chess.isDraw()
    });
  }

  socket.on('chess_move', ({ roomId, from, to, promotion }) => {
    if (!currentUser) return;
    const rId = (roomId || 'GRANDMASTER-1').trim().toUpperCase();
    const room = activeRooms.chess.get(rId);
    if (!room || room.status !== 'playing') return;

    const currentTurn = room.chess.turn();
    const isWhiteTurn = currentTurn === 'w';
    const playerExpected = isWhiteTurn ? room.players.white : room.players.black;

    if (!playerExpected || playerExpected.id !== currentUser.id) {
      return socket.emit('chess_error', "It is not your turn!");
    }

    try {
      const move = room.chess.move({
        from,
        to,
        promotion: promotion || 'q'
      });

      if (!move) {
        return socket.emit('chess_error', "Illegal move!");
      }

      room.lastMove = { from, to };
      room.history.push(move.san);

      if (room.chess.isCheckmate()) {
        room.status = 'checkmate';
        room.winner = isWhiteTurn ? 'white' : 'black';
        awardXP(playerExpected.id, 60);
      } else if (room.chess.isDraw()) {
        room.status = 'draw';
      }

      emitChessState(rId);
      broadcastChessRoomsList();
    } catch (err) {
      socket.emit('chess_error', err.message);
    }
  });

  socket.on('chess_cheer', ({ roomId, emoji }) => {
    if (!currentUser) return;
    const rId = (roomId || 'GRANDMASTER-1').trim().toUpperCase();
    io.to('chess_' + rId).emit('chess_cheer_event', {
      sender: currentUser.name,
      avatar: currentUser.avatar,
      emoji: emoji || '👏'
    });
  });

  socket.on('chess_rematch', ({ roomId }) => {
    const rId = (roomId || 'GRANDMASTER-1').trim().toUpperCase();
    const room = activeRooms.chess.get(rId);
    if (!room) return;

    room.chess = new Chess();
    room.status = (room.players.white && room.players.black) ? 'playing' : 'waiting';
    room.winner = null;
    room.history = [];
    room.lastMove = null;
    emitChessState(rId);
    broadcastChessRoomsList();
  });

  // ==========================================
  // MULTIPLAYER GAME 7: LUDO ROYALE (2-4 PLAYERS)
  // ==========================================
  const LUDO_COLORS = ['red', 'green', 'yellow', 'blue'];
  const LUDO_SAFE_TILES = [0, 8, 13, 21, 26, 34, 39, 47];
  const LUDO_START_OFFSETS = { red: 0, green: 13, yellow: 26, blue: 39 };

  socket.on('ludo_join', ({ roomId }) => {
    if (!currentUser) return;
    const rId = (roomId || 'LUDO-CLUB').trim().toUpperCase();
    socket.join('ludo_' + rId);

    let room = activeRooms.ludo.get(rId);
    if (!room) {
      room = {
        id: rId,
        players: [],
        status: 'lobby',
        turnIndex: 0,
        diceValue: null,
        canRoll: true,
        movableTokens: [],
        winner: null,
        historyLog: []
      };
      activeRooms.ludo.set(rId, room);
    }

    const existing = room.players.find(p => p.id === currentUser.id);
    if (!existing && room.players.length < 4 && room.status === 'lobby') {
      const assignedColor = LUDO_COLORS[room.players.length];
      room.players.push({
        id: currentUser.id,
        name: currentUser.name,
        studentId: currentUser.studentId,
        avatar: currentUser.avatar,
        color: assignedColor,
        tokens: [-1, -1, -1, -1]
      });
      room.historyLog.push(`${currentUser.name} joined as ${assignedColor.toUpperCase()}!`);
    }

    emitLudoState(rId);
  });

  function emitLudoState(rId) {
    const room = activeRooms.ludo.get(rId);
    if (!room) return;
    io.to('ludo_' + rId).emit('ludo_state', room);
  }

  socket.on('ludo_play_solo', ({ roomId }) => {
    if (!currentUser) return;
    const rId = (roomId || 'LUDO-CLUB').trim().toUpperCase();
    socket.join('ludo_' + rId);

    const room = {
      id: rId,
      players: [
        {
          id: currentUser.id,
          name: currentUser.name,
          studentId: currentUser.studentId,
          avatar: currentUser.avatar,
          color: 'red',
          tokens: [-1, -1, -1, -1]
        },
        {
          id: 'bot_green',
          name: 'Bot Green 🤖',
          studentId: 'BOT-GREEN',
          avatar: '🤖',
          color: 'green',
          tokens: [-1, -1, -1, -1],
          isBot: true
        },
        {
          id: 'bot_yellow',
          name: 'Bot Yellow 🤖',
          studentId: 'BOT-YELLOW',
          avatar: '🤖',
          color: 'yellow',
          tokens: [-1, -1, -1, -1],
          isBot: true
        },
        {
          id: 'bot_blue',
          name: 'Bot Blue 🤖',
          studentId: 'BOT-BLUE',
          avatar: '🤖',
          color: 'blue',
          tokens: [-1, -1, -1, -1],
          isBot: true
        }
      ],
      status: 'playing',
      turnIndex: 0,
      diceValue: null,
      canRoll: true,
      movableTokens: [],
      winner: null,
      historyLog: [`🎮 Solo 4-Player match started! It's your turn to roll (RED)!`]
    };
    activeRooms.ludo.set(rId, room);
    emitLudoState(rId);
  });

  socket.on('ludo_add_bot', ({ roomId }) => {
    const rId = (roomId || 'LUDO-CLUB').trim().toUpperCase();
    const room = activeRooms.ludo.get(rId);
    if (!room || room.status !== 'lobby' || room.players.length >= 4) return;

    const assignedColor = LUDO_COLORS[room.players.length];
    room.players.push({
      id: 'bot_' + assignedColor,
      name: `Bot ${assignedColor.toUpperCase()} 🤖`,
      studentId: `BOT-${assignedColor.toUpperCase()}`,
      avatar: '🤖',
      color: assignedColor,
      tokens: [-1, -1, -1, -1],
      isBot: true
    });
    room.historyLog.push(`Added Bot ${assignedColor.toUpperCase()} to the table!`);
    emitLudoState(rId);
  });

  socket.on('ludo_start', ({ roomId }) => {
    const rId = (roomId || 'LUDO-CLUB').trim().toUpperCase();
    const room = activeRooms.ludo.get(rId);
    if (!room) return;

    // Auto-fill with bots up to 4 players so the match is always full and active
    while (room.players.length < 4) {
      const assignedColor = LUDO_COLORS[room.players.length];
      room.players.push({
        id: 'bot_' + assignedColor,
        name: `Bot ${assignedColor.toUpperCase()} 🤖`,
        studentId: `BOT-${assignedColor.toUpperCase()}`,
        avatar: '🤖',
        color: assignedColor,
        tokens: [-1, -1, -1, -1],
        isBot: true
      });
    }

    room.status = 'playing';
    const myIndex = room.players.findIndex(p => p.id === currentUser.id);
    room.turnIndex = myIndex !== -1 ? myIndex : 0;
    room.canRoll = true;
    room.diceValue = null;
    room.movableTokens = [];
    room.winner = null;
    room.historyLog.push(`Game started! ${room.players[room.turnIndex].name}'s turn.`);
    emitLudoState(rId);
    checkAndTriggerLudoBot(rId);
  });

  socket.on('ludo_roll_dice', ({ roomId }) => {
    if (!currentUser) return;
    const rId = (roomId || 'LUDO-CLUB').trim().toUpperCase();
    const room = activeRooms.ludo.get(rId);
    if (!room || room.status !== 'playing' || !room.canRoll) return;

    let currentPlayer = room.players[room.turnIndex];
    if (!currentPlayer) return;

    // If current turn player is offline and not a bot, auto-advance
    const isOnline = Array.from(onlineSockets.values()).some(s => s.user.id === currentPlayer.id);
    if (!isOnline && !currentPlayer.isBot) {
      room.historyLog.push(`${currentPlayer.name} is offline. Skipping to next player...`);
      advanceLudoTurn(rId, false);
      return;
    }

    if (currentPlayer.id !== currentUser.id) {
      socket.emit('ludo_error', `It is currently ${currentPlayer.name}'s turn!`);
      return;
    }

    const roll = Math.floor(Math.random() * 6) + 1;
    room.diceValue = roll;
    room.canRoll = false;

    const movable = [];
    currentPlayer.tokens.forEach((pos, idx) => {
      if (pos === -1) {
        if (roll === 6) movable.push(idx);
      } else if (pos < 106) {
        if (pos >= 100) {
          if (pos + roll <= 106) movable.push(idx);
        } else {
          movable.push(idx);
        }
      }
    });

    room.movableTokens = movable;
    room.historyLog.push(`${currentPlayer.name} rolled a ${roll}!`);
    if (room.historyLog.length > 20) room.historyLog.shift();

    if (movable.length === 0) {
      emitLudoState(rId);
      setTimeout(() => {
        advanceLudoTurn(rId, roll === 6);
      }, 1000);
    } else if (movable.length === 1) {
      emitLudoState(rId);
      setTimeout(() => {
        executeLudoMove(rId, currentPlayer.id, movable[0]);
      }, 700);
    } else {
      emitLudoState(rId);
    }
  });

  socket.on('ludo_select_token', ({ roomId, tokenIndex }) => {
    if (!currentUser) return;
    const rId = (roomId || 'LUDO-CLUB').trim().toUpperCase();
    const room = activeRooms.ludo.get(rId);
    if (!room || room.status !== 'playing') return;

    const currentPlayer = room.players[room.turnIndex];
    if (currentPlayer.id !== currentUser.id) return;
    if (!room.movableTokens.includes(tokenIndex)) return;

    executeLudoMove(rId, currentUser.id, tokenIndex);
  });

  function executeLudoMove(rId, playerId, tokenIndex) {
    const room = activeRooms.ludo.get(rId);
    if (!room || room.status !== 'playing') return;

    const player = room.players[room.turnIndex];
    if (player.id !== playerId) return;

    const roll = room.diceValue;
    const oldPos = player.tokens[tokenIndex];
    let newPos = oldPos;
    let bonusTurn = (roll === 6);

    const startOffset = LUDO_START_OFFSETS[player.color];

    if (oldPos === -1 && roll === 6) {
      newPos = startOffset;
      room.historyLog.push(`${player.name} deployed a token to start!`);
    } else if (oldPos >= 100) {
      newPos = oldPos + roll;
      if (newPos === 106) {
        room.historyLog.push(`🌟 ${player.name}'s token reached Home!`);
        bonusTurn = true;
      }
    } else if (oldPos >= 0) {
      const stepsTraveled = (oldPos - startOffset + 52) % 52;
      if (stepsTraveled + roll >= 51) {
        const corridorStep = (stepsTraveled + roll) - 51;
        newPos = 100 + corridorStep;
        if (newPos >= 106) {
          newPos = 106;
          room.historyLog.push(`🌟 ${player.name}'s token reached Home!`);
          bonusTurn = true;
        }
      } else {
        newPos = (oldPos + roll) % 52;

        if (!LUDO_SAFE_TILES.includes(newPos)) {
          room.players.forEach(other => {
            if (other.id !== player.id) {
              other.tokens.forEach((oPos, oIdx) => {
                if (oPos === newPos) {
                  other.tokens[oIdx] = -1;
                  bonusTurn = true;
                  room.historyLog.push(`💥 ${player.name} captured ${other.name}'s token! Bonus roll!`);
                }
              });
            }
          });
        }
      }
    }

    player.tokens[tokenIndex] = newPos;

    if (player.tokens.every(t => t === 106)) {
      room.status = 'finished';
      room.winner = player;
      awardXP(player.id, 80);
      room.historyLog.push(`🏆 ${player.name} WON THE LUDO MATCH!`);
      emitLudoState(rId);
      return;
    }

    advanceLudoTurn(rId, bonusTurn);
  }

  function advanceLudoTurn(rId, bonusTurn) {
    const room = activeRooms.ludo.get(rId);
    if (!room || room.status !== 'playing') return;

    if (!bonusTurn) {
      room.turnIndex = (room.turnIndex + 1) % room.players.length;
    }
    room.canRoll = true;
    room.diceValue = null;
    room.movableTokens = [];
    emitLudoState(rId);

    // Auto-skip offline non-bot players after a moment
    const nextPlayer = room.players[room.turnIndex];
    if (nextPlayer && !nextPlayer.isBot) {
      const isOnline = Array.from(onlineSockets.values()).some(s => s.user.id === nextPlayer.id);
      if (!isOnline) {
        setTimeout(() => {
          room.historyLog.push(`${nextPlayer.name} is offline. Auto-advancing turn.`);
          advanceLudoTurn(rId, false);
        }, 1200);
        return;
      }
    }

    checkAndTriggerLudoBot(rId);
  }

  function checkAndTriggerLudoBot(rId) {
    const room = activeRooms.ludo.get(rId);
    if (!room || room.status !== 'playing' || room.winner) return;
    const player = room.players[room.turnIndex];
    if (player && player.isBot && room.canRoll) {
      setTimeout(() => {
        executeLudoBotTurn(rId);
      }, 750);
    }
  }

  function executeLudoBotTurn(rId) {
    const room = activeRooms.ludo.get(rId);
    if (!room || room.status !== 'playing') return;
    const player = room.players[room.turnIndex];
    if (!player || !player.isBot) return;

    const roll = Math.floor(Math.random() * 6) + 1;
    room.diceValue = roll;
    room.canRoll = false;

    const movable = [];
    player.tokens.forEach((pos, idx) => {
      if (pos === -1) {
        if (roll === 6) movable.push(idx);
      } else if (pos < 106) {
        if (pos >= 100) {
          if (pos + roll <= 106) movable.push(idx);
        } else {
          movable.push(idx);
        }
      }
    });

    room.movableTokens = movable;
    room.historyLog.push(`${player.name} rolled a ${roll}!`);
    emitLudoState(rId);

    if (movable.length === 0) {
      setTimeout(() => advanceLudoTurn(rId, roll === 6), 900);
    } else {
      const tokenPick = (roll === 6 && movable.some(t => player.tokens[t] === -1))
        ? movable.find(t => player.tokens[t] === -1)
        : movable[0];

      setTimeout(() => executeLudoMove(rId, player.id, tokenPick), 700);
    }
  }

  socket.on('ludo_reset', ({ roomId }) => {
    const rId = (roomId || 'LUDO-CLUB').trim().toUpperCase();
    const room = activeRooms.ludo.get(rId);
    if (!room) return;

    room.players.forEach(p => p.tokens = [-1, -1, -1, -1]);
    room.status = 'lobby';
    room.turnIndex = 0;
    room.canRoll = true;
    room.diceValue = null;
    room.movableTokens = [];
    room.winner = null;
    room.historyLog = [];
    emitLudoState(rId);
  });

  // ==========================================
  // MULTIPLAYER GAME 8: SNAKE AND LADDER
  // ==========================================
  const SNL_LADDERS = { 4: 14, 8: 30, 20: 42, 28: 76, 36: 44, 51: 67, 71: 92, 80: 99 };
  const SNL_SNAKES = { 98: 28, 95: 56, 92: 51, 83: 19, 73: 1, 69: 33, 64: 36, 59: 17, 52: 11, 48: 9 };
  const SNL_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

  socket.on('snl_join', ({ roomId }) => {
    if (!currentUser) return;
    const rId = (roomId || 'SNAKE-ARENA').trim().toUpperCase();
    socket.join('snl_' + rId);

    let room = activeRooms.snl.get(rId);
    if (!room) {
      room = {
        id: rId,
        players: [],
        turnIndex: 0,
        status: 'playing',
        lastRoll: null,
        winner: null,
        log: []
      };
      activeRooms.snl.set(rId, room);
    }

    let p = room.players.find(x => x.id === currentUser.id);
    if (!p && room.players.length < 6) {
      room.players.push({
        id: currentUser.id,
        name: currentUser.name,
        studentId: currentUser.studentId,
        avatar: currentUser.avatar,
        position: 1,
        color: SNL_COLORS[room.players.length % SNL_COLORS.length]
      });
      room.log.push(`${currentUser.name} joined the board!`);
    }

    emitSnlState(rId);
  });

  socket.on('snl_play_solo', ({ roomId }) => {
    if (!currentUser) return;
    const rId = (roomId || 'SNAKE-ARENA').trim().toUpperCase();
    socket.join('snl_' + rId);

    const room = {
      id: rId,
      players: [
        {
          id: currentUser.id,
          name: currentUser.name,
          studentId: currentUser.studentId,
          avatar: currentUser.avatar,
          position: 1,
          color: SNL_COLORS[0],
          isBot: false
        },
        {
          id: 'bot_snl_1',
          name: 'Speedy Bot 🤖',
          studentId: 'BOT-1',
          avatar: '⚡',
          position: 1,
          color: SNL_COLORS[1],
          isBot: true
        },
        {
          id: 'bot_snl_2',
          name: 'Lucky Bot 🤖',
          studentId: 'BOT-2',
          avatar: '🍀',
          position: 1,
          color: SNL_COLORS[2],
          isBot: true
        },
        {
          id: 'bot_snl_3',
          name: 'Cosmo Bot 🤖',
          studentId: 'BOT-3',
          avatar: '🚀',
          position: 1,
          color: SNL_COLORS[3],
          isBot: true
        }
      ],
      turnIndex: 0,
      status: 'playing',
      lastRoll: null,
      winner: null,
      log: [`Solo race started! ${currentUser.name} vs 3 Bots. Your turn to roll!`]
    };
    activeRooms.snl.set(rId, room);
    emitSnlState(rId);
  });

  socket.on('snl_add_bot', ({ roomId }) => {
    const rId = (roomId || 'SNAKE-ARENA').trim().toUpperCase();
    const room = activeRooms.snl.get(rId);
    if (!room || room.players.length >= 6) return;

    const botNum = room.players.length + 1;
    room.players.push({
      id: 'bot_snl_' + botNum,
      name: `Racer Bot ${botNum} 🤖`,
      studentId: `BOT-${botNum}`,
      avatar: '🤖',
      position: 1,
      color: SNL_COLORS[room.players.length % SNL_COLORS.length],
      isBot: true
    });
    room.log.push(`Racer Bot ${botNum} joined the race!`);
    emitSnlState(rId);
  });

  function emitSnlState(rId) {
    const room = activeRooms.snl.get(rId);
    if (!room) return;
    io.to('snl_' + rId).emit('snl_state', room);
  }

  socket.on('snl_roll', ({ roomId }) => {
    if (!currentUser) return;
    const rId = (roomId || 'SNAKE-ARENA').trim().toUpperCase();
    const room = activeRooms.snl.get(rId);
    if (!room || room.players.length === 0 || room.winner) return;

    let currentPlayer = room.players[room.turnIndex];
    if (!currentPlayer) return;

    // Check if current turn player is offline and not a bot
    const isOnline = Array.from(onlineSockets.values()).some(s => s.user.id === currentPlayer.id);
    if (!isOnline && !currentPlayer.isBot) {
      room.log.push(`${currentPlayer.name} is offline. Skipping turn...`);
      room.turnIndex = (room.turnIndex + 1) % room.players.length;
      checkAndTriggerSnlBot(rId);
      emitSnlState(rId);
      return;
    }

    if (currentPlayer.id !== currentUser.id) {
      socket.emit('snl_error', `It is currently ${currentPlayer.name}'s turn!`);
      return;
    }

    const roll = Math.floor(Math.random() * 6) + 1;
    room.lastRoll = roll;

    let target = currentPlayer.position + roll;
    if (target > 100) {
      room.log.push(`${currentPlayer.name} rolled a ${roll} but needed exact roll to reach 100!`);
    } else {
      let eventText = `${currentPlayer.name} rolled ${roll} and moved to ${target}.`;
      if (SNL_LADDERS[target]) {
        const climbedTo = SNL_LADDERS[target];
        eventText = `🪜 ${currentPlayer.name} rolled ${roll} and CLIMBED A LADDER from ${target} to ${climbedTo}!`;
        target = climbedTo;
      } else if (SNL_SNAKES[target]) {
        const bittenTo = SNL_SNAKES[target];
        eventText = `🐍 Oh no! ${currentPlayer.name} rolled ${roll} and WAS BITTEN BY A SNAKE at ${target}, sliding to ${bittenTo}!`;
        target = bittenTo;
      }
      currentPlayer.position = target;
      room.log.push(eventText);

      if (target === 100) {
        room.winner = currentPlayer;
        room.log.push(`🎉 👑 ${currentPlayer.name} WON THE SNAKE & LADDER RACE!`);
        awardXP(currentPlayer.id, 60);
      }
    }

    if (room.log.length > 25) room.log.shift();

    if (!room.winner) {
      room.turnIndex = (room.turnIndex + 1) % room.players.length;
      checkAndTriggerSnlBot(rId);
    }

    emitSnlState(rId);
  });

  function checkAndTriggerSnlBot(rId) {
    const room = activeRooms.snl.get(rId);
    if (!room || room.winner || room.players.length === 0) return;
    const player = room.players[room.turnIndex];
    if (!player) return;

    if (player.isBot) {
      setTimeout(() => {
        executeSnlBotTurn(rId);
      }, 750);
    } else {
      // If next player is offline human, skip them after a short delay
      const isOnline = Array.from(onlineSockets.values()).some(s => s.user.id === player.id);
      if (!isOnline) {
        setTimeout(() => {
          const curRoom = activeRooms.snl.get(rId);
          if (curRoom && curRoom.turnIndex === room.turnIndex && !curRoom.winner) {
            curRoom.log.push(`${player.name} is offline. Skipping turn...`);
            curRoom.turnIndex = (curRoom.turnIndex + 1) % curRoom.players.length;
            checkAndTriggerSnlBot(rId);
            emitSnlState(rId);
          }
        }, 1200);
      }
    }
  }

  function executeSnlBotTurn(rId) {
    const room = activeRooms.snl.get(rId);
    if (!room || room.winner) return;
    const player = room.players[room.turnIndex];
    if (!player || !player.isBot) return;

    const roll = Math.floor(Math.random() * 6) + 1;
    room.lastRoll = roll;

    let target = player.position + roll;
    if (target > 100) {
      room.log.push(`${player.name} rolled ${roll} (overshot 100)`);
    } else {
      let eventText = `${player.name} rolled ${roll} and moved to ${target}.`;
      if (SNL_LADDERS[target]) {
        target = SNL_LADDERS[target];
        eventText = `🪜 ${player.name} climbed ladder to ${target}!`;
      } else if (SNL_SNAKES[target]) {
        target = SNL_SNAKES[target];
        eventText = `🐍 ${player.name} bitten by snake to ${target}!`;
      }
      player.position = target;
      room.log.push(eventText);

      if (target === 100) {
        room.winner = player;
        room.log.push(`👑 ${player.name} WON THE RACE!`);
      }
    }

    if (room.log.length > 25) room.log.shift();

    if (!room.winner) {
      room.turnIndex = (room.turnIndex + 1) % room.players.length;
      checkAndTriggerSnlBot(rId);
    }

    emitSnlState(rId);
  }

  socket.on('snl_reset', ({ roomId }) => {
    const rId = (roomId || 'SNAKE-ARENA').trim().toUpperCase();
    const room = activeRooms.snl.get(rId);
    if (!room) return;

    room.players.forEach(p => p.position = 1);
    room.turnIndex = 0;
    room.lastRoll = null;
    room.winner = null;
    room.log = [`Game reset! Roll to begin.`];
    emitSnlState(rId);
    checkAndTriggerSnlBot(rId);
  });

  // ==========================================
  // MULTIPLAYER GAME 9: SCRIBBLE (SKRIBBL DRAW & GUESS)
  // ==========================================
  const SCRIBBLE_WORDS = [
    'Pizza', 'Guitar', 'Rocket', 'Castle', 'Elephant', 'Rainbow', 'Computer',
    'Volcano', 'Spider', 'Airplane', 'Telescope', 'Basketball', 'Dragon',
    'Camera', 'Helicopter', 'Penguin', 'Diamond', 'Campfire', 'Crown',
    'Skateboard', 'Bicycle', 'Cupcake', 'Mermaid', 'Submarine', 'Unicorn'
  ];

  socket.on('scribble_join', ({ roomId }) => {
    if (!currentUser) return;
    const rId = (roomId || 'SCRIBBLE-LOUNGE').trim().toUpperCase();
    socket.join('scribble_' + rId);

    let room = activeRooms.scribble.get(rId);
    if (!room) {
      room = {
        id: rId,
        players: [],
        status: 'lobby',
        artistIndex: 0,
        word: '',
        maskedWord: '',
        hintsRevealed: 0,
        timeLeft: 60,
        round: 1,
        totalRounds: 3,
        strokes: [],
        guessedUsers: new Set(),
        chatLog: []
      };
      activeRooms.scribble.set(rId, room);
    }

    let p = room.players.find(x => x.id === currentUser.id);
    if (!p) {
      room.players.push({
        id: currentUser.id,
        name: currentUser.name,
        studentId: currentUser.studentId,
        avatar: currentUser.avatar,
        score: 0
      });
      room.chatLog.push({ system: true, text: `${currentUser.name} joined Scribble!` });
    }

    emitScribbleState(rId);
  });

  function emitScribbleState(rId) {
    const room = activeRooms.scribble.get(rId);
    if (!room) return;

    const currentArtist = room.players[room.artistIndex];
    io.to('scribble_' + rId).emit('scribble_state', {
      id: room.id,
      players: room.players,
      status: room.status,
      artist: currentArtist,
      maskedWord: room.maskedWord,
      revealedWord: (room.status === 'reveal' || room.status === 'game_over') ? room.word : null,
      timeLeft: room.timeLeft,
      round: room.round,
      totalRounds: room.totalRounds,
      chatLog: room.chatLog
    });

    if (currentArtist && room.status === 'drawing') {
      const artistSession = Array.from(onlineSockets.values()).find(s => s.user.id === currentArtist.id);
      if (artistSession) {
        io.to(artistSession.socketId).emit('scribble_secret_word', room.word);
      }
    }
  }

  socket.on('scribble_start', ({ roomId }) => {
    const rId = (roomId || 'SCRIBBLE-LOUNGE').trim().toUpperCase();
    const room = activeRooms.scribble.get(rId);
    if (!room) return;

    if (room.players.length < 2) {
      io.to('scribble_' + rId).emit('scribble_chat', { system: true, text: '⚠️ Need at least 2 players in the room to start Draw & Guess! Invite a classmate.' });
      return;
    }

    // Set artist to the user who clicked start if in room
    if (currentUser) {
      const myIdx = room.players.findIndex(p => p.id === currentUser.id);
      if (myIdx !== -1) room.artistIndex = myIdx;
    }

    startScribbleRound(rId);
  });

  function startScribbleRound(rId) {
    const room = activeRooms.scribble.get(rId);
    if (!room) return;

    clearInterval(room.timerInterval);

    const randomWord = SCRIBBLE_WORDS[Math.floor(Math.random() * SCRIBBLE_WORDS.length)];
    room.word = randomWord;
    room.maskedWord = randomWord.replace(/[a-zA-Z]/g, '_ ');
    room.hintsRevealed = 0;
    room.timeLeft = 60;
    room.status = 'drawing';
    room.strokes = [];
    room.guessedUsers = new Set();

    io.to('scribble_' + rId).emit('scribble_clear_canvas');
    emitScribbleState(rId);

    room.timerInterval = setInterval(() => {
      room.timeLeft--;
      if (room.timeLeft === 35 || room.timeLeft === 15) {
        revealScribbleHint(room);
      }

      if (room.timeLeft <= 0) {
        clearInterval(room.timerInterval);
        endScribbleRound(rId, "Time's up!");
      } else {
        io.to('scribble_' + rId).emit('scribble_tick', { timeLeft: room.timeLeft, maskedWord: room.maskedWord });
      }
    }, 1000);
  }

  function revealScribbleHint(room) {
    const word = room.word;
    const indices = [];
    for (let i = 0; i < word.length; i++) indices.push(i);
    const unrevealed = indices.filter(i => room.maskedWord[i * 2] === '_');
    if (unrevealed.length > 0) {
      const pick = unrevealed[Math.floor(Math.random() * unrevealed.length)];
      const chars = room.maskedWord.split('');
      chars[pick * 2] = word[pick].toUpperCase();
      room.maskedWord = chars.join('');
    }
  }

  socket.on('scribble_draw_step', ({ roomId, drawData }) => {
    if (!currentUser) return;
    const rId = (roomId || 'SCRIBBLE-LOUNGE').trim().toUpperCase();
    const room = activeRooms.scribble.get(rId);
    if (!room || room.status !== 'drawing') return;

    const currentArtist = room.players[room.artistIndex];
    if (currentArtist && currentArtist.id === currentUser.id) {
      socket.to('scribble_' + rId).emit('scribble_draw_step', drawData);
    }
  });

  socket.on('scribble_clear', ({ roomId }) => {
    if (!currentUser) return;
    const rId = (roomId || 'SCRIBBLE-LOUNGE').trim().toUpperCase();
    const room = activeRooms.scribble.get(rId);
    if (!room || room.status !== 'drawing') return;

    const currentArtist = room.players[room.artistIndex];
    if (currentArtist && currentArtist.id === currentUser.id) {
      io.to('scribble_' + rId).emit('scribble_clear_canvas');
    }
  });

  socket.on('scribble_guess', ({ roomId, text }) => {
    if (!currentUser || !text || !text.trim()) return;
    const rId = (roomId || 'SCRIBBLE-LOUNGE').trim().toUpperCase();
    const room = activeRooms.scribble.get(rId);
    if (!room || room.status !== 'drawing') return;

    const currentArtist = room.players[room.artistIndex];
    if (currentArtist && currentArtist.id === currentUser.id) return;

    const guess = text.trim().toLowerCase();
    const answer = room.word.toLowerCase();

    if (guess === answer) {
      if (!room.guessedUsers.has(currentUser.id)) {
        room.guessedUsers.add(currentUser.id);
        const points = Math.max(50, room.timeLeft * 8);
        const guesser = room.players.find(p => p.id === currentUser.id);
        if (guesser) guesser.score += points;
        if (currentArtist) currentArtist.score += 40;

        awardXP(currentUser.id, 15);
        room.chatLog.push({ system: true, text: `🎉 ${currentUser.name} guessed the word! (+${points} pts)` });
        emitScribbleState(rId);

        if (room.guessedUsers.size >= room.players.length - 1) {
          clearInterval(room.timerInterval);
          endScribbleRound(rId, "Everyone guessed the word!");
        }
      }
    } else {
      room.chatLog.push({ sender: currentUser.name, text: text.trim() });
      if (room.chatLog.length > 30) room.chatLog.shift();
      io.to('scribble_' + rId).emit('scribble_chat', { sender: currentUser.name, text: text.trim() });
    }
  });

  socket.on('scribble_reset', ({ roomId }) => {
    const rId = (roomId || 'SCRIBBLE-LOUNGE').trim().toUpperCase();
    const room = activeRooms.scribble.get(rId);
    if (!room) return;
    clearInterval(room.timerInterval);
    clearTimeout(room.botGuessTimeout);
    clearTimeout(room.botGuessTimeout2);
    room.status = 'lobby';
    room.round = 1;
    room.word = '';
    room.maskedWord = '';
    room.timeLeft = 60;
    room.strokes = [];
    room.guessedUsers = new Set();
    room.players.forEach(p => p.score = 0);
    room.chatLog.push({ system: true, text: 'Lounge reset to lobby.' });
    io.to('scribble_' + rId).emit('scribble_clear_canvas');
    emitScribbleState(rId);
  });

  function endScribbleRound(rId, reason) {
    const room = activeRooms.scribble.get(rId);
    if (!room) return;

    clearInterval(room.timerInterval);
    clearTimeout(room.botGuessTimeout);
    clearTimeout(room.botGuessTimeout2);

    room.status = 'reveal';
    room.chatLog.push({ system: true, text: `Round over! ${reason} The word was: ${room.word.toUpperCase()}` });
    emitScribbleState(rId);

    setTimeout(() => {
      // Find next human or advance
      let nextIdx = (room.artistIndex + 1) % room.players.length;
      const hasHuman = room.players.some(p => !p.isBot);
      if (hasHuman && room.players[nextIdx].isBot) {
        const humanIdx = room.players.findIndex(p => !p.isBot);
        if (humanIdx !== -1) nextIdx = humanIdx;
      }
      room.artistIndex = nextIdx;

      if (room.artistIndex === 0) room.round++;

      if (room.round > room.totalRounds) {
        room.status = 'game_over';
        emitScribbleState(rId);
      } else {
        startScribbleRound(rId);
      }
    }, 4000);
  }

  // ==========================================
  // MULTIPLAYER GAME 10: MAFIA (SOCIAL DEDUCTION)
  // ==========================================
  socket.on('mafia_join', ({ roomId }) => {
    if (!currentUser) return;
    const rId = (roomId || 'MAFIA-MANOR').trim().toUpperCase();
    socket.join('mafia_' + rId);

    let room = activeRooms.mafia.get(rId);
    if (!room) {
      room = {
        id: rId,
        players: [],
        phase: 'lobby',
        round: 1,
        timeLeft: 30,
        nightActions: { killTarget: null, protectTarget: null, inspectTarget: null },
        votes: {},
        winner: null,
        log: []
      };
      activeRooms.mafia.set(rId, room);
    }

    let p = room.players.find(x => x.id === currentUser.id);
    if (!p && room.phase === 'lobby') {
      room.players.push({
        id: currentUser.id,
        name: currentUser.name,
        studentId: currentUser.studentId,
        avatar: currentUser.avatar,
        role: 'villager',
        isAlive: true,
        socketId: socket.id
      });
      room.log.push(`${currentUser.name} entered the village.`);
    } else if (p) {
      p.socketId = socket.id;
    }

    emitMafiaState(rId);
  });

  function emitMafiaState(rId) {
    const room = activeRooms.mafia.get(rId);
    if (!room) return;

    const publicPlayers = room.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isAlive: p.isAlive,
      isBot: false,
      role: room.phase === 'ended' || !p.isAlive ? p.role : 'hidden'
    }));

    io.to('mafia_' + rId).emit('mafia_state', {
      id: room.id,
      players: publicPlayers,
      phase: room.phase,
      round: room.round,
      timeLeft: room.timeLeft,
      winner: room.winner,
      log: room.log,
      votes: room.votes
    });

    room.players.forEach(p => {
      if (p.socketId) {
        io.to(p.socketId).emit('mafia_my_role', { role: p.role, isAlive: p.isAlive });
      }
    });
  }

  socket.on('mafia_start', ({ roomId }) => {
    const rId = (roomId || 'MAFIA-MANOR').trim().toUpperCase();
    const room = activeRooms.mafia.get(rId);
    if (!room) return;

    if (room.players.length < 3) {
      socket.emit('mafia_error', 'Need at least 3 players to start Mafia! Invite classmates to join.');
      return;
    }

    const shuffled = [...room.players].sort(() => 0.5 - Math.random());
    shuffled.forEach(p => { p.role = 'villager'; p.isAlive = true; });

    shuffled[0].role = 'mafia';
    if (shuffled.length >= 3) shuffled[1].role = 'doctor';
    if (shuffled.length >= 4) shuffled[2].role = 'detective';
    if (shuffled.length >= 7) shuffled[3].role = 'mafia';

    room.phase = 'night';
    room.round = 1;
    room.winner = null;
    room.log = [`🌙 Night falls over the village. Close your eyes... Night creatures awake!`];
    startMafiaNight(rId);
  });

  socket.on('mafia_fast_forward', ({ roomId }) => {
    const rId = (roomId || 'MAFIA-MANOR').trim().toUpperCase();
    const room = activeRooms.mafia.get(rId);
    if (!room || room.phase === 'lobby' || room.phase === 'ended') return;

    if (room.phase === 'night') {
      clearInterval(room.timerInterval);
      resolveMafiaNight(rId);
    } else if (room.phase === 'day') {
      clearInterval(room.timerInterval);
      resolveMafiaDayVotes(rId);
    }
  });

  function startMafiaNight(rId) {
    const room = activeRooms.mafia.get(rId);
    if (!room) return;

    clearInterval(room.timerInterval);
    room.phase = 'night';
    room.timeLeft = 20;
    room.nightActions = { killTarget: null, protectTarget: null, inspectTarget: null };

    emitMafiaState(rId);

    room.timerInterval = setInterval(() => {
      room.timeLeft--;
      if (room.timeLeft <= 0) {
        clearInterval(room.timerInterval);
        resolveMafiaNight(rId);
      } else {
        io.to('mafia_' + rId).emit('mafia_tick', { timeLeft: room.timeLeft });
      }
    }, 1000);
  }

  socket.on('mafia_action', ({ roomId, type, targetId }) => {
    if (!currentUser) return;
    const rId = (roomId || 'MAFIA-MANOR').trim().toUpperCase();
    const room = activeRooms.mafia.get(rId);
    if (!room || room.phase !== 'night') return;

    const actor = room.players.find(p => p.id === currentUser.id && p.isAlive);
    if (!actor) return;

    if (type === 'kill' && actor.role === 'mafia') {
      room.nightActions.killTarget = targetId;
      socket.emit('mafia_action_ack', { type: 'kill', success: true });
    } else if (type === 'protect' && actor.role === 'doctor') {
      room.nightActions.protectTarget = targetId;
      socket.emit('mafia_action_ack', { type: 'protect', success: true });
    } else if (type === 'inspect' && actor.role === 'detective') {
      room.nightActions.inspectTarget = targetId;
      const targetPlayer = room.players.find(p => p.id === targetId);
      const isMafia = targetPlayer && targetPlayer.role === 'mafia';
      socket.emit('mafia_inspect_result', {
        targetName: targetPlayer ? targetPlayer.name : 'Unknown',
        isMafia
      });
    }
  });

  function resolveMafiaNight(rId) {
    const room = activeRooms.mafia.get(rId);
    if (!room) return;

    const killId = room.nightActions.killTarget;
    const saveId = room.nightActions.protectTarget;
    let victim = null;

    if (killId && killId !== saveId) {
      victim = room.players.find(p => p.id === killId);
      if (victim) victim.isAlive = false;
    }

    if (victim) {
      room.log.push(`☀️ Morning breaks. Tragically, ${victim.name} (${victim.avatar}) was eliminated during the night!`);
    } else {
      room.log.push(`☀️ Morning breaks. Miracle! Nobody died last night! The village doctor was on duty.`);
    }

    if (checkMafiaWinCondition(rId)) return;

    room.phase = 'day';
    room.timeLeft = 25;
    room.votes = {};
    emitMafiaState(rId);

    room.timerInterval = setInterval(() => {
      room.timeLeft--;
      if (room.timeLeft <= 0) {
        clearInterval(room.timerInterval);
        resolveMafiaDayVotes(rId);
      } else {
        io.to('mafia_' + rId).emit('mafia_tick', { timeLeft: room.timeLeft });
      }
    }, 1000);
  }

  socket.on('mafia_vote', ({ roomId, targetId }) => {
    if (!currentUser) return;
    const rId = (roomId || 'MAFIA-MANOR').trim().toUpperCase();
    const room = activeRooms.mafia.get(rId);
    if (!room || room.phase !== 'day') return;

    const voter = room.players.find(p => p.id === currentUser.id && p.isAlive);
    if (!voter) return;

    room.votes[voter.id] = targetId;
    emitMafiaState(rId);
  });

  function resolveMafiaDayVotes(rId) {
    const room = activeRooms.mafia.get(rId);
    if (!room) return;

    const voteCounts = {};
    Object.values(room.votes).forEach(tId => {
      if (tId) voteCounts[tId] = (voteCounts[tId] || 0) + 1;
    });

    let maxVotes = 0;
    let exiledId = null;
    for (const [tId, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count;
        exiledId = tId;
      }
    }

    if (exiledId && maxVotes > 0) {
      const exiledPlayer = room.players.find(p => p.id === exiledId);
      if (exiledPlayer) {
        exiledPlayer.isAlive = false;
        room.log.push(`⚖️ The village voted to exile ${exiledPlayer.name}! They were revealed to be: ${exiledPlayer.role.toUpperCase()}!`);
      }
    } else {
      room.log.push(`⚖️ The village could not reach a majority consensus. Nobody was exiled today.`);
    }

    if (checkMafiaWinCondition(rId)) return;

    room.round++;
    startMafiaNight(rId);
  }

  function checkMafiaWinCondition(rId) {
    const room = activeRooms.mafia.get(rId);
    if (!room) return false;

    const living = room.players.filter(p => p.isAlive);
    const livingMafia = living.filter(p => p.role === 'mafia');
    const livingVillagers = living.filter(p => p.role !== 'mafia');

    if (livingMafia.length === 0) {
      room.phase = 'ended';
      room.winner = 'villagers';
      room.log.push(`🏆 VILLAGERS WIN! All mafia members have been brought to justice!`);
      livingVillagers.forEach(v => awardXP(v.id, 50));
      emitMafiaState(rId);
      return true;
    } else if (livingMafia.length >= livingVillagers.length) {
      room.phase = 'ended';
      room.winner = 'mafia';
      room.log.push(`🩸 MAFIA WINS! The mafia has overtaken the village!`);
      livingMafia.forEach(m => awardXP(m.id, 75));
      emitMafiaState(rId);
      return true;
    }
    return false;
  }

  socket.on('mafia_reset', ({ roomId }) => {
    const rId = (roomId || 'MAFIA-MANOR').trim().toUpperCase();
    const room = activeRooms.mafia.get(rId);
    if (!room) return;

    clearInterval(room.timerInterval);
    room.phase = 'lobby';
    room.round = 1;
    room.winner = null;
    room.log = [`Lobby refreshed. Gather your classmates and start!`];
    room.players.forEach(p => { p.isAlive = true; p.role = 'villager'; });
    emitMafiaState(rId);
  });

  socket.on('disconnect', () => {
    if (currentUser) {
      onlineSockets.delete(socket.id);
      io.emit('online_users', getOnlineUsersList());

      // Remove from chess spectators
      let chessUpdated = false;
      for (const [rId, room] of activeRooms.chess.entries()) {
        const specIdx = room.spectators.findIndex(s => s.id === currentUser.id);
        if (specIdx !== -1) {
          room.spectators.splice(specIdx, 1);
          emitChessState(rId);
          chessUpdated = true;
        }
      }
      if (chessUpdated) broadcastChessRoomsList();
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
