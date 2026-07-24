import {
  COUNTDOWN_DIGIT_SECONDS,
  COUNTDOWN_SECONDS,
} from './game-core.js';

export const COUNTDOWN_AGGREGATE_SECONDS = 0.42;
export const COUNTDOWN_EXPLODE_START_SECONDS = 1.12;
export const COUNTDOWN_SHIELD_START_SECONDS = 5.2;

const COUNTDOWN_RETURN_START_SECONDS = 4.8;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const DEFAULT_MAX_PARTICLES = 180;
const SAMPLE_FONT_SIZE = 192;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function progressBetween(value, start, end) {
  return clamp((value - start) / (end - start), 0, 1);
}

function easeOutCubic(value) {
  return 1 - (1 - value) ** 3;
}

function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value ** 3
    : 1 - (-2 * value + 2) ** 3 / 2;
}

function safeElapsed(elapsedSeconds) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    return 0;
  }
  return Math.min(elapsedSeconds, COUNTDOWN_SECONDS);
}

export function getCountdownFrame(elapsedSeconds) {
  const elapsed = safeElapsed(elapsedSeconds);

  if (elapsed >= COUNTDOWN_SECONDS) {
    return {
      digit: null,
      stage: 'complete',
      stageProgress: 1,
      shieldProgress: 1,
    };
  }

  const shieldProgress = progressBetween(
    elapsed,
    COUNTDOWN_SHIELD_START_SECONDS,
    COUNTDOWN_SECONDS,
  );

  if (elapsed >= COUNTDOWN_RETURN_START_SECONDS) {
    return {
      digit: 1,
      stage: 'return',
      stageProgress: progressBetween(
        elapsed,
        COUNTDOWN_RETURN_START_SECONDS,
        COUNTDOWN_SECONDS,
      ),
      shieldProgress,
    };
  }

  const digitIndex = Math.floor(elapsed / COUNTDOWN_DIGIT_SECONDS);
  const digit = 3 - digitIndex;
  const digitStart = digitIndex * COUNTDOWN_DIGIT_SECONDS;
  const aggregateEnd = digitStart + COUNTDOWN_AGGREGATE_SECONDS;

  if (elapsed < aggregateEnd) {
    return {
      digit,
      stage: 'aggregate',
      stageProgress: progressBetween(
        elapsed,
        digitStart,
        aggregateEnd,
      ),
      shieldProgress,
    };
  }

  const stageEnd =
    digit === 1
      ? COUNTDOWN_RETURN_START_SECONDS
      : digitStart + COUNTDOWN_EXPLODE_START_SECONDS;
  if (elapsed < stageEnd) {
    return {
      digit,
      stage: 'hold',
      stageProgress: progressBetween(
        elapsed,
        aggregateEnd,
        stageEnd,
      ),
      shieldProgress,
    };
  }

  return {
    digit,
    stage: 'explode',
    stageProgress: progressBetween(
      elapsed,
      digitStart + COUNTDOWN_EXPLODE_START_SECONDS,
      digitStart + COUNTDOWN_DIGIT_SECONDS,
    ),
    shieldProgress,
  };
}

function createDefaultCanvas() {
  if (typeof document === 'undefined') {
    return null;
  }
  return document.createElement('canvas');
}

function thinPoints(points, maxParticles) {
  if (points.length <= maxParticles) {
    return points;
  }

  const stride = points.length / maxParticles;
  return Array.from(
    { length: maxParticles },
    (_, index) => points[Math.floor(index * stride)],
  );
}

function sampleDigit(createCanvas, digit, maxParticles) {
  try {
    const canvas = createCanvas();
    if (!canvas || typeof canvas.getContext !== 'function') {
      return null;
    }

    const offscreenContext = canvas.getContext('2d');
    if (
      !offscreenContext ||
      typeof offscreenContext.getImageData !== 'function'
    ) {
      return null;
    }

    const width = Math.round(SAMPLE_FONT_SIZE * 1.15);
    const height = Math.round(SAMPLE_FONT_SIZE * 1.35);
    canvas.width = width;
    canvas.height = height;

    offscreenContext.clearRect(0, 0, width, height);
    offscreenContext.fillStyle = '#ffffff';
    offscreenContext.font = `900 ${SAMPLE_FONT_SIZE}px system-ui, sans-serif`;
    offscreenContext.textAlign = 'center';
    offscreenContext.textBaseline = 'middle';
    offscreenContext.fillText(String(digit), width / 2, height / 2);

    const pixels = offscreenContext.getImageData(0, 0, width, height).data;
    const gridSize = Math.max(2, Math.round(SAMPLE_FONT_SIZE / 18));
    const points = [];

    for (let y = 0; y < height; y += gridSize) {
      for (let x = 0; x < width; x += gridSize) {
        if (pixels[(y * width + x) * 4 + 3] > 64) {
          points.push({
            x: (x + gridSize / 2 - width / 2) / SAMPLE_FONT_SIZE,
            y: (y + gridSize / 2 - height / 2) / SAMPLE_FONT_SIZE,
          });
        }
      }
    }

    return thinPoints(points, maxParticles);
  } catch {
    return null;
  }
}

