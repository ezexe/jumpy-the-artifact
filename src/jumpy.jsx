import { useState, useEffect, useRef, useCallback } from 'react';

// ============== CONSTANTS ==============
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 700;
const GRAVITY = 0.4;
const JUMP_FORCE = -14;
const MOVE_SPEED = 6;

// Power-up specific constants
const ROCKET_SPEED = -20;
const PROPELLER_SPEED = -8;
const CAPE_GRAVITY = 0.08;
const CAPE_MAX_FALL_SPEED = 2;
const SPRING_SHOES_JUMP_MULTIPLIER = 1.6;
const MAGNET_RANGE = 150;
const MAGNET_PULL_SPEED = 8;
const SUMO_BOUNCE_FORCE = -18;
const INVINCIBILITY_DURATION = 90; // 1.5 seconds at 60fps

const GEM_VALUES = { blue: 10, orange: 25, purple: 50 };

const PLATFORM_COLORS = [
  { top: '#ff6b9d', bottom: '#ff4081' },
  { top: '#9cff6b', bottom: '#69f0ae' },
  { top: '#6bffff', bottom: '#40c4ff' },
  { top: '#ffeb3b', bottom: '#ffc107' },
  { top: '#ff9800', bottom: '#ff5722' },
  { top: '#e040fb', bottom: '#aa00ff' }
];

const GEM_COLORS = {
  blue: { main: '#00FFFF', glow: '#40C4FF' },
  orange: { main: '#FF6B00', glow: '#FF9800' },
  purple: { main: '#9C27B0', glow: '#E040FB' }
};

// Power-up configurations - PERSISTENT vs TIMED
// Persistent: no timer, lost via enemy hit, replacement, or fall-rescue
// Timed: duration-based, expires automatically
const POWER_CONFIG = {
  rocket:     { duration: 90, persistent: false },
  cape:       { persistent: true },  // Gliding, lost on hit/replacement/fall-rescue
  spring:     { instant: true },      // Immediate jump boost
  shield:     { persistent: true, maxHits: 2 }, // Absorbs 2 hits
  propeller:  { duration: 150, persistent: false },
  springShoes:{ jumps: 5, persistent: false },
  magnet:     { duration: 360, persistent: false },
  sumo:       { duration: 150, persistent: false }, // Bounce-kills enemies
  laser:      { persistent: true, cooldown: 15 },   // Auto-targeting
  shotgun:    { persistent: true, cooldown: 40 },   // 3-way spread
  tommyGun:   { persistent: true, cooldown: 5 }     // Rapid fire
};

// Power-up types and their spawn weights
const POWERUP_TYPES = ['rocket', 'cape', 'spring', 'shield', 'propeller', 'springShoes', 'magnet', 'sumo', 'laser', 'shotgun', 'tommyGun'];
const POWERUP_WEIGHTS = [12, 10, 12, 8, 10, 10, 10, 8, 6, 6, 8];

// ============== UTILITY FUNCTIONS ==============

const checkCollision = (a, b, padding = 0) => (
  a.x + padding < b.x + b.width - padding &&
  a.x + a.width - padding > b.x + padding &&
  a.y + padding < b.y + b.height - padding &&
  a.y + a.height - padding > b.y + padding
);

const isOnScreen = (entityY, cameraY, buffer = 50) => {
  const screenY = entityY - cameraY;
  return screenY > -buffer && screenY < CANVAS_HEIGHT + buffer;
};

const getDistance = (x1, y1, x2, y2) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

const drawGlow = (ctx, x, y, radius, color, alpha = 0.5) => {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color + Math.floor(alpha * 255).toString(16).padStart(2, '0'));
  gradient.addColorStop(1, 'transparent');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
};

const drawCircle = (ctx, x, y, radius, fillColor, strokeColor = null, lineWidth = 2) => {
  ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
};

const drawEllipse = (ctx, x, y, radiusX, radiusY, rotation = 0) => {
  ctx.beginPath();
  ctx.ellipse(x, y, radiusX, radiusY, rotation, 0, Math.PI * 2);
  ctx.fill();
};

const drawRoundedRectGradient = (ctx, x, y, width, height, radius, topColor, bottomColor) => {
  const grad = ctx.createLinearGradient(x, y, x, y + height);
  grad.addColorStop(0, topColor);
  grad.addColorStop(1, bottomColor);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
};

const drawShadow = (ctx, x, y, width, height, offsetX = 3, offsetY = 3) => {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x + offsetX, y + offsetY, width, height);
};

const randomRange = (min, max) => min + Math.random() * (max - min);
const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomSign = () => Math.random() > 0.5 ? 1 : -1;

// Weighted random selection
const weightedRandom = (items, weights) => {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;
  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) return items[i];
  }
  return items[items.length - 1];
};

// Check if frog has any active power-up
const hasAnyPower = (frog) => {
  return frog.hasRocket || frog.hasCape || frog.hasShield || frog.hasPropeller ||
         frog.hasSpringShoes || frog.hasMagnet || frog.hasSumo ||
         frog.hasLaser || frog.hasShotgun || frog.hasTommyGun;
};

// Check if frog has a persistent power (for fall-rescue)
const hasPersistentPower = (frog) => {
  return frog.hasCape || frog.hasShield || frog.hasLaser || frog.hasShotgun || frog.hasTommyGun;
};

// Check if frog has a weapon (for manual shooting)
const hasWeapon = (frog) => {
  return frog.hasLaser || frog.hasShotgun || frog.hasTommyGun;
};

// Clear all power states
const clearAllPowers = (frog) => {
  frog.hasRocket = false;
  frog.rocketTimer = 0;
  frog.hasCape = false;
  frog.hasShield = false;
  frog.shieldHits = 0;
  frog.hasPropeller = false;
  frog.propellerTimer = 0;
  frog.hasSpringShoes = false;
  frog.springShoesJumps = 0;
  frog.hasMagnet = false;
  frog.magnetTimer = 0;
  frog.hasSumo = false;
  frog.sumoTimer = 0;
  frog.hasLaser = false;
  frog.hasShotgun = false;
  frog.hasTommyGun = false;
  frog.weaponCooldown = 0;
};

