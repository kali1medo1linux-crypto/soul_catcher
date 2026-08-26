const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let width, height;

function resize() {
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
  ctx.imageSmoothingEnabled = false;
  
  if (player.x > width) player.x = width / 2;
  if (player.y > height) player.y = height / 2;
}

function getBaseVision() {
  const minDimension = Math.min(width, height);
  return Math.max(160, minDimension * 0.28);
}

window.addEventListener('resize', resize);

function removeWhiteBackground(img) {
  const c = document.createElement('canvas');
  const cx = c.getContext('2d');
  c.width = img.width;
  c.height = img.height;
  cx.drawImage(img, 0, 0);
  
  const imgData = cx.getImageData(0, 0, c.width, c.height);
  const data = imgData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 220 && data[i+1] > 220 && data[i+2] > 220) {
      data[i+3] = 0;
    }
  }
  cx.putImageData(imgData, 0, 0);
  const newImg = new Image();
  newImg.src = c.toDataURL();
  return newImg;
}

const rawImages = {};
const images = {};
let loadedCount = 0;
const sources = {
  hero: 'images/hero.png',
  ghosts: 'images/ghosts.png',
  souls: 'images/souls.png',
  bg: 'images/bg.png',
  props: 'images/props.png'
};

const totalImages = Object.keys(sources).length;
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const loadingScreen = document.getElementById('loadingScreen');

function updateProgress() {
  loadedCount++;
  const percent = Math.floor((loadedCount / totalImages) * 100);
  if (progressBar) progressBar.style.width = percent + '%';
  if (progressText) progressText.innerText = percent + '%';

  if (loadedCount === totalImages) {
    if (loadingScreen) loadingScreen.classList.add('hidden');
    resize();
    resetGame();
  }
}

for (let key in sources) {
  rawImages[key] = new Image();
  rawImages[key].src = sources[key];
  rawImages[key].onload = () => {
    if (key !== 'bg') {
      images[key] = removeWhiteBackground(rawImages[key]);
    } else {
      images[key] = rawImages[key];
    }
    updateProgress();
  };
  rawImages[key].onerror = () => {
    updateProgress();
  };
}

let score = 0;
let gameOver = false;
let gameWin = false;
let isPaused = false;
let animRequestId = null;
let swordCooldown = 100;
const SWORD_COST = 100;
const WIN_SCORE = 30;
let visionRadius = 200;

const player = {
  x: 0, y: 0, speed: 4.5,
  facing: 'right', isMoving: false,
  isAttacking: false, attackProgress: 0,
  animFrame: 0, animTimer: 0
};

// 1. الكيبورد للكمبيوتر
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') attack();
  if (e.code === 'KeyP') togglePause();
  if (e.code === 'Enter' && (gameOver || gameWin)) resetGame();
});
window.addEventListener('keyup', e => keys[e.code] = false);

// 2. الانالوج الديناميكي (يشتغل من أي مكان في الشاشة)
const touchState = { moveX: 0, moveY: 0, active: false };
let joystickCenter = { x: 0, y: 0 };
let joystickCurrent = { x: 0, y: 0 };
let touchId = null;

const joystickElement = document.createElement('div');
joystickElement.style.position = 'fixed';
joystickElement.style.width = '90px';
joystickElement.style.height = '90px';
joystickElement.style.borderRadius = '50%';
joystickElement.style.border = '2px solid rgba(0, 210, 255, 0.6)';
joystickElement.style.background = 'rgba(0, 0, 0, 0.4)';
joystickElement.style.transform = 'translate(-50%, -50%)';
joystickElement.style.pointerEvents = 'none';
joystickElement.style.display = 'none';
joystickElement.style.zIndex = '999';
document.body.appendChild(joystickElement);

const thumbElement = document.createElement('div');
thumbElement.style.position = 'absolute';
thumbElement.style.width = '45px';
thumbElement.style.height = '45px';
thumbElement.style.borderRadius = '50%';
thumbElement.style.background = 'rgba(0, 210, 255, 0.8)';
thumbElement.style.boxShadow = '0 0 10px #00d2ff';
thumbElement.style.top = '22.5px';
thumbElement.style.left = '22.5px';
joystickElement.appendChild(thumbElement);

window.addEventListener('pointerdown', (e) => {
  // التجاهل لو الضغط على زرار أو واجهة شاشة
  if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.closest('.overlay')) return;
  
  // يظهر الانالوج في مكان الضغطة فوراً (من أي مكان في الشاشة)
  if (!touchState.active) {
    touchState.active = true;
    touchId = e.pointerId;
    joystickCenter = { x: e.clientX, y: e.clientY };
    joystickCurrent = { x: e.clientX, y: e.clientY };
    
    joystickElement.style.display = 'block';
    joystickElement.style.left = e.clientX + 'px';
    joystickElement.style.top = e.clientY + 'px';
    thumbElement.style.transform = `translate(0px, 0px)`;
  }
});

