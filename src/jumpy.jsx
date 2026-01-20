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

// Power-up types and their properties
const POWERUP_TYPES = ['rocket', 'cape', 'spring', 'shield', 'propeller', 'springShoes', 'magnet', 'gun'];
const POWERUP_WEIGHTS = [15, 12, 15, 10, 12, 12, 12, 12]; // Relative spawn chances

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
    keys: { left: false, right: false },
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
      // Power-up states
      hasRocket: false,
      rocketTimer: 0,
      hasCape: false,
      capeTimer: 0,
      hasShield: false,
      shieldTimer: 0,
      hasPropeller: false,
      propellerTimer: 0,
      propellerAngle: 0,
      hasSpringShoes: false,
      springShoesJumps: 0,
      hasMagnet: false,
      magnetTimer: 0,
      hasGun: false,
      gunTimer: 0,
      gunCooldown: 0
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
      x: CANVAS_WIDTH / 2 - 40, y: 600, width: 80, height: 20,
      type: 'normal', color: PLATFORM_COLORS[0], vx: 0, broken: false
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

  // ============== PARTICLE SYSTEM ==============
  const createParticles = (x, y, color, count = 5) => {
    const particles = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        vx: randomRange(-3, 3),
        vy: randomRange(-5, -1),
        life: 30,
        color,
        size: randomRange(3, 8)
      });
    }
    return particles;
  };

  // ============== DRAWING FUNCTIONS ==============

  const drawCloud = (ctx, x, y, width) => {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    drawEllipse(ctx, x, y, width * 0.5, width * 0.25);
    drawEllipse(ctx, x - width * 0.25, y + 5, width * 0.3, width * 0.2);
    drawEllipse(ctx, x + width * 0.25, y + 5, width * 0.35, width * 0.22);
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

  const drawGem = (ctx, x, y, type, animFrame) => {
    const color = GEM_COLORS[type];
    const glowSize = 20 + Math.sin(animFrame) * 5;
    drawGlow(ctx, x + 15, y + 20, glowSize, color.glow, 0.5);

    ctx.fillStyle = color.main;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 15, y);
    ctx.lineTo(x + 30, y + 15);
    ctx.lineTo(x + 25, y + 40);
    ctx.lineTo(x + 5, y + 40);
    ctx.lineTo(x, y + 15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 8);
    ctx.lineTo(x + 20, y + 8);
    ctx.lineTo(x + 15, y + 18);
    ctx.closePath();
    ctx.fill();
  };

  const drawEnemy = (ctx, x, y, size) => {
    const cx = x + size / 2;
    const cy = y + size / 2;

    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
    gradient.addColorStop(0, '#9C27B0');
    gradient.addColorStop(0.7, '#7B1FA2');
    gradient.addColorStop(1, '#4A148C');

    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 / 12) * i;
      const spikeLen = 5 + Math.sin(Date.now() * 0.01 + i) * 3;
      ctx.fillStyle = gradient;
      drawCircle(ctx, cx + Math.cos(angle) * (size / 2 + spikeLen), cy + Math.sin(angle) * (size / 2 + spikeLen), 6, gradient);
    }

    drawCircle(ctx, cx, cy, size / 2 - 2, gradient);

    ctx.fillStyle = '#fff';
    drawCircle(ctx, x + size * 0.35, y + size * 0.4, 6, '#fff');
    drawCircle(ctx, x + size * 0.65, y + size * 0.4, 6, '#fff');
    ctx.fillStyle = '#000';
    drawCircle(ctx, x + size * 0.35, y + size * 0.4, 3, '#000');
    drawCircle(ctx, x + size * 0.65, y + size * 0.4, 3, '#000');
  };

  const drawPowerup = (ctx, x, y, type, animFrame = 0) => {
    const bounce = Math.sin(animFrame) * 3;
    const yPos = y + bounce;

    // Glow effect for all powerups
    const glowColors = {
      rocket: '#FF5722',
      cape: '#DC143C',
      spring: '#FFD700',
      shield: '#2196F3',
      propeller: '#4CAF50',
      springShoes: '#FF9800',
      magnet: '#E91E63',
      gun: '#607D8B'
    };
    drawGlow(ctx, x + 20, yPos + 25, 25, glowColors[type], 0.3);

    switch (type) {
      case 'rocket':
        // Rocket body
        ctx.fillStyle = '#E0E0E0';
        ctx.beginPath();
        ctx.moveTo(x + 20, yPos);
        ctx.lineTo(x + 35, yPos + 25);
        ctx.lineTo(x + 35, yPos + 45);
        ctx.lineTo(x + 5, yPos + 45);
        ctx.lineTo(x + 5, yPos + 25);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Fins
        ctx.fillStyle = '#FF5722';
        ctx.beginPath();
        ctx.moveTo(x, yPos + 35);
        ctx.lineTo(x + 5, yPos + 25);
        ctx.lineTo(x + 5, yPos + 45);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + 40, yPos + 35);
        ctx.lineTo(x + 35, yPos + 25);
        ctx.lineTo(x + 35, yPos + 45);
        ctx.fill();
        // Window
        drawCircle(ctx, x + 20, yPos + 20, 6, '#87CEEB', '#333', 1);
        break;

      case 'cape':
        const waveOffset = Math.sin(Date.now() * 0.005) * 3;
        ctx.fillStyle = '#DC143C';
        ctx.beginPath();
        ctx.moveTo(x + 10, yPos + 5);
        ctx.lineTo(x + 30, yPos + 5);
        ctx.quadraticCurveTo(x + 35 + waveOffset, yPos + 25, x + 32, yPos + 45);
        ctx.lineTo(x + 20, yPos + 40);
        ctx.lineTo(x + 8, yPos + 45);
        ctx.quadraticCurveTo(x + 5 - waveOffset, yPos + 25, x + 10, yPos + 5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#8B0000';
        ctx.lineWidth = 2;
        ctx.stroke();
        drawCircle(ctx, x + 20, yPos + 8, 5, '#FFD700', '#B8860B', 1);
        break;

      case 'spring':
        ctx.fillStyle = '#FFD700';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.ellipse(x + 20, yPos + 10 + i * 10, 15, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#B8860B';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        break;

      case 'shield':
        // Shield shape
        ctx.fillStyle = '#2196F3';
        ctx.beginPath();
        ctx.moveTo(x + 20, yPos);
        ctx.lineTo(x + 38, yPos + 10);
        ctx.lineTo(x + 35, yPos + 35);
        ctx.lineTo(x + 20, yPos + 48);
        ctx.lineTo(x + 5, yPos + 35);
        ctx.lineTo(x + 2, yPos + 10);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#1565C0';
        ctx.lineWidth = 3;
        ctx.stroke();
        // Inner design
        ctx.fillStyle = '#64B5F6';
        ctx.beginPath();
        ctx.moveTo(x + 20, yPos + 8);
        ctx.lineTo(x + 30, yPos + 15);
        ctx.lineTo(x + 28, yPos + 30);
        ctx.lineTo(x + 20, yPos + 38);
        ctx.lineTo(x + 12, yPos + 30);
        ctx.lineTo(x + 10, yPos + 15);
        ctx.closePath();
        ctx.fill();
        // Star
        ctx.fillStyle = '#FFEB3B';
        drawCircle(ctx, x + 20, yPos + 22, 5, '#FFEB3B');
        break;

      case 'propeller':
        // Hat base
        ctx.fillStyle = '#4CAF50';
        ctx.beginPath();
        ctx.ellipse(x + 20, yPos + 35, 18, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#388E3C';
        ctx.beginPath();
        ctx.moveTo(x + 8, yPos + 35);
        ctx.lineTo(x + 20, yPos + 10);
        ctx.lineTo(x + 32, yPos + 35);
        ctx.closePath();
        ctx.fill();
        // Propeller
        const propAngle = Date.now() * 0.02;
        ctx.save();
        ctx.translate(x + 20, yPos + 10);
        ctx.rotate(propAngle);
        ctx.fillStyle = '#FF5722';
        ctx.beginPath();
        ctx.ellipse(-12, 0, 12, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(12, 0, 12, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        drawCircle(ctx, x + 20, yPos + 10, 4, '#FFC107', '#FF9800', 1);
        break;

      case 'springShoes':
        // Boot shape
        ctx.fillStyle = '#FF9800';
        ctx.beginPath();
        ctx.moveTo(x + 8, yPos + 5);
        ctx.lineTo(x + 32, yPos + 5);
        ctx.lineTo(x + 35, yPos + 25);
        ctx.lineTo(x + 38, yPos + 35);
        ctx.lineTo(x + 2, yPos + 35);
        ctx.lineTo(x + 5, yPos + 25);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#E65100';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Spring underneath
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          ctx.moveTo(x + 10 + i * 10, yPos + 38);
          ctx.lineTo(x + 10 + i * 10, yPos + 48);
        }
        ctx.stroke();
        break;

      case 'magnet':
        // U-shape magnet
        ctx.fillStyle = '#E91E63';
        ctx.beginPath();
        ctx.moveTo(x + 5, yPos + 5);
        ctx.lineTo(x + 15, yPos + 5);
        ctx.lineTo(x + 15, yPos + 35);
        ctx.arc(x + 20, yPos + 35, 5, Math.PI, 0, true);
        ctx.lineTo(x + 25, yPos + 5);
        ctx.lineTo(x + 35, yPos + 5);
        ctx.lineTo(x + 35, yPos + 35);
        ctx.arc(x + 20, yPos + 35, 15, 0, Math.PI, false);
        ctx.lineTo(x + 5, yPos + 35);
        ctx.closePath();
        ctx.fill();
        // Tips
        ctx.fillStyle = '#C2185B';
        ctx.fillRect(x + 5, yPos + 5, 10, 8);
        ctx.fillRect(x + 25, yPos + 5, 10, 8);
        ctx.fillStyle = '#F8BBD9';
        ctx.fillRect(x + 5, yPos + 5, 10, 4);
        ctx.fillRect(x + 25, yPos + 5, 10, 4);
        // Magnetic lines
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(x + 20, yPos + 35, 20, Math.PI * 0.2, Math.PI * 0.8);
        ctx.stroke();
        ctx.setLineDash([]);
        break;

      case 'gun':
        // Gun body
        ctx.fillStyle = '#607D8B';
        ctx.fillRect(x + 5, yPos + 20, 30, 15);
        ctx.fillRect(x + 15, yPos + 35, 10, 12);
        // Barrel
        ctx.fillStyle = '#455A64';
        ctx.fillRect(x + 30, yPos + 22, 12, 10);
        // Details
        ctx.fillStyle = '#37474F';
        ctx.fillRect(x + 8, yPos + 22, 8, 4);
        ctx.fillStyle = '#B0BEC5';
        ctx.beginPath();
        ctx.arc(x + 12, yPos + 30, 3, 0, Math.PI * 2);
        ctx.fill();
        break;
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

  const drawCape = (ctx, x, y, isGliding) => {
    const waveOffset = Math.sin(Date.now() * 0.01) * 5;
    const capeLength = isGliding ? 50 : 35;
    const capeSpread = isGliding ? 40 : 25;

    ctx.fillStyle = 'rgba(139, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.moveTo(x + 15, y + 20);
    ctx.lineTo(x + 45, y + 20);
    ctx.quadraticCurveTo(x + 55 + waveOffset, y + 40, x + 50 + capeSpread, y + 20 + capeLength);
    ctx.lineTo(x + 30, y + 15 + capeLength - 10);
    ctx.lineTo(x + 10 - capeSpread, y + 20 + capeLength);
    ctx.quadraticCurveTo(x + 5 - waveOffset, y + 40, x + 15, y + 20);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#DC143C';
    ctx.beginPath();
    ctx.moveTo(x + 18, y + 18);
    ctx.lineTo(x + 42, y + 18);
    ctx.quadraticCurveTo(x + 52 + waveOffset, y + 38, x + 47 + capeSpread, y + 18 + capeLength);
    ctx.lineTo(x + 30, y + 13 + capeLength - 10);
    ctx.lineTo(x + 13 - capeSpread, y + 18 + capeLength);
    ctx.quadraticCurveTo(x + 8 - waveOffset, y + 38, x + 18, y + 18);
    ctx.closePath();
    ctx.fill();
  };

  const drawShield = (ctx, x, y, width, height) => {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const radius = Math.max(width, height) * 0.7;

    ctx.strokeStyle = '#2196F3';
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.6 + Math.sin(Date.now() * 0.01) * 0.2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#2196F3';
    ctx.fill();
    ctx.globalAlpha = 1;
  };

  const drawPropeller = (ctx, x, y, angle) => {
    ctx.save();
    ctx.translate(x + 30, y - 5);
    ctx.rotate(angle);

    ctx.fillStyle = '#FF5722';
    ctx.beginPath();
    ctx.ellipse(-15, 0, 15, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(15, 0, 15, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    drawCircle(ctx, x + 30, y - 5, 5, '#FFC107', '#FF9800', 2);
  };

  const drawSpringShoes = (ctx, x, y) => {
    ctx.fillStyle = '#FF9800';
    // Left shoe
    ctx.beginPath();
    ctx.ellipse(x + 15, y + 65, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Right shoe
    ctx.beginPath();
    ctx.ellipse(x + 45, y + 65, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Springs
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    const springOffset = Math.sin(Date.now() * 0.02) * 2;
    ctx.beginPath();
    ctx.moveTo(x + 15, y + 68);
    ctx.lineTo(x + 15, y + 75 + springOffset);
    ctx.moveTo(x + 45, y + 68);
    ctx.lineTo(x + 45, y + 75 + springOffset);
    ctx.stroke();
  };

  const drawMagnetEffect = (ctx, x, y, width, height) => {
    const cx = x + width / 2;
    const cy = y + height / 2;

    ctx.strokeStyle = '#E91E63';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.3;
    ctx.setLineDash([5, 5]);

    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, MAGNET_RANGE * i / 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  };

  const drawGun = (ctx, x, y) => {
    // Gun on frog's back
    ctx.fillStyle = '#607D8B';
    ctx.save();
    ctx.translate(x + 50, y + 25);
    ctx.rotate(0.3);
    ctx.fillRect(0, 0, 20, 8);
    ctx.fillStyle = '#455A64';
    ctx.fillRect(18, 1, 8, 6);
    ctx.restore();
  };

  const drawBullet = (ctx, bullet) => {
    ctx.fillStyle = '#FFEB3B';
    drawCircle(ctx, bullet.x, bullet.y, 4, '#FFEB3B', '#FF9800', 1);

    // Trail
    ctx.fillStyle = 'rgba(255,235,59,0.5)';
    drawCircle(ctx, bullet.x - bullet.vx * 2, bullet.y - bullet.vy * 2, 3, 'rgba(255,235,59,0.5)');
  };

  const drawParticle = (ctx, particle) => {
    ctx.globalAlpha = particle.life / 30;
    ctx.fillStyle = particle.color;
    drawCircle(ctx, particle.x, particle.y, particle.size, particle.color);
    ctx.globalAlpha = 1;
  };

  const drawFrog = (ctx, frog, x, y) => {
    const jumping = frog.vy < 0;
    const falling = frog.vy > 2;
    const isGliding = frog.hasCape && falling;

    // Cape
    if (frog.hasCape) {
      drawCape(ctx, x, y, isGliding);
    }

    // Rocket flame
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
      drawPropeller(ctx, x, y, frog.propellerAngle);
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    drawEllipse(ctx, x + frog.width / 2 + 3, y + frog.height - 5, 25, 8);

    // Body
    const bodyGrad = ctx.createRadialGradient(x + 30, y + 25, 5, x + 30, y + 35, 35);
    bodyGrad.addColorStop(0, '#7CFC00');
    bodyGrad.addColorStop(0.5, '#32CD32');
    bodyGrad.addColorStop(1, '#228B22');

    ctx.fillStyle = bodyGrad;
    drawEllipse(ctx, x + frog.width / 2, y + 30, 28, 25);

    // Legs
    ctx.fillStyle = '#228B22';
    if (jumping) {
      drawEllipse(ctx, x + 10, y + 55, 12, 20, -0.3);
      drawEllipse(ctx, x + 50, y + 55, 12, 20, 0.3);
      ctx.fillStyle = '#32CD32';
      drawFrogFoot(ctx, x + 5, y + 70, -0.3);
      drawFrogFoot(ctx, x + 45, y + 70, 0.3);
    } else if (falling || isGliding) {
      const legSpread = isGliding ? 8 : 0;
      drawEllipse(ctx, x + 5 - legSpread, y + 45, 15, 10, -0.5);
      drawEllipse(ctx, x + 55 + legSpread, y + 45, 15, 10, 0.5);
      ctx.fillStyle = '#32CD32';
      drawFrogFoot(ctx, x - 5 - legSpread, y + 50, -0.8);
      drawFrogFoot(ctx, x + 55 + legSpread, y + 50, 0.8);
    } else {
      drawEllipse(ctx, x + 12, y + 50, 14, 12);
      drawEllipse(ctx, x + 48, y + 50, 14, 12);
      ctx.fillStyle = '#32CD32';
      drawFrogFoot(ctx, x + 5, y + 58, -0.2);
      drawFrogFoot(ctx, x + 42, y + 58, 0.2);
    }

    // Spring shoes
    if (frog.hasSpringShoes) {
      drawSpringShoes(ctx, x, y);
    }

    // Gun
    if (frog.hasGun) {
      drawGun(ctx, x, y);
    }

    // Eyes
    ctx.fillStyle = '#fff';
    drawEllipse(ctx, x + 20, y + 15, 12, 14);
    drawEllipse(ctx, x + 40, y + 15, 12, 14);

    const pupilOffset = frog.vx * 0.3;
    ctx.fillStyle = '#000';
    drawCircle(ctx, x + 20 + pupilOffset, y + 17, 5, '#000');
    drawCircle(ctx, x + 40 + pupilOffset, y + 17, 5, '#000');

    // Mouth
    ctx.strokeStyle = '#006400';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + 30, y + 38, 12, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // Blush
    ctx.fillStyle = 'rgba(255,150,150,0.3)';
    drawEllipse(ctx, x + 12, y + 32, 6, 4);
    drawEllipse(ctx, x + 48, y + 32, 6, 4);

    // Shield effect (drawn on top)
    if (frog.hasShield) {
      drawShield(ctx, x, y, frog.width, frog.height);
    }

    // Magnet effect
    if (frog.hasMagnet) {
      drawMagnetEffect(ctx, x, y, frog.width, frog.height);
    }
  };

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
    drawCircle(ctx, 0, 0, 30, '#FFD700');
    ctx.restore();
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

  const drawUI = (ctx, score) => {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'left';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 3;
    ctx.strokeText(`Score: ${score}`, 15, 35);
    ctx.fillText(`Score: ${score}`, 15, 35);
  };

  const drawPowerupIndicators = (ctx, frog) => {
    let yOffset = 55;
    const indicators = [];

    if (frog.hasRocket) indicators.push({ icon: '🚀', time: frog.rocketTimer, color: '#FF5722' });
    if (frog.hasCape) indicators.push({ icon: '🦸', time: frog.capeTimer, color: '#DC143C' });
    if (frog.hasShield) indicators.push({ icon: '🛡️', time: frog.shieldTimer, color: '#2196F3' });
    if (frog.hasPropeller) indicators.push({ icon: '🚁', time: frog.propellerTimer, color: '#4CAF50' });
    if (frog.hasSpringShoes) indicators.push({ icon: '👟', time: frog.springShoesJumps, color: '#FF9800', isCount: true });
    if (frog.hasMagnet) indicators.push({ icon: '🧲', time: frog.magnetTimer, color: '#E91E63' });
    if (frog.hasGun) indicators.push({ icon: '🔫', time: frog.gunTimer, color: '#607D8B' });

    for (const ind of indicators) {
      ctx.fillStyle = ind.color;
      ctx.font = 'bold 14px Arial';
      const timeText = ind.isCount ? `×${ind.time}` : `${Math.ceil(ind.time / 60)}s`;
      ctx.fillText(`${ind.icon} ${timeText}`, 15, yOffset);
      yOffset += 20;
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
      g.sunRotation += 0.002;

      // Input
      if (g.keys.left) g.frog.vx = -MOVE_SPEED;
      else if (g.keys.right) g.frog.vx = MOVE_SPEED;
      else g.frog.vx *= 0.85;

      // Physics based on active powerups
      if (g.frog.hasRocket) {
        g.frog.vy = ROCKET_SPEED;
        g.frog.rocketTimer--;
        if (g.frog.rocketTimer <= 0) g.frog.hasRocket = false;
      } else if (g.frog.hasPropeller) {
        g.frog.vy = PROPELLER_SPEED;
        g.frog.propellerAngle += 0.5;
        g.frog.propellerTimer--;
        if (g.frog.propellerTimer <= 0) g.frog.hasPropeller = false;
      } else if (g.frog.hasCape && g.frog.vy > 0) {
        g.frog.vy += CAPE_GRAVITY;
        g.frog.vy = Math.min(g.frog.vy, CAPE_MAX_FALL_SPEED);
      } else {
        g.frog.vy += GRAVITY;
      }

      // Decrement timers
      if (g.frog.hasCape) {
        g.frog.capeTimer--;
        if (g.frog.capeTimer <= 0) g.frog.hasCape = false;
      }
      if (g.frog.hasShield) {
        g.frog.shieldTimer--;
        if (g.frog.shieldTimer <= 0) g.frog.hasShield = false;
      }
      if (g.frog.hasMagnet) {
        g.frog.magnetTimer--;
        if (g.frog.magnetTimer <= 0) g.frog.hasMagnet = false;
      }
      if (g.frog.hasGun) {
        g.frog.gunTimer--;
        g.frog.gunCooldown = Math.max(0, g.frog.gunCooldown - 1);
        if (g.frog.gunTimer <= 0) g.frog.hasGun = false;
      }

      // Apply velocity
      g.frog.x += g.frog.vx;
      g.frog.y += g.frog.vy;

      // Screen wrap
      if (g.frog.x > CANVAS_WIDTH) g.frog.x = -g.frog.width;
      if (g.frog.x < -g.frog.width) g.frog.x = CANVAS_WIDTH;

      // Camera
      const targetCameraY = g.frog.y - CANVAS_HEIGHT * 0.4;
      if (targetCameraY < g.cameraY) {
        g.cameraY = targetCameraY;
        g.score = Math.max(g.score, Math.floor(-g.cameraY / 10));
        setScore(g.score);
      }

      // Platform collision
      if (g.frog.vy > 0 && !g.frog.hasRocket && !g.frog.hasPropeller) {
        for (const platform of g.platforms) {
          if (platform.broken) continue;

          const frogBottom = g.frog.y + g.frog.height;
          const platformTop = platform.y;

          if (g.frog.x + g.frog.width > platform.x &&
              g.frog.x < platform.x + platform.width &&
              frogBottom > platformTop &&
              frogBottom < platformTop + platform.height + g.frog.vy + 5) {

            let jumpForce = JUMP_FORCE;

            if (g.frog.hasSpringShoes) {
              jumpForce *= SPRING_SHOES_JUMP_MULTIPLIER;
              g.frog.springShoesJumps--;
              if (g.frog.springShoesJumps <= 0) g.frog.hasSpringShoes = false;
            }

            if (platform.type === 'breakable') {
              platform.broken = true;
              g.frog.vy = jumpForce;
              g.particles.push(...createParticles(platform.x + platform.width/2, platform.y, platform.color.top));
            } else if (platform.type === 'spring') {
              g.frog.vy = jumpForce * 1.5;
            } else {
              g.frog.vy = jumpForce;
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

      // Magnet effect - pull gems
      if (g.frog.hasMagnet) {
        const frogCX = g.frog.x + g.frog.width / 2;
        const frogCY = g.frog.y + g.frog.height / 2;

        for (const gem of g.gems) {
          if (gem.collected) continue;
          const gemCX = gem.x + gem.width / 2;
          const gemCY = gem.y + gem.height / 2;
          const dist = getDistance(frogCX, frogCY, gemCX, gemCY);

          if (dist < MAGNET_RANGE && dist > 0) {
            const pullStrength = (MAGNET_RANGE - dist) / MAGNET_RANGE;
            gem.x += (frogCX - gemCX) / dist * MAGNET_PULL_SPEED * pullStrength;
            gem.y += (frogCY - gemCY) / dist * MAGNET_PULL_SPEED * pullStrength;
          }
        }
      }

      // Gem collection
      for (const gem of g.gems) {
        if (gem.collected) continue;
        gem.animFrame += 0.15;

        if (checkCollision(g.frog, gem)) {
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

        if (checkCollision(g.frog, powerup)) {
          powerup.collected = true;

          switch (powerup.type) {
            case 'rocket':
              g.frog.hasRocket = true;
              g.frog.rocketTimer = 90;
              break;
            case 'cape':
              g.frog.hasCape = true;
              g.frog.capeTimer = 300;
              break;
            case 'spring':
              g.frog.vy = JUMP_FORCE * 2.5;
              break;
            case 'shield':
              g.frog.hasShield = true;
              g.frog.shieldTimer = 480;
              break;
            case 'propeller':
              g.frog.hasPropeller = true;
              g.frog.propellerTimer = 150;
              break;
            case 'springShoes':
              g.frog.hasSpringShoes = true;
              g.frog.springShoesJumps = 5;
              break;
            case 'magnet':
              g.frog.hasMagnet = true;
              g.frog.magnetTimer = 360;
              break;
            case 'gun':
              g.frog.hasGun = true;
              g.frog.gunTimer = 420;
              g.frog.gunCooldown = 0;
              break;
          }

          g.particles.push(...createParticles(powerup.x + 20, powerup.y + 25, '#FFD700', 8));
        }
      }

      // Gun auto-fire
      if (g.frog.hasGun && g.frog.gunCooldown === 0) {
        // Find nearest enemy
        let nearestEnemy = null;
        let nearestDist = 300;
        const frogCX = g.frog.x + g.frog.width / 2;
        const frogCY = g.frog.y + g.frog.height / 2;

        for (const enemy of g.enemies) {
          const dist = getDistance(frogCX, frogCY, enemy.x + enemy.width/2, enemy.y + enemy.height/2);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestEnemy = enemy;
          }
        }

        if (nearestEnemy) {
          const angle = Math.atan2(
            nearestEnemy.y + nearestEnemy.height/2 - frogCY,
            nearestEnemy.x + nearestEnemy.width/2 - frogCX
          );
          g.bullets.push({
            x: frogCX,
            y: frogCY,
            vx: Math.cos(angle) * 12,
            vy: Math.sin(angle) * 12
          });
          g.frog.gunCooldown = 20;
        }
      }

      // Update bullets
      for (let i = g.bullets.length - 1; i >= 0; i--) {
        const bullet = g.bullets[i];
        bullet.x += bullet.vx;
        bullet.y += bullet.vy;

        // Check enemy collision
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
        if (bullet.x < 0 || bullet.x > CANVAS_WIDTH ||
            bullet.y < g.cameraY - 100 || bullet.y > g.cameraY + CANVAS_HEIGHT + 100) {
          g.bullets.splice(i, 1);
        }
      }

      // Enemy collision
      for (const enemy of g.enemies) {
        enemy.x += enemy.vx;
        if (enemy.x <= 0 || enemy.x + enemy.width >= CANVAS_WIDTH) {
          enemy.vx *= -1;
        }

        if (checkCollision(g.frog, enemy, 5)) {
          if (g.frog.hasShield) {
            // Shield protects, destroy enemy
            g.particles.push(...createParticles(enemy.x + enemy.width/2, enemy.y + enemy.height/2, '#2196F3', 10));
            enemy.health = 0;
          } else if (!g.frog.hasRocket && !g.frog.hasPropeller) {
            setHighScore(prev => Math.max(prev, g.score));
            setGameState('gameover');
          }
        }
      }
      g.enemies = g.enemies.filter(e => e.health > 0);

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

      // Game over
      if (g.frog.y > g.cameraY + CANVAS_HEIGHT + 100) {
        setHighScore(prev => Math.max(prev, g.score));
        setGameState('gameover');
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
        if (!isOnScreen(platform.y, g.cameraY)) continue;
        drawPlatform(ctx, platform, platform.y - g.cameraY);
      }

      for (const gem of g.gems) {
        if (gem.collected) continue;
        if (!isOnScreen(gem.y, g.cameraY)) continue;
        drawGem(ctx, gem.x, gem.y - g.cameraY, gem.type, gem.animFrame);
      }

      for (const powerup of g.powerups) {
        if (powerup.collected) continue;
        if (!isOnScreen(powerup.y, g.cameraY)) continue;
        drawPowerup(ctx, powerup.x, powerup.y - g.cameraY, powerup.type, powerup.animFrame);
      }

      for (const enemy of g.enemies) {
        if (!isOnScreen(enemy.y, g.cameraY)) continue;
        drawEnemy(ctx, enemy.x, enemy.y - g.cameraY, enemy.width);
      }

      for (const bullet of g.bullets) {
        if (!isOnScreen(bullet.y, g.cameraY)) continue;
        drawBullet(ctx, { ...bullet, y: bullet.y - g.cameraY });
      }

      for (const particle of g.particles) {
        if (!isOnScreen(particle.y, g.cameraY)) continue;
        drawParticle(ctx, { ...particle, y: particle.y - g.cameraY });
      }

      drawFrog(ctx, g.frog, g.frog.x, g.frog.y - g.cameraY);

      drawUI(ctx, g.score);
      drawPowerupIndicators(ctx, g.frog);
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
      if ((e.key === ' ' || e.key === 'Enter') && gameStateRef.current !== 'playing') {
        initGame();
        setGameState('playing');
      }
    };

    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      if (key === 'arrowleft' || key === 'a') gameRef.current.keys.left = false;
      if (key === 'arrowright' || key === 'd') gameRef.current.keys.right = false;
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
            <h1 className="text-5xl font-bold text-green-400 drop-shadow-lg mb-6" style={{ textShadow: '3px 3px 0 #166534' }}>FROG</h1>
            <button
              onClick={() => { initGame(); setGameState('playing'); }}
              className="w-28 h-28 rounded-full bg-green-500 hover:bg-green-400 flex items-center justify-center shadow-xl border-4 border-green-700 transition-transform hover:scale-105"
            >
              <div className="w-0 h-0 border-l-[30px] border-l-white border-y-[20px] border-y-transparent ml-2" />
            </button>
            <p className="text-white mt-6 text-lg">← → or A/D to move</p>
            <div className="mt-4 text-sm text-white/80 text-center">
              <p className="font-bold text-yellow-400 mb-1">Power-ups:</p>
              <p>🚀 Rocket • 🦸 Cape • 🛡️ Shield • 🚁 Propeller</p>
              <p>👟 Spring Shoes • 🧲 Magnet • 🔫 Gun</p>
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