function returnColor(progress) {
  if (progress >= 1) {
    return '#00ddff';
  }
  const red = Math.round(255 * (1 - progress));
  const green = Math.round(255 + (221 - 255) * progress);
  return `rgb(${red}, ${green}, 255)`;
}

function drawFallback(context, {
  frame,
  centerX,
  centerY,
  playerX,
  playerY,
  fontSize,
}) {
  const progress = clamp(frame.stageProgress, 0, 1);
  let alpha = 1;
  let scale = 1;
  let x = centerX;
  let y = centerY;

  if (frame.stage === 'aggregate') {
    alpha = progress;
    scale = 0.55 + easeOutCubic(progress) * 0.45;
  } else if (frame.stage === 'explode') {
    alpha = 1 - progress;
    scale = 1 + easeOutCubic(progress) * 0.8;
  } else if (frame.stage === 'return') {
    const eased = easeInOutCubic(progress);
    alpha = 1 - progress;
    scale = 1 - eased * 0.7;
    x = centerX + (playerX - centerX) * eased;
    y = centerY + (playerY - centerY) * eased;
  }

  context.globalAlpha = alpha;
  context.fillStyle =
    frame.stage === 'return' ? returnColor(progress) : '#ffffff';
  context.font = `900 ${fontSize}px system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.translate(x, y);
  context.scale(scale, scale);
  context.fillText(String(frame.digit), 0, 0);
}

function drawParticles(context, {
  frame,
  points,
  centerX,
  centerY,
  playerX,
  playerY,
  fontSize,
}) {
  const progress = clamp(frame.stageProgress, 0, 1);
  const particleSize = Math.max(1.5, fontSize / 30);

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const angle = index * GOLDEN_ANGLE;
    const targetX = centerX + point.x * fontSize;
    const targetY = centerY + point.y * fontSize;
    let x = targetX;
    let y = targetY;
    let alpha = 1;

    if (frame.stage === 'aggregate') {
      const eased = easeOutCubic(progress);
      const radius = fontSize * (1.55 + (index % 7) * 0.12);
      const startX = centerX + Math.cos(angle) * radius;
      const startY = centerY + Math.sin(angle) * radius;
      x = startX + (targetX - startX) * eased;
      y = startY + (targetY - startY) * eased;
      alpha = 0.2 + progress * 0.8;
    } else if (frame.stage === 'explode') {
      const eased = easeOutCubic(progress);
      const distance = fontSize * (1.5 + (index % 5) * 0.16) * eased;
      x = targetX + Math.cos(angle) * distance;
      y = targetY + Math.sin(angle) * distance;
      alpha = 1 - progress;
    } else if (frame.stage === 'return') {
      const eased = easeInOutCubic(progress);
      x = targetX + (playerX - targetX) * eased;
      y = targetY + (playerY - targetY) * eased;
      alpha = 1 - progress * 0.35;
    }

    context.globalAlpha = alpha;
    context.fillStyle =
      frame.stage === 'return' ? returnColor(progress) : '#ffffff';
    context.fillRect(
      x - particleSize / 2,
      y - particleSize / 2,
      particleSize,
      particleSize,
    );
  }
}

export function createCountdownRenderer({
  context,
  createCanvas = createDefaultCanvas,
  maxParticles = DEFAULT_MAX_PARTICLES,
}) {
  const templateCache = new Map();
  const particleLimit =
    Number.isFinite(maxParticles) && maxParticles > 0
      ? Math.floor(maxParticles)
      : DEFAULT_MAX_PARTICLES;

  return {
    draw({
      frame,
      centerX,
      centerY,
      playerX,
      playerY,
      fontSize,
    }) {
      context.save();
      try {
        if (!frame || frame.digit === null) {
          return;
        }

        const roundedFontSize = Math.max(
          1,
          Math.round(Number.isFinite(fontSize) ? fontSize : 1),
        );
        const cacheKey = frame.digit;
        if (!templateCache.has(cacheKey)) {
          templateCache.set(
            cacheKey,
            sampleDigit(
              createCanvas,
              frame.digit,
              particleLimit,
            ),
          );
        }

        const points = templateCache.get(cacheKey);
        const drawOptions = {
          frame,
          centerX,
          centerY,
          playerX,
          playerY,
          fontSize: roundedFontSize,
        };

        if (!points || points.length === 0) {
          drawFallback(context, drawOptions);
          return;
        }

        drawParticles(context, { ...drawOptions, points });
      } finally {
        context.restore();
      }
    },
  };
}