window.addEventListener('pointermove', (e) => {
  if (!touchState.active || e.pointerId !== touchId) return;
  
  joystickCurrent = { x: e.clientX, y: e.clientY };
  
  let dx = joystickCurrent.x - joystickCenter.x;
  let dy = joystickCurrent.y - joystickCenter.y;
  let dist = Math.hypot(dx, dy);
  let maxRadius = 45;
  
  if (dist > maxRadius) {
    dx = (dx / dist) * maxRadius;
    dy = (dy / dist) * maxRadius;
  }
  
  thumbElement.style.transform = `translate(${dx}px, ${dy}px)`;
  touchState.moveX = dx / maxRadius;
  touchState.moveY = dy / maxRadius;
});

const endTouch = (e) => {
  if (e.pointerId === touchId) {
    touchState.active = false;
    touchState.moveX = 0;
    touchState.moveY = 0;
    touchId = null;
    joystickElement.style.display = 'none';
  }
};

window.addEventListener('pointerup', endTouch);
window.addEventListener('pointercancel', endTouch);

const btnAttack = document.getElementById('btnAttack');
if (btnAttack) {
  btnAttack.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btnAttack.classList.add('active-press');
    attack();
  });
  btnAttack.addEventListener('pointerup', () => btnAttack.classList.remove('active-press'));
  btnAttack.addEventListener('pointercancel', () => btnAttack.classList.remove('active-press'));
}

const btnPause = document.getElementById('btnPause');
if (btnPause) {
  btnPause.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    btnPause.classList.add('active-press');
    togglePause();
  });
  btnPause.addEventListener('pointerup', () => btnPause.classList.remove('active-press'));
  btnPause.addEventListener('pointercancel', () => btnPause.classList.remove('active-press'));
}

const btnRestart = document.getElementById('btnRestart');
if (btnRestart) btnRestart.addEventListener('click', resetGame);

const btnWinRestart = document.getElementById('btnWinRestart');
if (btnWinRestart) btnWinRestart.addEventListener('click', resetGame);

const btnResume = document.getElementById('btnResume');
if (btnResume) btnResume.addEventListener('click', togglePause);

function togglePause() {
  if (gameOver || gameWin) return;
  
  isPaused = !isPaused;
  const pauseScreen = document.getElementById('pauseScreen');
  
  if (pauseScreen) {
    if (isPaused) {
      pauseScreen.classList.remove('hidden');
      if (animRequestId) cancelAnimationFrame(animRequestId);
    } else {
      pauseScreen.classList.add('hidden');
      loop();
    }
  }
}

const souls = [];
const ghosts = [];

function spawnSoul() {
  if (souls.length < 4) {
    souls.push({
      x: 80 + Math.random() * (width - 160),
      y: 80 + Math.random() * (height - 160),
      frame: 0, timer: 0
    });
  }
}

function spawnGhost() {
  let x = Math.random() < 0.5 ? -80 : width + 80;
  let y = Math.random() * height;
  ghosts.push({ x, y, speed: 1.2 + Math.random() * 0.4, frame: 0, timer: 0 });
}

function attack() {
  if (swordCooldown >= SWORD_COST && !player.isAttacking && !gameOver && !gameWin && !isPaused) {
    swordCooldown = 0;
    player.isAttacking = true;
    player.attackProgress = 0;
  }
}

function resetGame() {
  if (animRequestId) cancelAnimationFrame(animRequestId);
  score = 0;
  swordCooldown = 100;
  gameOver = false;
  gameWin = false;
  isPaused = false;
  player.x = width / 2;
  player.y = height / 2;
  player.isAttacking = false;
  souls.length = 0;
  ghosts.length = 0;

  document.getElementById('gameOverScreen')?.classList.add('hidden');
  document.getElementById('winScreen')?.classList.add('hidden');
  document.getElementById('pauseScreen')?.classList.add('hidden');

  const scoreVal = document.getElementById('scoreVal');
  if (scoreVal) scoreVal.innerText = score;

  for (let i = 0; i < 3; i++) spawnSoul();
  for (let i = 0; i < 2; i++) spawnGhost();

  loop();
}

