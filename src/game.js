import {
  advanceGame,
  createGameState,
  OPENING_PROTECTION_SECONDS,
  resizeGame,
  sanitizeBestScore,
  startCountdown,
} from './game-core.js';
import {
  createCountdownRenderer,
  getCountdownFrame,
} from './countdown-animation.js';

const STORAGE_KEY = 'dodgeBestScoreV2';
const MAX_LOGICAL_DIMENSION = 100_000;
const MAX_BACKING_STORE_SIDE = 8_192;
const MAX_BACKING_STORE_PIXELS = 16_777_216;
const COUNTDOWN_CENTER_OFFSET = 2.6;
const COUNTDOWN_FONT_SCALE = 2.2;

function backingStoreScale(logicalWidth, logicalHeight, requestedDpr) {
  const sideScale = Math.min(
    MAX_BACKING_STORE_SIDE / logicalWidth,
    MAX_BACKING_STORE_SIDE / logicalHeight,
  );
  const pixelScale = Math.sqrt(
    MAX_BACKING_STORE_PIXELS / (logicalWidth * logicalHeight),
  );
  const scale = Math.min(requestedDpr, sideScale, pixelScale);

  return Number.isFinite(scale) && scale > 0 ? scale : Number.MIN_VALUE;
}

export function createBrowserGame({
  windowObject = globalThis.window,
  documentObject = globalThis.document,
} = {}) {
  const canvas = documentObject.getElementById('game');
  const status = documentObject.getElementById('game-status');
  const context = canvas.getContext('2d');
  const countdownRenderer =
    context === null
      ? null
      : createCountdownRenderer({
          context,
          createCanvas: () =>
            documentObject.createElement?.('canvas') ?? null,
        });

  function readBestScore() {
    try {
      return sanitizeBestScore(windowObject.localStorage.getItem(STORAGE_KEY));
    } catch {
      return 0;
    }
  }

  function writeBestScore(score) {
    try {
      windowObject.localStorage.setItem(STORAGE_KEY, String(score));
    } catch {
      // 存储不可用时，state.bestScore 仍会保留本次会话的最高分。
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function initialDimension(value) {
    return Number.isFinite(value) && value > 0
      ? clamp(value, 1, MAX_LOGICAL_DIMENSION)
      : 1;
  }

  function resizedDimension(value, previousValue) {
    return Number.isFinite(value) && value > 0
      ? clamp(value, 1, MAX_LOGICAL_DIMENSION)
      : previousValue;
  }

  const initialWidth = initialDimension(windowObject.innerWidth);
  const initialHeight = initialDimension(windowObject.innerHeight);
  const input = {
    mode: 'pointer',
    pointerActive: false,
    pointerX: initialWidth / 2,
    pointerY: initialHeight / 2,
    left: false,
    right: false,
    up: false,
    down: false,
  };
  const state = createGameState({
    width: initialWidth,
    height: initialHeight,
    bestScore: readBestScore(),
  });
  let persistedBestScore = state.bestScore;
  let previousTimestamp;
  let activeTouchPointerId = null;

  function setupCanvas() {
    const logicalWidth = resizedDimension(windowObject.innerWidth, state.width);
    const logicalHeight = resizedDimension(windowObject.innerHeight, state.height);
    const rawDpr = windowObject.devicePixelRatio;
    const requestedDpr =
      Number.isFinite(rawDpr) && rawDpr > 0 ? Math.min(rawDpr, 3) : 1;
    const scale = backingStoreScale(
      logicalWidth,
      logicalHeight,
      requestedDpr,
    );
    const oldWidth = state.width;
    const oldHeight = state.height;
    const xRatio = logicalWidth / oldWidth;
    const yRatio = logicalHeight / oldHeight;

    input.pointerX = clamp(input.pointerX * xRatio, 0, logicalWidth);
    input.pointerY = clamp(input.pointerY * yRatio, 0, logicalHeight);

    canvas.width = Math.max(1, Math.floor(logicalWidth * scale));
    canvas.height = Math.max(1, Math.floor(logicalHeight * scale));
    canvas.style.width = `${logicalWidth}px`;
    canvas.style.height = `${logicalHeight}px`;
    context.setTransform(
      canvas.width / logicalWidth,
      0,
      0,
      canvas.height / logicalHeight,
      0,
      0,
    );
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    resizeGame(state, logicalWidth, logicalHeight);
  }

  function updatePointer(event) {
    const rect = canvas.getBoundingClientRect();
    const rectWidth = rect.width || 1;
    const rectHeight = rect.height || 1;

    input.pointerX = clamp(
      ((event.clientX - rect.left) / rectWidth) * state.width,
      0,
      state.width,
    );
    input.pointerY = clamp(
      ((event.clientY - rect.top) / rectHeight) * state.height,
      0,
      state.height,
    );
    input.pointerActive = true;
    input.mode = 'pointer';
  }

  function beginGame() {
    const viewportWidth = resizedDimension(
      windowObject.innerWidth,
      state.width,
    );
    const viewportHeight = resizedDimension(
      windowObject.innerHeight,
      state.height,
    );

    if (
      state.width !== viewportWidth ||
      state.height !== viewportHeight
    ) {
      setupCanvas();
    }

    previousTimestamp = undefined;
    startCountdown(state);
    status.textContent = '倒计时开始';
  }

  function canBeginGame() {
    return state.phase === 'idle' || state.phase === 'gameover';
  }

  function handlePointerDown(event) {
    if (event.pointerType === 'touch') {
      if (event.isPrimary === false || activeTouchPointerId !== null) {
        return;
      }
      activeTouchPointerId = event.pointerId;
    }

    event.preventDefault();
    canvas.focus({ preventScroll: true });
    updatePointer(event);

    if (canBeginGame()) {
      beginGame();
    }
  }

  function handlePointerMove(event) {
    if (
      event.pointerType === 'touch' &&
      event.pointerId !== activeTouchPointerId
    ) {
      return;
    }

    updatePointer(event);
  }

  function deactivatePointer() {
    input.pointerActive = false;
  }

  function handlePointerLeave(event) {
    if (event.pointerType !== 'touch') {
      deactivatePointer();
    }
  }

  function releaseActiveTouch(event) {
    if (event.pointerId !== activeTouchPointerId) {
      return;
    }

    activeTouchPointerId = null;
    deactivatePointer();
  }

  function handlePointerUp(event) {
    if (event.pointerType === 'touch') {
      releaseActiveTouch(event);
      return;
    }

    if (event.pointerType !== 'mouse') {
      deactivatePointer();
    }
  }

  function handlePointerCancel(event) {
    if (event.pointerType === 'touch') {
      releaseActiveTouch(event);
      return;
    }

    deactivatePointer();
  }

  const movementKeys = new Map([
    ['ArrowLeft', 'left'],
    ['ArrowRight', 'right'],
    ['ArrowUp', 'up'],
    ['ArrowDown', 'down'],
    ['KeyA', 'left'],
    ['KeyD', 'right'],
    ['KeyW', 'up'],
    ['KeyS', 'down'],
  ]);

  function handleKeyDown(event) {
    if (event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault();
      if (canBeginGame()) {
        beginGame();
      }
      return;
    }

    const direction = movementKeys.get(event.code);
    if (direction) {
      event.preventDefault();
      input[direction] = true;
      input.mode = 'keyboard';
    }
  }

  function handleKeyUp(event) {
    const direction = movementKeys.get(event.code);
    if (direction) {
      event.preventDefault();
      input[direction] = false;
    }
  }

  function clearTransientInput() {
    input.left = false;
    input.right = false;
    input.up = false;
    input.down = false;
    input.pointerActive = false;
    activeTouchPointerId = null;
  }

  function bindInput() {
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    canvas.addEventListener('pointercancel', handlePointerCancel);
    canvas.addEventListener('pointerup', handlePointerUp);
    windowObject.addEventListener('keydown', handleKeyDown);
    windowObject.addEventListener('keyup', handleKeyUp);
    windowObject.addEventListener('blur', clearTransientInput);
  }

  function getUiMetrics() {
    const shortEdge = Math.min(state.width, state.height);

    return {
      fontSize: Math.max(14, shortEdge * 0.05),
      padding: shortEdge * 0.04,
      centerX: state.width / 2,
      centerY: state.height / 2,
    };
  }

  function drawBackground() {
    context.save();
    context.globalAlpha = 1;
    context.fillStyle = '#0d0d0d';
    context.fillRect(0, 0, state.width, state.height);

    const gridSize = Math.min(state.width, state.height) / 14;
    context.strokeStyle = '#1a1a1a';
    context.lineWidth = 0.5;
    context.beginPath();

    for (let x = gridSize; x < state.width; x += gridSize) {
      context.moveTo(x, 0);
      context.lineTo(x, state.height);
    }
    for (let y = gridSize; y < state.height; y += gridSize) {
      context.moveTo(0, y);
      context.lineTo(state.width, y);
    }

    context.stroke();
    context.restore();
  }

  function drawPredictiveEnemy(enemy) {
    context.fillStyle = '#ff6438';
    context.beginPath();
    context.moveTo(enemy.x, enemy.y - enemy.size);
    context.lineTo(enemy.x + enemy.size, enemy.y);
    context.lineTo(enemy.x, enemy.y + enemy.size);
    context.lineTo(enemy.x - enemy.size, enemy.y);
    context.lineTo(enemy.x, enemy.y - enemy.size);
    context.fill();
    const highlightSize = enemy.size * 0.35;
    context.fillStyle = 'rgba(255, 255, 255, 0.45)';
    context.beginPath();
    context.moveTo(enemy.x, enemy.y - highlightSize);
    context.lineTo(enemy.x + highlightSize, enemy.y);
    context.lineTo(enemy.x, enemy.y + highlightSize);
    context.lineTo(enemy.x - highlightSize, enemy.y);
    context.lineTo(enemy.x, enemy.y - highlightSize);
    context.fill();
  }

  function drawEnemy(enemy) {
    if (enemy.type === 'predictive') {
      drawPredictiveEnemy(enemy);
      return;
    }

    context.fillStyle = enemy.color;
    context.beginPath();
    context.arc(enemy.x, enemy.y, enemy.size, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = 'rgba(255, 255, 255, 0.3)';
    context.beginPath();
    context.arc(
      enemy.x - enemy.size * 0.25,
      enemy.y - enemy.size * 0.25,
      enemy.size * 0.35,
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  function drawParticle(particle) {
    context.globalAlpha = clamp(particle.life, 0, 1);
    context.fillStyle = '#ff8c46';
    context.beginPath();
    context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
  }

  function drawPlayer(shieldProgress = 0) {
    const { x, y, size } = state.player;
    const progress = clamp(shieldProgress, 0, 1);

    if (progress > 0) {
      const eased = 1 - (1 - progress) ** 3;
      const pulse = 1 + Math.sin(Date.now() / 120) * 0.08;
      const radius = size * (1.6 + (2.35 - 1.6) * eased);
      context.globalAlpha = eased;
      context.fillStyle = 'rgba(0, 220, 255, 0.16)';
      context.beginPath();
      context.arc(x, y, radius * pulse, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
    }

    context.fillStyle = 'rgba(0, 220, 255, 0.3)';
    context.beginPath();
    context.arc(x, y, size * 1.6, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = '#00ddff';
    context.fillRect(x - size, y - size, size * 2, size * 2);
    context.fillStyle = 'rgba(255, 255, 255, 0.5)';
    context.fillRect(
      x - size * 0.45,
      y - size * 0.45,
      size * 0.9,
      size * 0.9,
    );
  }

  function drawWorld(countdownFrame) {
    context.save();
    context.globalAlpha = 1;

    if (state.shake > 0) {
      const shakeX = (Math.random() - 0.5) * state.shake * 2;
      const shakeY = (Math.random() - 0.5) * state.shake * 2;
      context.translate(shakeX, shakeY);
    }

    for (const enemy of state.enemies) {
      drawEnemy(enemy);
    }
    for (const particle of state.particles) {
      drawParticle(particle);
    }
    if (state.phase === 'countdown') {
      drawPlayer(countdownFrame?.shieldProgress ?? 0);
    } else if (state.phase === 'running') {
      drawPlayer(state.elapsed < OPENING_PROTECTION_SECONDS ? 1 : 0);
    }

    context.globalAlpha = 1;
    context.restore();
  }

  function drawHud(metrics) {
    context.save();
    context.globalAlpha = 1;
    context.fillStyle = '#ffffff';
    context.font = `bold ${metrics.fontSize}px -apple-system, Arial, sans-serif`;
    context.textAlign = 'left';
    context.textBaseline = 'top';
    context.fillText(
      `${Math.floor(state.elapsed)} 秒`,
      metrics.padding,
      metrics.padding,
    );

    context.fillStyle = '#999999';
    context.font = `${metrics.fontSize * 0.55}px -apple-system, Arial, sans-serif`;
    context.textAlign = 'right';
    context.fillText(
      `最高: ${state.bestScore} 秒`,
      state.width - metrics.padding,
      metrics.padding,
    );
    context.restore();
  }

  function drawIdleOverlay(metrics) {
    context.fillStyle = '#ffffff';
    context.font = `bold ${metrics.fontSize * 1.1}px -apple-system, Arial, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(
      '弹幕躲避',
      metrics.centerX,
      metrics.centerY - metrics.fontSize * 0.8,
    );

    context.fillStyle = '#aaaaaa';
    context.font = `${metrics.fontSize * 0.55}px -apple-system, Arial, sans-serif`;
    context.fillText(
      '鼠标 / 触摸 / 方向键或 WASD 躲避彩色球',
      metrics.centerX,
      metrics.centerY + metrics.fontSize * 0.5,
    );

    context.globalAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 600);
    context.fillText(
      '点击或按 Enter / 空格开始',
      metrics.centerX,
      metrics.centerY + metrics.fontSize * 1.4,
    );
    context.globalAlpha = 1;
  }

  function drawGameOverOverlay(metrics) {
    context.fillStyle = 'rgba(0, 0, 0, 0.75)';
    context.fillRect(0, 0, state.width, state.height);

    context.fillStyle = '#ff4444';
    context.font = `bold ${metrics.fontSize * 1.5}px -apple-system, Arial, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(
      '游戏结束',
      metrics.centerX,
      metrics.centerY - metrics.fontSize * 1.4,
    );

    context.fillStyle = '#ffffff';
    context.font = `${metrics.fontSize * 0.85}px -apple-system, Arial, sans-serif`;
    context.fillText(
      `坚持了 ${state.finalScore} 秒`,
      metrics.centerX,
      metrics.centerY - metrics.fontSize * 0.15,
    );

    if (state.isNewRecord) {
      context.fillStyle = '#ffcc00';
      context.font = `bold ${metrics.fontSize * 0.75}px -apple-system, Arial, sans-serif`;
      context.fillText(
        '🏆 新纪录！',
        metrics.centerX,
        metrics.centerY + metrics.fontSize * 0.8,
      );
    }

    context.fillStyle = '#aaaaaa';
    context.font = `${metrics.fontSize * 0.55}px -apple-system, Arial, sans-serif`;
    context.globalAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 600);
    context.fillText(
      '点击或按 Enter / 空格重新开始',
      metrics.centerX,
      metrics.centerY + metrics.fontSize * 1.7,
    );
    context.globalAlpha = 1;
  }

  function drawOverlay(metrics, countdownFrame) {
    context.save();
    context.globalAlpha = 1;

    if (state.phase === 'idle') {
      drawIdleOverlay(metrics);
    } else if (state.phase === 'gameover') {
      drawGameOverOverlay(metrics);
    } else if (state.phase === 'countdown') {
      countdownRenderer.draw({
        frame: countdownFrame,
        centerX: metrics.centerX,
        centerY: metrics.centerY - metrics.fontSize * COUNTDOWN_CENTER_OFFSET,
        playerX: state.player.x,
        playerY: state.player.y,
        fontSize: metrics.fontSize * COUNTDOWN_FONT_SCALE,
      });
    }

    context.globalAlpha = 1;
    context.restore();
  }

  function draw() {
    const metrics = getUiMetrics();
    const countdownFrame =
      state.phase === 'countdown'
        ? getCountdownFrame(state.countdownElapsed)
        : null;

    drawBackground();
    drawWorld(countdownFrame);
    drawHud(metrics);
    drawOverlay(metrics, countdownFrame);
    context.globalAlpha = 1;
  }

  function announceGameOver() {
    status.textContent = state.isNewRecord
      ? `游戏结束，坚持了 ${state.finalScore} 秒，创造新纪录`
      : `游戏结束，坚持了 ${state.finalScore} 秒`;
  }

  function gameLoop(timestamp) {
    if (previousTimestamp === undefined) {
      previousTimestamp = timestamp;
    }

    const elapsed = (timestamp - previousTimestamp) / 1000;
    previousTimestamp = timestamp;
    const previousPhase = state.phase;

    advanceGame(state, elapsed, input);

    if (previousPhase === 'countdown' && state.phase === 'running') {
      status.textContent = '游戏开始';
    } else if (previousPhase === 'running' && state.phase === 'gameover') {
      if (state.bestScore > persistedBestScore) {
        writeBestScore(state.bestScore);
        persistedBestScore = state.bestScore;
      }
      announceGameOver();
    }

    draw();
    windowObject.requestAnimationFrame(gameLoop);
  }

  if (context === null) {
    status.textContent = '当前浏览器不支持 Canvas 2D，无法启动游戏';
    status.classList.remove('visually-hidden');
    status.classList.add('game-error');
    status.setAttribute('role', 'alert');
    canvas.hidden = true;
  } else {
    bindInput();
    setupCanvas();
    windowObject.addEventListener('resize', setupCanvas);
    windowObject.addEventListener('orientationchange', () => {
      windowObject.setTimeout(setupCanvas, 100);
    });
    windowObject.requestAnimationFrame(gameLoop);
  }

  return {
    getState: () => state,
    input,
    setupCanvas,
    beginGame,
  };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  createBrowserGame({ windowObject: window, documentObject: document });
}
