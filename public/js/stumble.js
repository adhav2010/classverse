// Stumble Dash Royale — Physics & Multiplayer Game Engine for ClassVerse
(function() {
  const canvas = document.getElementById('stumble-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let currentRoomId = 'DASH-ARENA';
  let isRunning = false;
  let animId = null;

  // Track Dimensions
  const TRACK_WIDTH = 3400;
  const TRACK_HEIGHT = 440;
  const GROUND_TOP = 60;
  const GROUND_BOTTOM = 380;

  // Local Player State
  const player = {
    x: 80,
    y: 220,
    z: 0, // height above ground (jump)
    vz: 0,
    vx: 0,
    vy: 0,
    speed: 4.8,
    jumpPower: 8.5,
    isJumping: false,
    isDiving: false,
    isTumbling: false,
    tumbleTimer: 0,
    checkpointX: 80,
    finished: false,
    runAnim: 0,
    facing: 1
  };

  // Other Racers Map (userId -> racer)
  const remoteRacers = new Map();

  // Keys Input
  const keys = {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false
  };

  // Obstacles Layout
  const obstacles = {
    bumpers: [
      { x: 380, y: 150, radius: 36, color: '#ec4899', bounce: 12 },
      { x: 480, y: 300, radius: 36, color: '#ec4899', bounce: 12 },
      { x: 580, y: 200, radius: 42, color: '#f59e0b', bounce: 14 },
      { x: 700, y: 140, radius: 34, color: '#ec4899', bounce: 12 },
      { x: 740, y: 290, radius: 34, color: '#ec4899', bounce: 12 }
    ],
    spinners: [
      { x: 1050, y: 220, armLength: 110, angle: 0, speed: 0.04, color: '#3b82f6', thickness: 18 },
      { x: 1300, y: 220, armLength: 110, angle: Math.PI / 2, speed: -0.045, color: '#8b5cf6', thickness: 18 },
      { x: 1550, y: 220, armLength: 115, angle: 0, speed: 0.05, color: '#06b6d4', thickness: 18 }
    ],
    sweepers: [
      { x: 1850, y: 80, width: 22, height: 160, vy: 2.2, minY: 70, maxY: 230, color: '#ef4444' },
      { x: 2050, y: 210, width: 22, height: 160, vy: -2.5, minY: 70, maxY: 230, color: '#ef4444' }
    ],
    voidPits: [
      { x: 2280, y: 60, width: 220, height: 320, bridges: [{ y: 180, height: 80 }] }
    ],
    boostPads: [
      { x: 900, y: 190, width: 60, height: 60 },
      { x: 1720, y: 190, width: 60, height: 60 },
      { x: 2580, y: 190, width: 70, height: 60 }
    ],
    crown: {
      x: 3150,
      y: 220,
      radius: 40,
      collected: false
    }
  };

  // Particles Array for Dust & Confetti
  let particles = [];

  function addParticle(x, y, color, count = 6, speed = 3) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * speed,
        vy: (Math.random() - 0.5) * speed - 1,
        radius: Math.random() * 4 + 2,
        color,
        life: 25
      });
    }
  }

  // Camera scroll
  let cameraX = 0;

  // Window Resize
  function handleResize() {
    const parent = canvas.parentElement;
    if (parent) {
      canvas.width = Math.min(parent.clientWidth, 960);
      canvas.height = TRACK_HEIGHT;
    }
  }
  window.addEventListener('resize', handleResize);

  // Keyboard Listeners
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'KeyW'].includes(e.code)) keys.up = true;
    if (['ArrowDown', 'KeyS'].includes(e.code)) keys.down = true;
    if (['ArrowLeft', 'KeyA'].includes(e.code)) keys.left = true;
    if (['ArrowRight', 'KeyD'].includes(e.code)) keys.right = true;
    if (['Space'].includes(e.code)) {
      e.preventDefault();
      tryJump();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (['ArrowUp', 'KeyW'].includes(e.code)) keys.up = false;
    if (['ArrowDown', 'KeyS'].includes(e.code)) keys.down = false;
    if (['ArrowLeft', 'KeyA'].includes(e.code)) keys.left = false;
    if (['ArrowRight', 'KeyD'].includes(e.code)) keys.right = false;
  });

  function tryJump() {
    if (player.finished) return;
    if (!player.isJumping) {
      player.isJumping = true;
      player.vz = player.jumpPower;
      playSound('click');
      addParticle(player.x, player.y + 10, 'rgba(255,255,255,0.7)', 5);
    } else if (!player.isDiving && player.z > 8) {
      // Mid-air Belly Dive forward!
      player.isDiving = true;
      player.vx += player.facing * 5.5;
      player.vz = 2.5;
      playSound('click');
      addParticle(player.x, player.y, '#38bdf8', 8);
    }
  }

  // Mobile On-Screen Controls Handlers
  window.stumbleMove = function(dir, isDown) {
    if (dir === 'left') keys.left = isDown;
    if (dir === 'right') keys.right = isDown;
    if (dir === 'up') keys.up = isDown;
    if (dir === 'down') keys.down = isDown;
    if (dir === 'jump' && isDown) tryJump();
  };

  // Join Stumble Room
  window.joinStumbleRoom = function() {
    const input = document.getElementById('stumble-room-input');
    currentRoomId = (input.value.trim() || 'DASH-ARENA').toUpperCase();
    if (socket) {
      socket.emit('stumble_join', { roomId: currentRoomId });
    }
    resetLocalPlayer();
    startEngine();
  };

  window.restartStumbleRace = function() {
    if (socket) {
      socket.emit('stumble_restart', { roomId: currentRoomId });
    }
    resetLocalPlayer();
  };

  function resetLocalPlayer() {
    player.x = 80;
    player.y = 220;
    player.z = 0;
    player.vz = 0;
    player.vx = 0;
    player.vy = 0;
    player.isJumping = false;
    player.isDiving = false;
    player.isTumbling = false;
    player.finished = false;
    player.checkpointX = 80;
    obstacles.crown.collected = false;

    const winOverlay = document.getElementById('stumble-win-banner');
    if (winOverlay) winOverlay.classList.add('hidden');
  }

  // Physics & Game Loop
  let lastSyncTime = 0;

  function update() {
    // Spinners Rotation
    obstacles.spinners.forEach(s => {
      s.angle += s.speed;
    });

    // Sweepers Movement
    obstacles.sweepers.forEach(sw => {
      sw.y += sw.vy;
      if (sw.y <= sw.minY || sw.y >= sw.maxY) sw.vy *= -1;
    });

    // Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }

    if (player.finished) {
      // Idle victory hop
      player.runAnim += 0.05;
      return;
    }

    // Tumble State Recover
    if (player.isTumbling) {
      player.tumbleTimer--;
      player.x += player.vx;
      player.y += player.vy;
      player.vx *= 0.88;
      player.vy *= 0.88;
      if (player.tumbleTimer <= 0) {
        player.isTumbling = false;
      }
    } else {
      // Normal Controls
      let moveX = 0;
      let moveY = 0;
      if (keys.left) { moveX -= 1; player.facing = -1; }
      if (keys.right) { moveX += 1; player.facing = 1; }
      if (keys.up) moveY -= 1;
      if (keys.down) moveY += 1;

      if (moveX !== 0 && moveY !== 0) {
        moveX *= 0.7071;
        moveY *= 0.7071;
      }

      player.vx = moveX * player.speed;
      player.vy = moveY * player.speed * 0.8;

      player.x += player.vx;
      player.y += player.vy;

      if (moveX !== 0 || moveY !== 0) {
        player.runAnim += 0.25;
      }
    }

    // Jump Physics (Gravity)
    if (player.isJumping) {
      player.z += player.vz;
      player.vz -= 0.55; // Gravity
      if (player.z <= 0) {
        player.z = 0;
        player.vz = 0;
        player.isJumping = false;
        player.isDiving = false;
      }
    }

    // Track Boundaries
    player.y = Math.max(GROUND_TOP + 20, Math.min(GROUND_BOTTOM - 20, player.y));
    player.x = Math.max(40, player.x);

    // Checkpoints update
    if (player.x > 850 && player.checkpointX < 850) player.checkpointX = 850;
    if (player.x > 1650 && player.checkpointX < 1650) player.checkpointX = 1650;
    if (player.x > 2550 && player.checkpointX < 2550) player.checkpointX = 2550;

    // Obstacle 1: Bumpers Collision
    obstacles.bumpers.forEach(b => {
      const dx = player.x - b.x;
      const dy = player.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < b.radius + 18 && player.z < 25) {
        // Bounce player backward!
        const angle = Math.atan2(dy, dx);
        player.vx = Math.cos(angle) * b.bounce;
        player.vy = Math.sin(angle) * b.bounce;
        player.isTumbling = true;
        player.tumbleTimer = 18;
        playSound('wrong');
        addParticle(b.x, b.y, b.color, 12, 6);
      }
    });

    // Obstacle 2: Spinners Collision
    obstacles.spinners.forEach(s => {
      for (let arm = 0; arm < 2; arm++) {
        const armAngle = s.angle + arm * Math.PI;
        const tipX = s.x + Math.cos(armAngle) * s.armLength;
        const tipY = s.y + Math.sin(armAngle) * s.armLength;

        // Line-point distance check
        const d = distToSegment({ x: player.x, y: player.y }, { x: s.x, y: s.y }, { x: tipX, y: tipY });
        if (d < s.thickness + 12 && player.z < 22) {
          player.vx = Math.cos(armAngle + Math.PI / 2) * 12 - 4;
          player.vy = Math.sin(armAngle + Math.PI / 2) * 12;
          player.isTumbling = true;
          player.tumbleTimer = 22;
          playSound('wrong');
          addParticle(player.x, player.y, s.color, 10, 5);
        }
      }
    });

    // Obstacle 3: Moving Sweepers Collision
    obstacles.sweepers.forEach(sw => {
      if (
        player.x > sw.x - 18 && player.x < sw.x + sw.width + 18 &&
        player.y > sw.y - 15 && player.y < sw.y + sw.height + 15 &&
        player.z < 28
      ) {
        player.vx = -10;
        player.isTumbling = true;
        player.tumbleTimer = 20;
        playSound('wrong');
        addParticle(player.x, player.y, sw.color, 10);
      }
    });

    // Obstacle 4: Disappearing Void Pit Collision
    obstacles.voidPits.forEach(pit => {
      if (player.x > pit.x && player.x < pit.x + pit.width && player.z <= 0) {
        // Check if on safe bridge
        const onBridge = pit.bridges.some(b => player.y >= b.y && player.y <= b.y + b.height);
        if (!onBridge) {
          // Fell into the void! Respawn at last checkpoint
          playSound('wrong');
          addParticle(player.x, player.y, '#f43f5e', 20, 8);
          player.x = player.checkpointX;
          player.y = 220;
          player.vx = 0;
          player.vy = 0;
          player.isTumbling = false;
        }
      }
    });

    // Obstacle 5: Speed Boost Pads
    obstacles.boostPads.forEach(pad => {
      if (
        player.x > pad.x && player.x < pad.x + pad.width &&
        player.y > pad.y && player.y < pad.y + pad.height
      ) {
        player.vx = 12;
        player.x += 8;
        addParticle(player.x, player.y, '#eab308', 3, 4);
      }
    });

    // Obstacle 6: Golden Crown Finish Line!
    const crownDist = Math.hypot(player.x - obstacles.crown.x, player.y - obstacles.crown.y);
    if (crownDist < obstacles.crown.radius + 20 && !player.finished) {
      player.finished = true;
      playSound('win');
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 } });
      if (socket) {
        socket.emit('stumble_finish', { roomId: currentRoomId });
      }
    }

    // Emit Realtime Coordinates via Socket at 30 FPS
    const now = Date.now();
    if (now - lastSyncTime > 33 && socket) {
      lastSyncTime = now;
      socket.emit('stumble_move', {
        roomId: currentRoomId,
        x: Math.round(player.x),
        y: Math.round(player.y),
        vx: Number(player.vx.toFixed(1)),
        vy: Number(player.vy.toFixed(1)),
        isJumping: player.isJumping
      });
    }

    // Camera smoothly tracks player
    cameraX += (player.x - canvas.width * 0.35 - cameraX) * 0.1;
    cameraX = Math.max(0, Math.min(TRACK_WIDTH - canvas.width, cameraX));
  }

  // Geometry helper: distance from point P to line segment VW
  function distToSegment(p, v, w) {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  }

  // Draw Scene
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-cameraX, 0);

    // 1. Draw Race Track Floor & Void Background
    drawTrackEnvironment();

    // 2. Draw Obstacles (Pits, Boosts, Spinners, Bumpers)
    drawObstacles();

    // 3. Draw Checkpoint Lines & Finish Line
    drawCheckpoints();

    // 4. Draw Particles
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life / 25;
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // 5. Draw Remote Classmate Racers
    remoteRacers.forEach(r => {
      if (r.id !== currentUser.id) {
        drawBeanCharacter(r.x, r.y, r.isJumping ? 14 : 0, r.avatar, r.name, r.studentId, r.color, false, 0);
      }
    });

    // 6. Draw Local Player Bean Character
    const myColor = currentUser && currentUser.role === 'admin' ? '#a855f7' : '#6366f1';
    drawBeanCharacter(
      player.x,
      player.y,
      player.z,
      currentUser ? currentUser.avatar : '🦊',
      currentUser ? currentUser.name : 'You',
      currentUser ? currentUser.studentId : 'STD-01',
      myColor,
      true,
      player.runAnim
    );

    ctx.restore();

    // 7. Draw HUD (Progress Mini-bar & Distance)
    drawHUD();
  }

  function drawTrackEnvironment() {
    // Void / Abyss Background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, TRACK_WIDTH, TRACK_HEIGHT);

    // Floating Neon Track Corridor
    const trackGrad = ctx.createLinearGradient(0, GROUND_TOP, 0, GROUND_BOTTOM);
    trackGrad.addColorStop(0, '#1e293b');
    trackGrad.addColorStop(0.5, '#0f172a');
    trackGrad.addColorStop(1, '#1e293b');

    ctx.fillStyle = trackGrad;
    ctx.fillRect(0, GROUND_TOP, TRACK_WIDTH, GROUND_BOTTOM - GROUND_TOP);

    // Neon Track Borders
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#0284c7';
    ctx.shadowBlur = 15;

    ctx.beginPath();
    ctx.moveTo(0, GROUND_TOP);
    ctx.lineTo(TRACK_WIDTH, GROUND_TOP);
    ctx.moveTo(0, GROUND_BOTTOM);
    ctx.lineTo(TRACK_WIDTH, GROUND_BOTTOM);
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Grid Floor Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < TRACK_WIDTH; x += 100) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_TOP);
      ctx.lineTo(x, GROUND_BOTTOM);
      ctx.stroke();
    }
  }

  function drawObstacles() {
    // Boost Pads
    obstacles.boostPads.forEach(pad => {
      ctx.fillStyle = 'rgba(234, 179, 8, 0.2)';
      ctx.fillRect(pad.x, pad.y, pad.width, pad.height);
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.strokeRect(pad.x, pad.y, pad.width, pad.height);

      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 22px Outfit';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ ➔', pad.x + pad.width / 2, pad.y + pad.height / 2 + 7);
    });

    // Void Pits with Safe Bridges
    obstacles.voidPits.forEach(pit => {
      // The abyss hole
      ctx.fillStyle = '#030712';
      ctx.fillRect(pit.x, pit.y, pit.width, pit.height);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.strokeRect(pit.x, pit.y, pit.width, pit.height);

      // Pit warning stripes
      ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
      ctx.font = 'bold 16px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText('⚠️ THE VOID ⚠️', pit.x + pit.width / 2, pit.y + 60);
      ctx.fillText('⚠️ DANGER ⚠️', pit.x + pit.width / 2, pit.y + 260);

      // Safe Bridge
      pit.bridges.forEach(b => {
        ctx.fillStyle = '#334155';
        ctx.fillRect(pit.x, b.y, pit.width, b.height);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.strokeRect(pit.x, b.y, pit.width, b.height);
      });
    });

    // Bumpers
    obstacles.bumpers.forEach(b => {
      // Shadow
      ctx.beginPath();
      ctx.arc(b.x + 3, b.y + 4, b.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fill();

      // Body 3D Bumper
      const bGrad = ctx.createRadialGradient(b.x - 8, b.y - 8, 4, b.x, b.y, b.radius);
      bGrad.addColorStop(0, '#fbcfe8');
      bGrad.addColorStop(0.5, b.color);
      bGrad.addColorStop(1, '#831843');

      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fillStyle = bGrad;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Inner icon
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px Outfit';
      ctx.textAlign = 'center';
      ctx.fillText('💥', b.x, b.y + 6);
    });

    // Spinners (Rotating Windmills)
    obstacles.spinners.forEach(s => {
      // Center Hub
      ctx.beginPath();
      ctx.arc(s.x, s.y, 22, 0, Math.PI * 2);
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 3;
      ctx.fill();
      ctx.stroke();

      // Dual Arms
      for (let arm = 0; arm < 2; arm++) {
        const armAngle = s.angle + arm * Math.PI;
        const tipX = s.x + Math.cos(armAngle) * s.armLength;
        const tipY = s.y + Math.sin(armAngle) * s.armLength;

        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.thickness;
        ctx.lineCap = 'round';
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 20;

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();

        ctx.shadowBlur = 0;
      }
    });

    // Sweepers
    obstacles.sweepers.forEach(sw => {
      ctx.fillStyle = sw.color;
      ctx.shadowColor = sw.color;
      ctx.shadowBlur = 12;
      ctx.fillRect(sw.x, sw.y, sw.width, sw.height);
      ctx.shadowBlur = 0;
    });

    // The Golden Crown
    const crown = obstacles.crown;
    const cHover = Math.sin(Date.now() * 0.004) * 8;
    ctx.font = '50px Outfit';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#eab308';
    ctx.shadowBlur = 30;
    ctx.fillText('👑', crown.x, crown.y + cHover + 15);
    ctx.shadowBlur = 0;
  }

  function drawCheckpoints() {
    [850, 1650, 2550].forEach((cx, idx) => {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(cx, GROUND_TOP);
      ctx.lineTo(cx, GROUND_BOTTOM);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText(`FLAG #${idx + 1}`, cx, GROUND_TOP - 8);
    });

    // Finish Line Banner (Checkerboard)
    const fx = 3050;
    const size = 18;
    for (let y = GROUND_TOP; y < GROUND_BOTTOM; y += size) {
      for (let c = 0; c < 3; c++) {
        const isBlack = (Math.floor(y / size) + c) % 2 === 0;
        ctx.fillStyle = isBlack ? '#000000' : '#ffffff';
        ctx.fillRect(fx + c * size, y, size, size);
      }
    }

    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 18px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText('🏁 FINISH LINE 🏁', fx + 27, GROUND_TOP - 12);
  }

  // Draw 3D Bouncy Jellybean Character
  function drawBeanCharacter(x, y, z, avatar, name, studentId, color, isSelf, runCycle) {
    const drawY = y - z;

    // 1. Ground Drop Shadow
    const shadowScale = Math.max(0.4, 1 - z / 60);
    ctx.beginPath();
    ctx.ellipse(x, y + 16, 16 * shadowScale, 6 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fill();

    // 2. Animated Running Legs
    const legOffset = isSelf ? Math.sin(runCycle) * 6 : 0;
    ctx.fillStyle = '#0f172a';
    // Left foot
    ctx.beginPath();
    ctx.ellipse(x - 6, drawY + 14 + legOffset, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Right foot
    ctx.beginPath();
    ctx.ellipse(x + 6, drawY + 14 - legOffset, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // 3. 3D Glossy Bean Body
    const beanGrad = ctx.createRadialGradient(x - 5, drawY - 8, 4, x, drawY, 20);
    beanGrad.addColorStop(0, '#ffffff');
    beanGrad.addColorStop(0.3, color);
    beanGrad.addColorStop(1, '#090d16');

    ctx.beginPath();
    ctx.ellipse(x, drawY, 18, 22, 0, 0, Math.PI * 2);
    ctx.fillStyle = beanGrad;
    if (isSelf) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
    }
    ctx.fill();
    ctx.shadowBlur = 0;

    // White Visor / Faceplate (like Fall Guys / Stumble Guys)
    ctx.beginPath();
    ctx.ellipse(x + (isSelf ? player.facing * 3 : 0), drawY - 3, 11, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(x - 4 + (isSelf ? player.facing * 3 : 0), drawY - 3, 2, 0, Math.PI * 2);
    ctx.arc(x + 4 + (isSelf ? player.facing * 3 : 0), drawY - 3, 2, 0, Math.PI * 2);
    ctx.fill();

    // 4. Avatar on top of head
    ctx.font = '18px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText(avatar || '🎓', x, drawY - 26);

    // 5. Nametag & Student ID
    ctx.font = 'bold 11px Plus Jakarta Sans';
    ctx.fillStyle = isSelf ? '#38bdf8' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText(name, x, drawY - 44);
    ctx.font = '9px JetBrains Mono';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(studentId, x, drawY - 34);
    ctx.shadowBlur = 0;
  }

  // Draw HUD Overlay
  function drawHUD() {
    // Race Progress Bar at Top
    const barWidth = 240;
    const barHeight = 8;
    const barX = (canvas.width - barWidth) / 2;
    const barY = 16;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    const progress = Math.min(1, Math.max(0, player.x / 3150));
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(barX, barY, barWidth * progress, barHeight);

    // Icon on progress bar
    ctx.font = '14px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText('🏃', barX + barWidth * progress, barY + 7);
    ctx.fillText('👑', barX + barWidth + 12, barY + 8);
  }

  // Animation Loop
  function gameLoop() {
    if (!isRunning) return;
    update();
    render();
    animId = requestAnimationFrame(gameLoop);
  }

  function startEngine() {
    handleResize();
    if (!isRunning) {
      isRunning = true;
      animId = requestAnimationFrame(gameLoop);
    }
  }

  // Socket.IO Listeners for Stumble Dash
  if (typeof socket !== 'undefined' && socket) {
    attachSocketEvents();
  } else {
    const checkSocketInterval = setInterval(() => {
      if (typeof socket !== 'undefined' && socket) {
        clearInterval(checkSocketInterval);
        attachSocketEvents();
      }
    }, 200);
  }

  function attachSocketEvents() {
    socket.on('stumble_racers', ({ status, winner, racers }) => {
      remoteRacers.clear();
      racers.forEach(r => remoteRacers.set(r.id, r));

      // Update racer list UI in sidebar
      const listEl = document.getElementById('stumble-racers-list');
      if (listEl) {
        listEl.innerHTML = '';
        racers.sort((a, b) => b.x - a.x);
        racers.forEach((r, idx) => {
          const item = document.createElement('div');
          item.className = 'flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold';
          item.innerHTML = `
            <div class="flex items-center gap-2">
              <span class="text-slate-400 font-mono">#${idx + 1}</span>
              <span>${r.avatar || '🏃'}</span>
              <span class="text-white">${r.name}</span>
            </div>
            <span class="text-xs font-mono text-cyan-400">${Math.round(r.x / 31.5)}%</span>
          `;
          listEl.appendChild(item);
        });
      }

      if (winner) {
        const winBanner = document.getElementById('stumble-win-banner');
        if (winBanner) {
          winBanner.classList.remove('hidden');
          document.getElementById('stumble-winner-text').textContent = `👑 ${winner.name} won the Crown! (+75 XP)`;
        }
      }
    });

    socket.on('stumble_racer_update', ({ id, x, y, vx, vy, isJumping }) => {
      const racer = remoteRacers.get(id);
      if (racer) {
        racer.x = x;
        racer.y = y;
        racer.vx = vx;
        racer.vy = vy;
        racer.isJumping = isJumping;
      }
    });

    socket.on('stumble_reset_stage', () => {
      resetLocalPlayer();
    });
  }

  // Initial setup
  handleResize();
})();
