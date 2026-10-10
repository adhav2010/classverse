# 🚀 ClassVerse — Private Class Social Hub & Multiplayer Game Lounge

A real-time web application built for classmates to log in with dedicated IDs, chat together, compete on leaderboards, post announcements, vote in polls, and play live multiplayer games.

---

## 🌟 Full Features Overview

### 1. 🟢 Prominent "Who is Online" Lounge & Live Activity Tracker *(NEW!)*
- **Top Header Status Button**: Always visible live glowing indicator showing exactly how many classmates are online.
- **Active Classmates Lounge Modal**:
  - View detailed cards of every active classmate.
  - Live activity badges: see whether a classmate is `💬 Chatting`, `🧠 In Quiz Battle`, `⚔️ Playing Tic-Tac-Toe`, `🔴 In Connect Four`, or `✊ In Rock-Paper-Scissors`.
  - Classmates' custom status quotes (e.g., *"Studying for Chemistry 🧪"* or *"Ready for a 1v1 duel! ⚔️"*).
  - Quick action: **Update your own status message** at any time.

### 2. ⚡ 1-on-1 Direct Game Challenge Invites *(NEW!)*
- Challenge any online classmate directly with a single click from the Online Lounge or sidebar.
- The challenged classmate receives an instant **animated popup alert** with sound effect:
  `⚔️ [Avatar] Alex Rivera (STD-01) has challenged you to Tic-Tac-Toe! [Accept] [Decline]`
- Accepting instantly teleports both players into a private game room to duel!

### 3. 📢 Class Notice Board & Live Interactive Polls *(NEW!)*
- **Class Notice Board**:
  - Post class announcements with categorized tags: `[📌 Notice]`, `[📚 Homework]`, `[🧪 Study]`, `[🎉 Event]`.
  - Author badge, student ID, and posting date.
  - Earn +15 XP for posting a notice!
- **Live Classroom Polls**:
  - Create polls for class decisions (e.g., homework deadlines, party plans, game choices).
  - Classmates vote in real-time with animated percentage progress bars!

### 4. 🎮 4 Live Multiplayer Games
1. **🧠 Live Classroom Quiz Show**:
   - Room-based multiplayer trivia battle where the whole class competes together.
   - 5 rounds with a 10-second countdown timer.
   - Speed bonus points for faster correct answers.
   - Real-time question feedback and final podium with confetti celebration!
2. **⚔️ Multiplayer Tic-Tac-Toe**:
   - 1-on-1 turn-based grid battle with room codes or quick matchmaking.
   - Real-time moves, win line highlight, and rematch button.
3. **🔴 Multiplayer Connect Four**:
   - 7×6 interactive board with piece gravity drops (Red vs Yellow).
   - Win detection across all horizontal, vertical, and diagonal directions.
4. **✊ Rock-Paper-Scissors Face-Off** *(NEW!)*:
   - Simultaneous secret lock-in of moves (Rock ✊, Paper ✋, Scissors ✌️).
   - Dynamic hands reveal stage, round scoreboard, and win animations.

### 5. 🔒 Secure Student Authentication & Profiles
- Classmates log in using pre-configured **Student IDs** and **Passwords** (hashed with `bcrypt`).
- Profile banner displays Name, Student ID badge, Level, XP, and status message.
- Emoji avatar picker with 16 avatars (`🦊`, `🐼`, `🚀`, `🦄`, `🦁`, `🤖`, etc.).

### 6. 💬 Real-Time Class Group Chat
- Powered by WebSockets (`Socket.IO`).
- Live typing indicators (*"Samira is typing..."*), message timestamps, and sound effects.
- Quick emoji reaction bar (`🔥`, `😂`, `❤️`, `👏`, `🚀`, `💯`).

### 7. 🏆 Class XP & Leaderboards
- Students earn XP by chatting, voting in polls, posting notices, and winning games.
- Real-time leaderboard with 🥇 🥈 🥉 medals and leveling up (`Lv. 1`, `Lv. 2`, etc.).

### 8. 🛠️ Class Admin Console *(Login as `ADMIN-01`)*
- Add new classmate accounts (Full Name, Student ID, Password).
- Reset passwords or delete student accounts.
- **Export & Print Login Cards**: Generates ready-to-print login cards to hand out to classmates!

---

## 🔑 Pre-Configured Test Accounts

| Student Name | Student Login ID | Password | Role |
| :--- | :--- | :--- | :--- |
| **Class Admin** | `ADMIN-01` | `admin123` | Admin |
| **Alex Rivera** | `STD-01` | `pass123` | Student |
| **Samira Khan** | `STD-02` | `pass123` | Student |
| **Liam Chen** | `STD-03` | `pass123` | Student |
| **Zoe Martinez** | `STD-04` | `pass123` | Student |
| **Aadhavan** | `STD-05` | `pass123` | Student |

---

## 🖥️ How to Run & Access

The server is currently running!

- **On your machine**: [http://localhost:3000](http://localhost:3000)
- **On other devices on your Wi-Fi (phones/tablets/laptops)**:
  `http://192.168.0.109:3000`

To restart the server anytime:
```bash
cd ~/Downloads/classverse
npm start
```
