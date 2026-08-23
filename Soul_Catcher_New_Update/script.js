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

for (let key in sources) {
  rawImages[key] = new Image();
  rawImages[key].src = sources[key];
  rawImages[key].onload = () => {
    if (key !== 'bg') {
      images[key] = removeWhiteBackground(rawImages[key]);
    } else {
      images[key] = rawImages[key];
    }
    loadedCount++;
    if (loadedCount === 5) {
      resize();
      resetGame();
    }
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

const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') attack();
  if (e.code === 'KeyP') togglePause();
  if (e.code === 'Enter' && (gameOver || gameWin)) resetGame();
});
window.addEventListener('keyup', e => keys[e.code] = false);

const touchState = { up: false, down: false, left: false, right: false };

function bindTouch(id, prop) {
  const btn = document.getElementById(id);
  if (!btn) return;
  
  const startHandler = (e) => {
    e.preventDefault();
    touchState[prop] = true;
    btn.classList.add('active-press');
  };
  const endHandler = (e) => {
    e.preventDefault();
    touchState[prop] = false;
    btn.classList.remove('active-press');
  };

  btn.addEventListener('pointerdown', startHandler);
  btn.addEventListener('pointerup', endHandler);
  btn.addEventListener('pointercancel', endHandler);
}

bindTouch('btnUp', 'up'); bindTouch('btnDown', 'down');
bindTouch('btnLeft', 'left'); bindTouch('btnRight', 'right');

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
  if (keys['KeyW'] || keys['ArrowUp'] || touchState.up) moveY -= 1;
  if (keys['KeyS'] || keys['ArrowDown'] || touchState.down) moveY += 1;
  if (keys['KeyA'] || keys['ArrowLeft'] || touchState.left) moveX -= 1;
  if (keys['KeyD'] || keys['ArrowRight'] || touchState.right) moveX += 1;

  player.isMoving = (moveX !== 0 || moveY !== 0);

  if (player.isMoving) {
    const len = Math.hypot(moveX, moveY);
    player.x += (moveX / len) * player.speed;
    player.y += (moveY / len) * player.speed;
    if (moveX !== 0) player.facing = moveX > 0 ? 'right' : 'left';

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