// ============== MAIN COMPONENT ==============
export default function JumpyFrog() {
  const canvasRef = useRef(null);
  const [gameState, setGameState] = useState('menu');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);

  const gameRef = useRef({
    frog: createFrog(),
    platforms: [],
    gems: [],
    enemies: [],
    clouds: [],
    powerups: [],
    bullets: [],
    particles: [],
    cameraY: 0,
    sunRotation: 0,
    keys: { left: false, right: false, shoot: false },
    score: 0
  });

  const gameStateRef = useRef(gameState);

  function createFrog() {
    return {
      x: CANVAS_WIDTH / 2 - 30,
      y: 500,
      vx: 0,
      vy: 0,
      width: 60,
      height: 70,
      // Timed power-ups
      hasRocket: false,
      rocketTimer: 0,
      hasPropeller: false,
      propellerTimer: 0,
      propellerAngle: 0,
      hasSpringShoes: false,
      springShoesJumps: 0,
      hasMagnet: false,
      magnetTimer: 0,
      hasSumo: false,
      sumoTimer: 0,
      // Persistent power-ups
      hasCape: false,
      hasShield: false,
      shieldHits: 0,
      hasLaser: false,
      hasShotgun: false,
      hasTommyGun: false,
      weaponCooldown: 0,
      // Mario-style invincibility
      invincible: false,
      invincibleTimer: 0,
      flashTimer: 0
    };
  }

  const generatePlatform = useCallback((y, platforms, gems, enemies, powerups) => {
    const typeRoll = Math.random();
    let platformType = 'normal';
    let vx = 0;

    if (typeRoll > 0.85) {
      platformType = 'moving';
      vx = randomSign() * randomRange(1, 3);
    } else if (typeRoll > 0.75) {
      platformType = 'breakable';
    } else if (typeRoll > 0.65) {
      platformType = 'spring';
    }

    const platform = {
      x: randomRange(20, CANVAS_WIDTH - 100),
      y,
      width: randomRange(70, 100),
      height: 18,
      type: platformType,
      color: randomChoice(PLATFORM_COLORS),
      vx,
      broken: false
    };
    platforms.push(platform);

    // Spawn gem
    if (Math.random() > 0.55) {
      const gemRoll = Math.random();
      const gemType = gemRoll > 0.9 ? 'purple' : gemRoll > 0.6 ? 'orange' : 'blue';
      gems.push({
        x: platform.x + platform.width / 2 - 15,
        y: platform.y - 50,
        width: 30,
        height: 40,
        type: gemType,
        collected: false,
        animFrame: Math.random() * Math.PI * 2
      });
    }

    // Spawn enemy
    if (Math.random() > 0.92 && y < -500) {
      enemies.push({
        x: randomRange(0, CANVAS_WIDTH - 50),
        y: y - 30,
        width: 45,
        height: 45,
        vx: randomSign() * 1.5,
        health: 1
      });
    }

    // Spawn powerup
    if (Math.random() > 0.92) {
      const powerupType = weightedRandom(POWERUP_TYPES, POWERUP_WEIGHTS);
      powerups.push({
        x: platform.x + platform.width / 2 - 20,
        y: platform.y - 60,
        width: 40,
        height: 50,
        type: powerupType,
        collected: false,
        animFrame: Math.random() * Math.PI * 2
      });
    }
  }, []);

  const initGame = useCallback(() => {
    const g = gameRef.current;
    g.frog = createFrog();
    g.platforms = [];
    g.gems = [];
    g.enemies = [];
    g.powerups = [];
    g.bullets = [];
    g.particles = [];
    g.cameraY = 0;
    g.score = 0;

    for (let i = 0; i < 15; i++) {
      generatePlatform(600 - i * 100, g.platforms, g.gems, g.enemies, g.powerups);
    }

    g.platforms.push({
      x: CANVAS_WIDTH / 2 - 40,
      y: 600,
      width: 80,
      height: 20,
      type: 'normal',
      color: PLATFORM_COLORS[0],
      vx: 0,
      broken: false
    });

    g.clouds = [];
    for (let i = 0; i < 8; i++) {
      g.clouds.push({
        x: randomRange(0, CANVAS_WIDTH),
        y: randomRange(0, 2000),
        width: randomRange(80, 180),
        speed: randomRange(0.3, 0.8),
        opacity: randomRange(0.3, 0.7)
      });
    }

    setScore(0);
  }, [generatePlatform]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const createParticles = (x, y, color, count = 6) => {
    const particles = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        vx: randomRange(-3, 3),
        vy: randomRange(-5, -1),
        color,
        size: randomRange(3, 6),
        life: randomRange(20, 40)
      });
    }
    return particles;
  };

  // ============== DRAWING FUNCTIONS ==============

  const drawBackground = (ctx, g) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#87CEEB');
    gradient.addColorStop(1, '#1E90FF');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.save();
    ctx.translate(CANVAS_WIDTH - 80, 80);
    ctx.rotate(g.sunRotation);
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 16; i++) {
      ctx.save();
      ctx.rotate((Math.PI * 2 / 16) * i);
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-8, -120);
      ctx.lineTo(8, -120);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const drawCloud = (ctx, x, y, width) => {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    drawEllipse(ctx, x, y, width * 0.5, width * 0.25);
    drawEllipse(ctx, x - width * 0.25, y + 5, width * 0.3, width * 0.2);
    drawEllipse(ctx, x + width * 0.25, y + 5, width * 0.35, width * 0.22);
  };

  const drawHills = (ctx, cameraY) => {
    const hillY = CANVAS_HEIGHT - 100;

    ctx.fillStyle = '#32CD32';
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_HEIGHT);
    for (let x = 0; x <= CANVAS_WIDTH; x += 50) {
      const y = hillY + Math.sin((x + cameraY * 0.1) * 0.02) * 30;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fill();

    ctx.fillStyle = '#228B22';
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_HEIGHT);
    for (let x = 0; x <= CANVAS_WIDTH; x += 30) {
      const y = hillY + 40 + Math.sin((x + cameraY * 0.15) * 0.03) * 25;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fill();
  };

  const drawPlatform = (ctx, platform, screenY) => {
    const { x, width, height, type, color } = platform;

    drawShadow(ctx, x, screenY, width, height);
    drawRoundedRectGradient(ctx, x, screenY, width, height, 8, color.top, color.bottom);

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x + 2, screenY + 2, width - 4, height - 6, 6);
    ctx.stroke();

    if (type === 'spring') {
      drawCircle(ctx, x + width / 2, screenY - 5, 8, '#FFD700');
      drawCircle(ctx, x + width / 2, screenY - 5, 5, '#FFA500');
    } else if (type === 'breakable') {
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + width * 0.3, screenY);
      ctx.lineTo(x + width * 0.4, screenY + height);
      ctx.moveTo(x + width * 0.6, screenY);
      ctx.lineTo(x + width * 0.7, screenY + height);
      ctx.stroke();
    } else if (type === 'moving') {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.moveTo(x + 10, screenY + height / 2);
      ctx.lineTo(x + 18, screenY + height / 2 - 4);
      ctx.lineTo(x + 18, screenY + height / 2 + 4);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + width - 10, screenY + height / 2);
      ctx.lineTo(x + width - 18, screenY + height / 2 - 4);
      ctx.lineTo(x + width - 18, screenY + height / 2 + 4);
      ctx.fill();
    }
  };

  const drawGem = (ctx, gem, screenY) => {
    const { x, type, animFrame } = gem;
    const color = GEM_COLORS[type];

    const glowSize = 20 + Math.sin(animFrame) * 5;
    drawGlow(ctx, x + 15, screenY + 20, glowSize, color.glow);

    ctx.fillStyle = color.main;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 15, screenY);
    ctx.lineTo(x + 30, screenY + 15);
    ctx.lineTo(x + 25, screenY + 40);
    ctx.lineTo(x + 5, screenY + 40);
    ctx.lineTo(x, screenY + 15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.moveTo(x + 10, screenY + 8);
    ctx.lineTo(x + 20, screenY + 8);
    ctx.lineTo(x + 15, screenY + 18);
    ctx.closePath();
    ctx.fill();
  };

  const drawEnemy = (ctx, enemy, screenY) => {
    const { x, width } = enemy;
    const size = width;

    const gradient = ctx.createRadialGradient(x + size/2, screenY + size/2, 0, x + size/2, screenY + size/2, size/2);
    gradient.addColorStop(0, '#9C27B0');
    gradient.addColorStop(0.7, '#7B1FA2');
    gradient.addColorStop(1, '#4A148C');

    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 / 12) * i;
      const spikeLen = 5 + Math.sin(Date.now() * 0.01 + i) * 3;
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x + size/2 + Math.cos(angle) * (size/2 + spikeLen), screenY + size/2 + Math.sin(angle) * (size/2 + spikeLen), 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x + size/2, screenY + size/2, size/2 - 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x + size * 0.35, screenY + size * 0.4, 6, 0, Math.PI * 2);
    ctx.arc(x + size * 0.65, screenY + size * 0.4, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x + size * 0.35, screenY + size * 0.4, 3, 0, Math.PI * 2);
    ctx.arc(x + size * 0.65, screenY + size * 0.4, 3, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawPowerup = (ctx, powerup, screenY) => {
    const { x, type, animFrame } = powerup;
    const bounce = Math.sin(animFrame * 2) * 3;
    const y = screenY + bounce;

    drawGlow(ctx, x + 20, y + 25, 25, '#FFD700', 0.3);

    ctx.save();
    switch (type) {
      case 'rocket':
        ctx.fillStyle = '#E0E0E0';
        ctx.beginPath();
        ctx.moveTo(x + 20, y);
        ctx.lineTo(x + 35, y + 25);
        ctx.lineTo(x + 35, y + 45);
        ctx.lineTo(x + 5, y + 45);
        ctx.lineTo(x + 5, y + 25);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#FF5722';
        ctx.beginPath();
        ctx.moveTo(x + 10, y + 45);
        ctx.quadraticCurveTo(x + 20, y + 58, x + 30, y + 45);
        ctx.fill();
        ctx.fillStyle = '#2196F3';
        drawCircle(ctx, x + 20, y + 20, 6, '#2196F3');
        break;

      case 'cape':
        ctx.fillStyle = '#DC143C';
        ctx.beginPath();
        ctx.moveTo(x + 10, y + 5);
        ctx.quadraticCurveTo(x + 20, y + 15, x + 30, y + 5);
        ctx.lineTo(x + 35, y + 40);
        ctx.quadraticCurveTo(x + 20, y + 50, x + 5, y + 40);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#FFD700';
        drawCircle(ctx, x + 20, y + 8, 5, '#FFD700');
        break;

      case 'spring':
        ctx.fillStyle = '#FFD700';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.ellipse(x + 20, y + 10 + i * 10, 15, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#B8860B';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        break;

      case 'shield':
        const shieldGrad = ctx.createLinearGradient(x, y, x + 40, y + 50);
        shieldGrad.addColorStop(0, '#2196F3');
        shieldGrad.addColorStop(1, '#1565C0');
        ctx.fillStyle = shieldGrad;
        ctx.beginPath();
        ctx.moveTo(x + 20, y);
        ctx.lineTo(x + 40, y + 15);
        ctx.lineTo(x + 35, y + 45);
        ctx.lineTo(x + 20, y + 50);
        ctx.lineTo(x + 5, y + 45);
        ctx.lineTo(x, y + 15);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#FFEB3B';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('2', x + 20, y + 32);
        break;

      case 'propeller':
        ctx.fillStyle = '#4CAF50';
        ctx.beginPath();
        ctx.arc(x + 20, y + 30, 15, 0, Math.PI * 2);
        ctx.fill();
        const bladeAngle = Date.now() * 0.02;
        ctx.fillStyle = '#F44336';
        for (let i = 0; i < 3; i++) {
          ctx.save();
          ctx.translate(x + 20, y + 15);
          ctx.rotate(bladeAngle + (Math.PI * 2 / 3) * i);
          ctx.fillRect(-3, -20, 6, 20);
          ctx.restore();
        }
        break;

      case 'springShoes':
        ctx.fillStyle = '#FF9800';
        ctx.beginPath();
        ctx.roundRect(x + 5, y + 20, 30, 25, 5);
        ctx.fill();
        ctx.fillStyle = '#FFD700';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.ellipse(x + 12 + i * 8, y + 48, 4, 6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        break;

      case 'magnet':
        ctx.fillStyle = '#E91E63';
        ctx.beginPath();
        ctx.arc(x + 20, y + 15, 15, Math.PI, 2 * Math.PI);
        ctx.lineTo(x + 35, y + 40);
        ctx.lineTo(x + 25, y + 40);
        ctx.lineTo(x + 25, y + 25);
        ctx.lineTo(x + 15, y + 25);
        ctx.lineTo(x + 15, y + 40);
        ctx.lineTo(x + 5, y + 40);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(x + 20, y + 15, 20, Math.PI * 0.8, Math.PI * 0.2, true);
        ctx.stroke();
        ctx.setLineDash([]);
        break;

      case 'sumo':
        // Sumo wrestler face
        ctx.fillStyle = '#FFE0B2';
        ctx.beginPath();
        ctx.arc(x + 20, y + 25, 18, 0, Math.PI * 2);
        ctx.fill();
        // Hair bun
        ctx.fillStyle = '#5D4037';
        ctx.beginPath();
        ctx.arc(x + 20, y + 8, 10, 0, Math.PI * 2);
        ctx.fill();
        // Eyes
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(x + 14, y + 24, 3, 0, Math.PI * 2);
        ctx.arc(x + 26, y + 24, 3, 0, Math.PI * 2);
        ctx.fill();
        // Cheeks
        ctx.fillStyle = '#FF8A80';
        ctx.beginPath();
        ctx.arc(x + 8, y + 30, 5, 0, Math.PI * 2);
        ctx.arc(x + 32, y + 30, 5, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'laser':
        ctx.fillStyle = '#00BCD4';
        ctx.beginPath();
        ctx.roundRect(x + 5, y + 15, 30, 20, 3);
        ctx.fill();
        ctx.fillStyle = '#FF5722';
        ctx.beginPath();
        ctx.roundRect(x + 30, y + 20, 10, 10, 2);
        ctx.fill();
        drawGlow(ctx, x + 38, y + 25, 8, '#00FFFF', 0.6);
        break;

      case 'shotgun':
        ctx.fillStyle = '#795548';
        ctx.beginPath();
        ctx.roundRect(x + 5, y + 20, 25, 12, 2);
        ctx.fill();
        ctx.fillStyle = '#424242';
        ctx.fillRect(x + 25, y + 18, 15, 8);
        ctx.fillRect(x + 25, y + 28, 15, 8);
        break;

      case 'tommyGun':
        ctx.fillStyle = '#424242';
        ctx.beginPath();
        ctx.roundRect(x + 5, y + 18, 28, 10, 2);
        ctx.fill();
        ctx.fillRect(x + 15, y + 28, 8, 15);
        ctx.fillStyle = '#FF9800';
        ctx.beginPath();
        ctx.arc(x + 32, y + 23, 6, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
    ctx.restore();
  };

  const drawBullet = (ctx, bullet, screenY) => {
    const { x, type } = bullet;

    switch (type) {
      case 'laser':
        ctx.fillStyle = '#00FFFF';
        ctx.shadowColor = '#00FFFF';
        ctx.shadowBlur = 10;
        ctx.fillRect(x - 10, screenY - 2, 20, 4);
        ctx.shadowBlur = 0;
        break;
      case 'shotgun':
        ctx.fillStyle = '#FF5722';
        drawCircle(ctx, x, screenY, 5, '#FF5722', '#BF360C', 1);
        break;
      case 'tommyGun':
        ctx.fillStyle = '#FFEB3B';
        drawCircle(ctx, x, screenY, 4, '#FFEB3B', '#FF9800', 1);
        break;
      default:
        ctx.fillStyle = '#FFEB3B';
        drawCircle(ctx, x, screenY, 4, '#FFEB3B', '#FF9800', 1);
    }
  };

  const drawFrogFoot = (ctx, x, y, angle) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-8, 12);
    ctx.lineTo(-3, 10);
    ctx.lineTo(0, 14);
    ctx.lineTo(3, 10);
    ctx.lineTo(8, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  const drawFrog = (ctx, frog, x, y) => {
    const jumping = frog.vy < 0;
    const falling = frog.vy > 2;
    const isGliding = frog.hasCape && falling;

    // Flash effect when invincible
    if (frog.invincible && Math.floor(frog.flashTimer / 4) % 2 === 0) {
      ctx.globalAlpha = 0.4;
    }

    // Sumo scale effect
    if (frog.hasSumo) {
      ctx.save();
      ctx.translate(x + frog.width / 2, y + frog.height / 2);
      ctx.scale(1.3, 1.2);
      ctx.translate(-(x + frog.width / 2), -(y + frog.height / 2));
    }

    // Cape effect
    if (frog.hasCape) {
      const capeLength = isGliding ? 50 : 35;
      const capeSpread = isGliding ? 40 : 25;
      ctx.fillStyle = '#DC143C';
      ctx.beginPath();
      ctx.moveTo(x + 15, y + 25);
      ctx.quadraticCurveTo(x - capeSpread, y + capeLength, x + 5, y + frog.height + capeLength - 20);
      ctx.lineTo(x + frog.width - 5, y + frog.height + capeLength - 20);
      ctx.quadraticCurveTo(x + frog.width + capeSpread, y + capeLength, x + frog.width - 15, y + 25);
      ctx.closePath();
      ctx.fill();
    }

    // Rocket/Propeller flame
    if (frog.hasRocket) {
      ctx.fillStyle = '#FF9800';
      ctx.beginPath();
      ctx.moveTo(x + 15, y + frog.height);
      ctx.quadraticCurveTo(x + 30, y + frog.height + 30 + Math.random() * 10, x + 45, y + frog.height);
      ctx.fill();
      ctx.fillStyle = '#FFEB3B';
      ctx.beginPath();
      ctx.moveTo(x + 20, y + frog.height);
      ctx.quadraticCurveTo(x + 30, y + frog.height + 20 + Math.random() * 5, x + 40, y + frog.height);
      ctx.fill();
    }

    // Propeller
    if (frog.hasPropeller) {
      ctx.fillStyle = '#4CAF50';
      ctx.beginPath();
      ctx.arc(x + frog.width / 2, y - 5, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#F44336';
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.translate(x + frog.width / 2, y - 5);
        ctx.rotate(frog.propellerAngle + (Math.PI * 2 / 3) * i);
        ctx.fillRect(-3, -25, 6, 25);
        ctx.restore();
      }
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(x + frog.width/2 + 3, y + frog.height - 5, 25, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    const bodyGrad = ctx.createRadialGradient(x + 30, y + 25, 5, x + 30, y + 35, 35);
    bodyGrad.addColorStop(0, frog.hasSumo ? '#FFA000' : '#7CFC00');
    bodyGrad.addColorStop(0.5, frog.hasSumo ? '#FF8F00' : '#32CD32');
    bodyGrad.addColorStop(1, frog.hasSumo ? '#FF6F00' : '#228B22');

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(x + frog.width/2, y + 30, 28, 25, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    ctx.fillStyle = frog.hasSumo ? '#FF6F00' : '#228B22';
    if (jumping) {
      ctx.beginPath();
      ctx.ellipse(x + 10, y + 55, 12, 20, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + 50, y + 55, 12, 20, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = frog.hasSumo ? '#FF8F00' : '#32CD32';
      drawFrogFoot(ctx, x + 5, y + 70, -0.3);
      drawFrogFoot(ctx, x + 45, y + 70, 0.3);
    } else if (falling && !isGliding) {
      ctx.beginPath();
      ctx.ellipse(x + 5, y + 45, 15, 10, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + 55, y + 45, 15, 10, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = frog.hasSumo ? '#FF8F00' : '#32CD32';
      drawFrogFoot(ctx, x - 5, y + 50, -0.8);
      drawFrogFoot(ctx, x + 55, y + 50, 0.8);
    } else {
      ctx.beginPath();
      ctx.ellipse(x + 12, y + 50, 14, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + 48, y + 50, 14, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = frog.hasSumo ? '#FF8F00' : '#32CD32';
      drawFrogFoot(ctx, x + 5, y + 58, -0.2);
      drawFrogFoot(ctx, x + 42, y + 58, 0.2);
    }

    // Spring shoes
    if (frog.hasSpringShoes) {
      ctx.fillStyle = '#FF9800';
      const springBounce = Math.sin(Date.now() * 0.01) * 2;
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 62 + springBounce, 20, 10, 3);
      ctx.roundRect(x + 38, y + 62 + springBounce, 20, 10, 3);
      ctx.fill();
      ctx.fillStyle = '#FFD700';
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.ellipse(x + 12 + i * 36, y + 75 + springBounce, 6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x + 20, y + 15, 12, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + 40, y + 15, 12, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    const pupilOffset = frog.vx * 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x + 20 + pupilOffset, y + 17, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 40 + pupilOffset, y + 17, 5, 0, Math.PI * 2);
    ctx.fill();

    // Mouth
    ctx.strokeStyle = '#006400';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + 30, y + 38, 12, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // Cheeks
    ctx.fillStyle = 'rgba(255,150,150,0.3)';
    ctx.beginPath();
    ctx.ellipse(x + 12, y + 32, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + 48, y + 32, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Weapon on frog
    if (hasWeapon(frog)) {
      const weaponColor = frog.hasLaser ? '#00BCD4' : frog.hasShotgun ? '#795548' : '#424242';
      ctx.fillStyle = weaponColor;
      ctx.fillRect(x + 50, y + 25, 20, 8);
      ctx.fillRect(x + 65, y + 20, 8, 18);
    }

    // Shield effect
    if (frog.hasShield) {
      const shieldPulse = 0.3 + Math.sin(Date.now() * 0.01) * 0.1;
      ctx.globalAlpha = shieldPulse;
      ctx.strokeStyle = '#2196F3';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x + frog.width / 2, y + frog.height / 2, 45, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Shield hit indicator
      const hitsLeft = POWER_CONFIG.shield.maxHits - frog.shieldHits;
      ctx.fillStyle = hitsLeft > 1 ? '#4CAF50' : '#FF5722';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${hitsLeft} hit${hitsLeft !== 1 ? 's' : ''}`, x + frog.width / 2, y - 10);
    }

    // Magnet field effect
    if (frog.hasMagnet) {
      ctx.strokeStyle = 'rgba(233, 30, 99, 0.3)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(x + frog.width / 2, y + frog.height / 2, MAGNET_RANGE, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (frog.hasSumo) {
      ctx.restore();
    }

    ctx.globalAlpha = 1;
  };

  const drawHUD = (ctx, frog, score) => {
    // Score
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'left';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 3;
    ctx.strokeText(`Score: ${score}`, 15, 35);
    ctx.fillText(`Score: ${score}`, 15, 35);

    // Active power-up indicators
    const indicators = [];
    if (frog.hasRocket) indicators.push({ icon: '🚀', time: frog.rocketTimer, color: '#FF5722' });
    if (frog.hasCape) indicators.push({ icon: '🦸', time: 'PERSISTENT', color: '#DC143C', persistent: true });
    if (frog.hasShield) indicators.push({ icon: '🛡️', time: `${POWER_CONFIG.shield.maxHits - frog.shieldHits} hits`, color: '#2196F3', persistent: true });
    if (frog.hasPropeller) indicators.push({ icon: '🚁', time: frog.propellerTimer, color: '#4CAF50' });
    if (frog.hasSpringShoes) indicators.push({ icon: '👟', time: `${frog.springShoesJumps} jumps`, color: '#FF9800', isCount: true });
    if (frog.hasMagnet) indicators.push({ icon: '🧲', time: frog.magnetTimer, color: '#E91E63' });
    if (frog.hasSumo) indicators.push({ icon: '💪', time: frog.sumoTimer, color: '#8D6E63' });
    if (frog.hasLaser) indicators.push({ icon: '🔫', time: 'PERSISTENT', color: '#00BCD4', persistent: true });
    if (frog.hasShotgun) indicators.push({ icon: '🔥', time: 'PERSISTENT', color: '#795548', persistent: true });
    if (frog.hasTommyGun) indicators.push({ icon: '💥', time: 'PERSISTENT', color: '#607D8B', persistent: true });

    indicators.forEach((ind, i) => {
      const yPos = 55 + i * 28;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(10, yPos, 100, 24);
      ctx.fillStyle = ind.color;
      ctx.font = '16px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(ind.icon, 15, yPos + 18);
      ctx.fillStyle = ind.persistent ? '#00FF00' : '#FFD700';
      ctx.font = 'bold 12px Arial';
      const timeText = ind.isCount ? ind.time : (ind.persistent ? ind.time : `${Math.ceil(ind.time / 60)}s`);
      ctx.fillText(timeText, 40, yPos + 17);
    });

    // Weapon shooting hint
    if (hasWeapon(frog)) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(CANVAS_WIDTH - 115, 10, 105, 28);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('⎵ SPACE = FIRE', CANVAS_WIDTH - 62, 28);
    }

    // Invincibility indicator
    if (frog.invincible) {
      ctx.fillStyle = 'rgba(255,235,59,0.7)';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('★ INVINCIBLE ★', CANVAS_WIDTH / 2, 60);
    }
  };

  // ============== GAME LOOP ==============
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;

    const update = () => {
      if (gameStateRef.current !== 'playing') return;

      const g = gameRef.current;
      const frog = g.frog;
      g.sunRotation += 0.002;

      // Movement
      if (g.keys.left) frog.vx = -MOVE_SPEED;
      else if (g.keys.right) frog.vx = MOVE_SPEED;
      else frog.vx *= 0.85;

      // Power-up specific movement physics
      if (frog.hasRocket) {
        frog.vy = ROCKET_SPEED;
        frog.rocketTimer--;
        if (frog.rocketTimer <= 0) frog.hasRocket = false;
      } else if (frog.hasPropeller) {
        frog.vy = PROPELLER_SPEED;
        frog.propellerAngle += 0.5;
        frog.propellerTimer--;
        if (frog.propellerTimer <= 0) frog.hasPropeller = false;
      } else if (frog.hasCape && frog.vy > 0) {
        frog.vy += CAPE_GRAVITY;
        frog.vy = Math.min(frog.vy, CAPE_MAX_FALL_SPEED);
      } else {
        frog.vy += GRAVITY;
      }

      // Timed power-up updates
      if (frog.hasMagnet) {
        frog.magnetTimer--;
        if (frog.magnetTimer <= 0) frog.hasMagnet = false;
      }
      if (frog.hasSumo) {
        frog.sumoTimer--;
        if (frog.sumoTimer <= 0) frog.hasSumo = false;
      }

      // Invincibility timer
      if (frog.invincible) {
        frog.invincibleTimer--;
        frog.flashTimer = frog.invincibleTimer;
        if (frog.invincibleTimer <= 0) {
          frog.invincible = false;
        }
      }

      // Weapon cooldown
      if (frog.weaponCooldown > 0) frog.weaponCooldown--;

      frog.x += frog.vx;
      frog.y += frog.vy;

      // Screen wrap
      if (frog.x > CANVAS_WIDTH) frog.x = -frog.width;
      if (frog.x < -frog.width) frog.x = CANVAS_WIDTH;

      // Camera follow
      const targetCameraY = frog.y - CANVAS_HEIGHT * 0.4;
      if (targetCameraY < g.cameraY) {
        g.cameraY = targetCameraY;
        g.score = Math.max(g.score, Math.floor(-g.cameraY / 10));
        setScore(g.score);
      }

      // Platform collision
      if (frog.vy > 0 && !frog.hasRocket && !frog.hasPropeller) {
        for (const platform of g.platforms) {
          if (platform.broken) continue;
          if (frog.x + frog.width > platform.x &&
              frog.x < platform.x + platform.width &&
              frog.y + frog.height > platform.y &&
              frog.y + frog.height < platform.y + platform.height + frog.vy + 5) {

            let jumpForce = JUMP_FORCE;

            if (frog.hasSpringShoes) {
              jumpForce *= SPRING_SHOES_JUMP_MULTIPLIER;
              frog.springShoesJumps--;
              if (frog.springShoesJumps <= 0) frog.hasSpringShoes = false;
            }

            if (platform.type === 'breakable') {
              platform.broken = true;
              frog.vy = jumpForce;
              g.particles.push(...createParticles(platform.x + platform.width/2, platform.y, platform.color.top));
            } else if (platform.type === 'spring') {
              frog.vy = jumpForce * 1.5;
            } else {
              frog.vy = jumpForce;
            }
          }
        }
      }

      // Moving platforms
      for (const platform of g.platforms) {
        if (platform.type === 'moving') {
          platform.x += platform.vx;
          if (platform.x <= 0 || platform.x + platform.width >= CANVAS_WIDTH) {
            platform.vx *= -1;
          }
        }
      }

      // Magnet gem attraction
      if (frog.hasMagnet) {
        const frogCX = frog.x + frog.width / 2;
        const frogCY = frog.y + frog.height / 2;
        for (const gem of g.gems) {
          if (gem.collected) continue;
          const dist = getDistance(frogCX, frogCY, gem.x + gem.width/2, gem.y + gem.height/2);
          if (dist < MAGNET_RANGE && dist > 5) {
            const angle = Math.atan2(frogCY - gem.y - gem.height/2, frogCX - gem.x - gem.width/2);
            gem.x += Math.cos(angle) * MAGNET_PULL_SPEED;
            gem.y += Math.sin(angle) * MAGNET_PULL_SPEED;
          }
        }
      }

      // Gem collection
      for (const gem of g.gems) {
        if (gem.collected) continue;
        gem.animFrame += 0.15;

        if (checkCollision(frog, gem)) {
          gem.collected = true;
          g.score += GEM_VALUES[gem.type];
          setScore(g.score);
          g.particles.push(...createParticles(gem.x + gem.width/2, gem.y + gem.height/2, GEM_COLORS[gem.type].main));
        }
      }

      // Powerup collection
      for (const powerup of g.powerups) {
        if (powerup.collected) continue;
        powerup.animFrame += 0.1;

        if (checkCollision(frog, powerup)) {
          powerup.collected = true;

          // Clear previous powers (replacement mechanic)
          clearAllPowers(frog);

          switch (powerup.type) {
            case 'rocket':
              frog.hasRocket = true;
              frog.rocketTimer = POWER_CONFIG.rocket.duration;
              break;
            case 'cape':
              frog.hasCape = true;
              break;
            case 'spring':
              frog.vy = JUMP_FORCE * 2.5;
              break;
            case 'shield':
              frog.hasShield = true;
              frog.shieldHits = 0;
              break;
            case 'propeller':
              frog.hasPropeller = true;
              frog.propellerTimer = POWER_CONFIG.propeller.duration;
              break;
            case 'springShoes':
              frog.hasSpringShoes = true;
              frog.springShoesJumps = POWER_CONFIG.springShoes.jumps;
              break;
            case 'magnet':
              frog.hasMagnet = true;
              frog.magnetTimer = POWER_CONFIG.magnet.duration;
              break;
            case 'sumo':
              frog.hasSumo = true;
              frog.sumoTimer = POWER_CONFIG.sumo.duration;
              break;
            case 'laser':
              frog.hasLaser = true;
              frog.weaponCooldown = 0;
              break;
            case 'shotgun':
              frog.hasShotgun = true;
              frog.weaponCooldown = 0;
              break;
            case 'tommyGun':
              frog.hasTommyGun = true;
              frog.weaponCooldown = 0;
              break;
          }

          g.particles.push(...createParticles(powerup.x + 20, powerup.y + 25, '#FFD700', 8));
        }
      }

      // Manual shooting with SPACE (weapons only)
      if (g.keys.shoot && hasWeapon(frog) && frog.weaponCooldown === 0) {
        const frogCX = frog.x + frog.width / 2;
        const frogCY = frog.y + frog.height / 2;

        if (frog.hasLaser) {
          // Find nearest enemy for auto-targeting
          let nearestEnemy = null;
          let nearestDist = 400;
          for (const enemy of g.enemies) {
            const dist = getDistance(frogCX, frogCY, enemy.x + enemy.width/2, enemy.y + enemy.height/2);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearestEnemy = enemy;
            }
          }

          let vx = 15, vy = 0;
          if (nearestEnemy) {
            const angle = Math.atan2(nearestEnemy.y + nearestEnemy.height/2 - frogCY, nearestEnemy.x + nearestEnemy.width/2 - frogCX);
            vx = Math.cos(angle) * 15;
            vy = Math.sin(angle) * 15;
          }

          g.bullets.push({ x: frogCX, y: frogCY, vx, vy, width: 20, height: 4, type: 'laser' });
          frog.weaponCooldown = POWER_CONFIG.laser.cooldown;
        } else if (frog.hasShotgun) {
          // 3-way spread shot
          for (let i = -1; i <= 1; i++) {
            const angle = -Math.PI/2 + i * 0.3;
            g.bullets.push({
              x: frogCX, y: frogCY,
              vx: Math.cos(angle) * 10,
              vy: Math.sin(angle) * 10,
              width: 10, height: 10,
              type: 'shotgun'
            });
          }
          frog.weaponCooldown = POWER_CONFIG.shotgun.cooldown;
        } else if (frog.hasTommyGun) {
          // Rapid fire with slight spread
          const spread = (Math.random() - 0.5) * 0.3;
          g.bullets.push({
            x: frogCX, y: frogCY,
            vx: Math.cos(-Math.PI/2 + spread) * 12,
            vy: Math.sin(-Math.PI/2 + spread) * 12,
            width: 8, height: 8,
            type: 'tommyGun'
          });
          frog.weaponCooldown = POWER_CONFIG.tommyGun.cooldown;
        }
      }

      // Update bullets
      for (let i = g.bullets.length - 1; i >= 0; i--) {
        const bullet = g.bullets[i];
        bullet.x += bullet.vx;
        bullet.y += bullet.vy;

        // Bullet-enemy collision
        for (let j = g.enemies.length - 1; j >= 0; j--) {
          const enemy = g.enemies[j];
          if (bullet.x > enemy.x && bullet.x < enemy.x + enemy.width &&
              bullet.y > enemy.y && bullet.y < enemy.y + enemy.height) {
            g.particles.push(...createParticles(enemy.x + enemy.width/2, enemy.y + enemy.height/2, '#9C27B0', 10));
            g.enemies.splice(j, 1);
            g.bullets.splice(i, 1);
            g.score += 25;
            setScore(g.score);
            break;
          }
        }

        // Remove off-screen bullets
        if (i < g.bullets.length && (bullet.x < 0 || bullet.x > CANVAS_WIDTH ||
            bullet.y < g.cameraY - 100 || bullet.y > g.cameraY + CANVAS_HEIGHT + 100)) {
          g.bullets.splice(i, 1);
        }
      }

      // Enemy collision with Mario-style protection
      for (let i = g.enemies.length - 1; i >= 0; i--) {
        const enemy = g.enemies[i];
        enemy.x += enemy.vx;
        if (enemy.x <= 0 || enemy.x + enemy.width >= CANVAS_WIDTH) {
          enemy.vx *= -1;
        }

        if (checkCollision(frog, enemy, 5)) {
          // Skip if invincible
          if (frog.invincible) continue;

          // Sumo: bounce-kill enemies on contact
          if (frog.hasSumo) {
            g.particles.push(...createParticles(enemy.x + enemy.width/2, enemy.y + enemy.height/2, '#FF9800', 10));
            g.enemies.splice(i, 1);
            frog.vy = SUMO_BOUNCE_FORCE;
            g.score += 100;
            setScore(g.score);
            continue;
          }

          // Shield: absorb hit
          if (frog.hasShield) {
            frog.shieldHits++;
            g.particles.push(...createParticles(enemy.x + enemy.width/2, enemy.y + enemy.height/2, '#2196F3', 10));
            g.enemies.splice(i, 1);

            if (frog.shieldHits >= POWER_CONFIG.shield.maxHits) {
              // Shield broke
              frog.hasShield = false;
              frog.shieldHits = 0;
              frog.invincible = true;
              frog.invincibleTimer = 60;
              frog.flashTimer = 60;
            }
            continue;
          }

          // Rocket/Propeller: immune during flight
          if (frog.hasRocket || frog.hasPropeller) {
            g.particles.push(...createParticles(enemy.x + enemy.width/2, enemy.y + enemy.height/2, '#FF5722', 10));
            g.enemies.splice(i, 1);
            continue;
          }

          // Mario-style hit protection: lose power instead of dying
          if (hasAnyPower(frog)) {
            clearAllPowers(frog);
            frog.invincible = true;
            frog.invincibleTimer = INVINCIBILITY_DURATION;
            frog.flashTimer = INVINCIBILITY_DURATION;
            g.particles.push(...createParticles(enemy.x + enemy.width/2, enemy.y + enemy.height/2, '#FFEB3B', 10));
            g.enemies.splice(i, 1);
            continue;
          }

          // No power = game over
          setHighScore(prev => Math.max(prev, g.score));
          setGameState('gameover');
        }
      }

      // Update particles
      for (let i = g.particles.length - 1; i >= 0; i--) {
        const p = g.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2;
        p.life--;
        if (p.life <= 0) g.particles.splice(i, 1);
      }

      // Clouds
      for (const cloud of g.clouds) {
        cloud.x -= cloud.speed;
        if (cloud.x + cloud.width < 0) {
          cloud.x = CANVAS_WIDTH + randomRange(0, 100);
          cloud.y = g.cameraY - randomRange(0, CANVAS_HEIGHT);
        }
      }

      // Generate platforms
      let highestPlatform = Math.min(...g.platforms.map(p => p.y));
      while (highestPlatform > g.cameraY - 200) {
        const newY = highestPlatform - randomRange(80, 140);
        generatePlatform(newY, g.platforms, g.gems, g.enemies, g.powerups);
        highestPlatform = newY;
      }

      // Cleanup
      const cleanupY = g.cameraY + CANVAS_HEIGHT + 100;
      g.platforms = g.platforms.filter(p => p.y < cleanupY);
      g.gems = g.gems.filter(gem => gem.y < cleanupY && !gem.collected);
      g.enemies = g.enemies.filter(e => e.y < cleanupY);
      g.powerups = g.powerups.filter(p => p.y < cleanupY && !p.collected);

      // Fall death OR fall-rescue with persistent power
      if (frog.y > g.cameraY + CANVAS_HEIGHT + 100) {
        if (hasPersistentPower(frog)) {
          // Fall-rescue: teleport back, lose power
          frog.y = g.cameraY + CANVAS_HEIGHT * 0.5;
          frog.vy = JUMP_FORCE * 1.5;
          frog.x = CANVAS_WIDTH / 2 - frog.width / 2;

          clearAllPowers(frog);

          frog.invincible = true;
          frog.invincibleTimer = 60;
          frog.flashTimer = 60;

          g.particles.push(...createParticles(frog.x + frog.width/2, frog.y + frog.height/2, '#FFD700', 12));
        } else {
          setHighScore(prev => Math.max(prev, g.score));
          setGameState('gameover');
        }
      }
    };

    const draw = () => {
      const g = gameRef.current;

      drawBackground(ctx, g);

      for (const cloud of g.clouds) {
        const screenY = cloud.y - g.cameraY;
        ctx.globalAlpha = cloud.opacity;
        drawCloud(ctx, cloud.x, screenY, cloud.width);
      }
      ctx.globalAlpha = 1;

      drawHills(ctx, g.cameraY);

      for (const platform of g.platforms) {
        if (platform.broken) continue;
        const screenY = platform.y - g.cameraY;
        if (!isOnScreen(platform.y, g.cameraY)) continue;
        drawPlatform(ctx, platform, screenY);
      }

      for (const gem of g.gems) {
        if (gem.collected) continue;
        const screenY = gem.y - g.cameraY;
        if (!isOnScreen(gem.y, g.cameraY)) continue;
        drawGem(ctx, gem, screenY);
      }

      for (const powerup of g.powerups) {
        if (powerup.collected) continue;
        const screenY = powerup.y - g.cameraY;
        if (!isOnScreen(powerup.y, g.cameraY)) continue;
        drawPowerup(ctx, powerup, screenY);
      }

      for (const enemy of g.enemies) {
        const screenY = enemy.y - g.cameraY;
        if (!isOnScreen(enemy.y, g.cameraY)) continue;
        drawEnemy(ctx, enemy, screenY);
      }

      for (const bullet of g.bullets) {
        const screenY = bullet.y - g.cameraY;
        if (!isOnScreen(bullet.y, g.cameraY)) continue;
        drawBullet(ctx, bullet, screenY);
      }

      // Particles
      for (const p of g.particles) {
        const screenY = p.y - g.cameraY;
        ctx.globalAlpha = p.life / 40;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, screenY, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const frogScreenY = g.frog.y - g.cameraY;
      drawFrog(ctx, g.frog, g.frog.x, frogScreenY);

      drawHUD(ctx, g.frog, g.score);
    };

    const gameLoop = () => {
      update();
      draw();
      animationId = requestAnimationFrame(gameLoop);
    };

    initGame();
    gameLoop();

    return () => cancelAnimationFrame(animationId);
  }, [initGame, generatePlatform]);

  // ============== INPUT HANDLING ==============
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      if (key === 'arrowleft' || key === 'a') gameRef.current.keys.left = true;
      if (key === 'arrowright' || key === 'd') gameRef.current.keys.right = true;
      if (e.key === ' ') {
        e.preventDefault();
        if (gameStateRef.current !== 'playing') {
          initGame();
          setGameState('playing');
        } else {
          gameRef.current.keys.shoot = true;
        }
      }
      if (e.key === 'Enter' && gameStateRef.current !== 'playing') {
        initGame();
        setGameState('playing');
      }
    };

    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      if (key === 'arrowleft' || key === 'a') gameRef.current.keys.left = false;
      if (key === 'arrowright' || key === 'd') gameRef.current.keys.right = false;
      if (e.key === ' ') gameRef.current.keys.shoot = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [initGame]);

  const handleCanvasClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);

    if (gameState === 'menu') {
      const dist = Math.sqrt((x - CANVAS_WIDTH / 2) ** 2 + (y - 400) ** 2);
      if (dist < 60) {
        initGame();
        setGameState('playing');
      }
    } else if (gameState === 'gameover') {
      if (x > CANVAS_WIDTH / 2 - 80 && x < CANVAS_WIDTH / 2 + 80 && y > 420 && y < 470) {
        initGame();
        setGameState('playing');
      }
    }
  };

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    const rect = canvasRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;

    if (gameState === 'playing') {
      if (x < rect.width / 2) gameRef.current.keys.left = true;
      else gameRef.current.keys.right = true;
    } else {
      handleCanvasClick({ clientX: touch.clientX, clientY: touch.clientY });
    }
  };

  const handleTouchEnd = () => {
    gameRef.current.keys.left = false;
    gameRef.current.keys.right = false;
  };

  // ============== RENDER ==============
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onClick={handleCanvasClick}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="rounded-2xl shadow-2xl"
          style={{ touchAction: 'none', maxHeight: '90vh', maxWidth: '100%' }}
        />

        {gameState === 'menu' && (
          <div className="absolute inset-0 bg-black/50 rounded-2xl flex flex-col items-center justify-center">
            <h1 className="text-5xl font-bold text-green-400 drop-shadow-lg mb-2" style={{ textShadow: '3px 3px 0 #166534' }}>JUMPY</h1>
            <h1 className="text-5xl font-bold text-green-400 drop-shadow-lg mb-4" style={{ textShadow: '3px 3px 0 #166534' }}>FROG</h1>
            <button
              onClick={() => { initGame(); setGameState('playing'); }}
              className="w-28 h-28 rounded-full bg-green-500 hover:bg-green-400 flex items-center justify-center shadow-xl border-4 border-green-700 transition-transform hover:scale-105"
            >
              <div className="w-0 h-0 border-l-[30px] border-l-white border-y-[20px] border-y-transparent ml-2" />
            </button>
            <p className="text-white mt-6 text-lg">← → or A/D to move</p>
            <p className="text-cyan-400 mt-1">⎵ SPACE to shoot (with weapons)</p>
            <div className="mt-4 text-center max-w-xs">
              <p className="text-yellow-400 font-bold text-sm">POWER-UPS:</p>
              <p className="text-green-400 text-xs mt-1">🛡️ PERSISTENT (until hit/fall/replaced):</p>
              <p className="text-white/70 text-xs">🦸Cape · 🛡️Shield(2 hits) · 🔫Laser · 🔥Shotgun · 💥Tommy</p>
              <p className="text-orange-400 text-xs mt-1">⏱️ TIMED:</p>
              <p className="text-white/70 text-xs">🚀Rocket · 🚁Propeller · 💪Sumo · 🧲Magnet · 👟Shoes</p>
              <p className="text-cyan-400 text-xs mt-2 font-bold">★ Persistent powers save you from falling!</p>
              <p className="text-cyan-400 text-xs">★ Hit with power = lose power, not life!</p>
            </div>
            {highScore > 0 && <p className="text-yellow-400 font-bold text-xl mt-4">High Score: {highScore}</p>}
          </div>
        )}

        {gameState === 'gameover' && (
          <div className="absolute inset-0 bg-black/70 rounded-2xl flex flex-col items-center justify-center">
            <h1 className="text-5xl font-bold text-orange-500 drop-shadow-lg mb-4" style={{ textShadow: '3px 3px 0 #9a3412' }}>GAME OVER</h1>
            <p className="text-white text-3xl font-bold mb-2">Score: {score}</p>
            {score >= highScore && score > 0 && <p className="text-yellow-400 text-xl font-bold mb-4">NEW HIGH SCORE!</p>}
            <button
              onClick={() => { initGame(); setGameState('playing'); }}
              className="px-8 py-3 bg-green-500 hover:bg-green-400 text-white font-bold text-xl rounded-xl shadow-lg transition-transform hover:scale-105"
            >
              PLAY AGAIN
            </button>
          </div>
        )}
      </div>
    </div>
  );
}