function update() {
  if (gameOver || gameWin || isPaused) return;

  let moveX = 0, moveY = 0;
  
  if (keys['KeyW'] || keys['ArrowUp']) moveY -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) moveY += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) moveX -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) moveX += 1;

  if (touchState.active) {
    moveX = touchState.moveX;
    moveY = touchState.moveY;
  }

  player.isMoving = (Math.abs(moveX) > 0.1 || Math.abs(moveY) > 0.1);

  if (player.isMoving) {
    let len = Math.hypot(moveX, moveY);
    if (len > 1) { moveX /= len; moveY /= len; }

    player.x += moveX * player.speed;
    player.y += moveY * player.speed;
    
    if (Math.abs(moveX) > 0.1) player.facing = moveX > 0 ? 'right' : 'left';

    player.x = Math.max(40, Math.min(width - 40, player.x));
    player.y = Math.max(40, Math.min(height - 40, player.y));

    player.animTimer++;
    if (player.animTimer % 6 === 0) {
      player.animFrame = (player.animFrame + 1) % 6;
    }
  } else {
    player.animTimer++;
    if (player.animTimer % 10 === 0) {
      player.animFrame = (player.animFrame + 1) % 3;
    }
  }

  visionRadius = getBaseVision() + (score * (Math.min(width, height) * 0.008));

  if (swordCooldown < 100) swordCooldown = Math.min(100, swordCooldown + 1.5);
  const cooldownBar = document.getElementById('cooldownBar');
  if (cooldownBar) cooldownBar.style.width = `${swordCooldown}%`;

  if (player.isAttacking) {
    player.attackProgress += 0.06;
    for (let i = ghosts.length - 1; i >= 0; i--) {
      if (Math.hypot(ghosts[i].x - player.x, ghosts[i].y - player.y) < visionRadius * 0.5) {
        ghosts.splice(i, 1);
        spawnGhost();
      }
    }
    if (player.attackProgress >= 1) {
      player.isAttacking = false;
      player.attackProgress = 0;
    }
  }

  souls.forEach((soul, index) => {
    soul.timer++;
    if (soul.timer % 8 === 0) soul.frame = (soul.frame + 1) % 6;
    if (Math.hypot(player.x - soul.x, player.y - soul.y) < 45) {
      souls.splice(index, 1);
      score++;
      const scoreVal = document.getElementById('scoreVal');
      if (scoreVal) scoreVal.innerText = score;

      if (score >= WIN_SCORE) {
        gameWin = true;
        document.getElementById('winScreen')?.classList.remove('hidden');
      } else {
        spawnSoul();
        if (score % 3 === 0 && ghosts.length < 6) spawnGhost();
      }
    }
  });

  ghosts.forEach(ghost => {
    ghost.timer++;
    if (ghost.timer % 8 === 0) ghost.frame = (ghost.frame + 1) % 7;

    const angle = Math.atan2(player.y - ghost.y, player.x - ghost.x);
    ghost.x += Math.cos(angle) * ghost.speed;
    ghost.y += Math.sin(angle) * ghost.speed;

    if (Math.hypot(player.x - ghost.x, player.y - ghost.y) < 35) {
      gameOver = true;
      const finalScore = document.getElementById('finalScore');
      if (finalScore) finalScore.innerText = score;
      document.getElementById('gameOverScreen')?.classList.remove('hidden');
    }
  });
}

function draw() {
  ctx.clearRect(0, 0, width, height);

  if (images.bg && images.bg.complete) {
    ctx.drawImage(images.bg, 0, 0, width, height);
  }

  souls.forEach(s => {
    if (images.souls && images.souls.complete) {
      const sw = images.souls.width / 6;
      const sh = images.souls.height / 4;
      ctx.drawImage(images.souls, s.frame * sw, 0, sw, sh, s.x - 25, s.y - 25, 50, 50);
    }
  });

  ghosts.forEach(g => {
    if (images.ghosts && images.ghosts.complete) {
      const sw = images.ghosts.width / 7;
      const sh = images.ghosts.height / 6;
      ctx.drawImage(images.ghosts, g.frame * sw, 0, sw, sh, g.x - 45, g.y - 45, 90, 90);
    }
  });

  ctx.save();
  ctx.translate(player.x, player.y);
  if (player.facing === 'left') ctx.scale(-1, 1);

  if (images.hero && images.hero.complete) {
    const imgW = images.hero.width;
    const imgH = images.hero.height;

    let sx, sy, sw, sh;
    let renderW = 110, renderH = 110;

    if (player.isAttacking) {
      const attackFrames = [
        { x: 0.10, w: 0.18 },
        { x: 0.27, w: 0.18 },
        { x: 0.45, w: 0.22 },
        { x: 0.65, w: 0.18 },
        { x: 0.82, w: 0.18 }
      ];
      const frameIdx = Math.min(4, Math.floor(player.attackProgress * 5));
      const frame = attackFrames[frameIdx];

      sx = imgW * frame.x;
      sy = imgH * 0.42;
      sw = imgW * frame.w;
      sh = imgH * 0.18;
      renderW = 140;
    } else if (player.isMoving) {
      const walkFramesX = [0.24, 0.36, 0.48, 0.60, 0.72, 0.84];
      sx = imgW * walkFramesX[player.animFrame % 6];
      sy = imgH * 0.04;
      sw = imgW * 0.11;
      sh = imgH * 0.18;
    } else {
      const idleFramesX = [0.24, 0.36, 0.48];
      sx = imgW * idleFramesX[player.animFrame % 3];
      sy = imgH * 0.24;
      sw = imgW * 0.11;
      sh = imgH * 0.18;
    }

    ctx.drawImage(
      images.hero,
      sx, sy, sw, sh,
      -renderW / 2, -renderH / 2, renderW, renderH
    );
  }
  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.93)';
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.arc(player.x, player.y, visionRadius, 0, Math.PI * 2, true);
  ctx.fill();

  const gradient = ctx.createRadialGradient(
    player.x, player.y, visionRadius * 0.4,
    player.x, player.y, visionRadius
  );
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.93)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(player.x, player.y, visionRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function loop() {
  update();
  draw();
  if (!gameOver && !gameWin && !isPaused) {
    animRequestId = requestAnimationFrame(loop);
  }
}