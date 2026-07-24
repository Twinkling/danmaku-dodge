export const FIXED_STEP = 1 / 60;
export const MAX_FRAME_TIME = 0.1;
export const MAX_STEPS_PER_FRAME = 6;
export const OPENING_PROTECTION_SECONDS = 3;
export const COUNTDOWN_DIGIT_SECONDS = 1.6;
export const COUNTDOWN_TRANSFER_SECONDS = 0.8;
export const COUNTDOWN_SECONDS = 5.6;

const KEYBOARD_SPEED_FACTOR = 0.65;
const POINTER_FOLLOW_RATE = -Math.log(1 - 0.22) * 60;
const MAX_LOGICAL_DIMENSION = 100_000;
const MIN_SPAWN_DISTANCE_FACTOR = 0.2;
const MAX_SPAWN_ATTEMPTS = 8;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function interpolate(value, start, end, from, to) {
  const progress = clamp((value - start) / (end - start), 0, 1);
  return from + (to - from) * progress;
}

export function getDifficulty(elapsedSeconds) {
  const elapsed =
    Number.isFinite(elapsedSeconds) && elapsedSeconds >= 0 ? elapsedSeconds : 0;

  if (elapsed < OPENING_PROTECTION_SECONDS) {
    return {
      protected: true,
      spawnInterval: Number.POSITIVE_INFINITY,
      speedMultiplier: 0,
      enemyCap: 0,
    };
  }

  if (elapsed < 20) {
    return {
      protected: false,
      spawnInterval: interpolate(
        elapsed,
        OPENING_PROTECTION_SECONDS,
        20,
        1.4,
        0.9,
      ),
      speedMultiplier: interpolate(
        elapsed,
        OPENING_PROTECTION_SECONDS,
        20,
        0.45,
        0.7,
      ),
      enemyCap: 6,
    };
  }

  if (elapsed < 55) {
    return {
      protected: false,
      spawnInterval: interpolate(elapsed, 20, 55, 0.9, 0.55),
      speedMultiplier: interpolate(elapsed, 20, 55, 0.7, 1),
      enemyCap: 12,
    };
  }

  if (elapsed < 90) {
    return {
      protected: false,
      spawnInterval: interpolate(elapsed, 55, 90, 0.55, 0.32),
      speedMultiplier: interpolate(elapsed, 55, 90, 1, 1.3),
      enemyCap: 18,
    };
  }

  return {
    protected: false,
    spawnInterval: 0.32,
    speedMultiplier: 1.3,
    enemyCap: 18,
  };
}

function clampPlayerAxis(value, size, extent) {
  return extent <= 2 * size ? extent / 2 : clamp(value, size, extent - size);
}

function updatePlayer(state, deltaTime, input) {
  if (input?.mode === 'keyboard') {
    const horizontal = Number(Boolean(input.right)) - Number(Boolean(input.left));
    const vertical = Number(Boolean(input.down)) - Number(Boolean(input.up));
    const directionLength = Math.hypot(horizontal, vertical);

    if (directionLength > 0) {
      const speed = Math.min(state.width, state.height) * KEYBOARD_SPEED_FACTOR;
      state.player.x += (horizontal / directionLength) * speed * deltaTime;
      state.player.y += (vertical / directionLength) * speed * deltaTime;
    }
  } else if (
    input?.mode === 'pointer' &&
    input.pointerActive &&
    Number.isFinite(input.pointerX) &&
    Number.isFinite(input.pointerY)
  ) {
    const alpha = 1 - Math.exp(-POINTER_FOLLOW_RATE * deltaTime);
    state.player.x += (input.pointerX - state.player.x) * alpha;
    state.player.y += (input.pointerY - state.player.y) * alpha;
  }

  state.player.x = clampPlayerAxis(
    state.player.x,
    state.player.size,
    state.width,
  );
  state.player.y = clampPlayerAxis(
    state.player.y,
    state.player.size,
    state.height,
  );
}

function createSpawnPoint(state, random, margin) {
  const side = Math.floor(random() * 4);
  const offset = random();

  if (side === 0) {
    return { x: offset * state.width, y: -margin };
  }
  if (side === 1) {
    return { x: state.width + margin, y: offset * state.height };
  }
  if (side === 2) {
    return { x: offset * state.width, y: state.height + margin };
  }
  return { x: -margin, y: offset * state.height };
}

function spawnEnemy(state, random, speedMultiplier) {
  const shortEdge = Math.min(state.width, state.height);
  const margin = shortEdge * 0.05;
  const minimumDistance = shortEdge * MIN_SPAWN_DISTANCE_FACTOR;
  let spawnPoint;

  for (let attempt = 0; attempt < MAX_SPAWN_ATTEMPTS; attempt += 1) {
    const candidate = createSpawnPoint(state, random, margin);
    if (
      Math.hypot(
        candidate.x - state.player.x,
        candidate.y - state.player.y,
      ) >= minimumDistance
    ) {
      spawnPoint = candidate;
      break;
    }
  }

  if (!spawnPoint) {
    return false;
  }

  const dx =
    state.player.x - spawnPoint.x + (random() - 0.5) * shortEdge * 0.25;
  const dy =
    state.player.y - spawnPoint.y + (random() - 0.5) * shortEdge * 0.25;
  const distance = Math.hypot(dx, dy) || 1;
  const baseSpeed = shortEdge * 0.006 * 60;
  const speed =
    (baseSpeed + random() * baseSpeed * 1.5) * speedMultiplier;

  state.enemies.push({
    x: spawnPoint.x,
    y: spawnPoint.y,
    vx: (dx / distance) * speed,
    vy: (dy / distance) * speed,
    size: shortEdge * (0.01 + random() * 0.016),
    color: `hsl(${random() * 360}, 80%, 55%)`,
  });

  return true;
}

function createParticles(state, random, count = 35) {
  const shortEdge = Math.min(state.width, state.height);
  const baseSpeed = shortEdge * 0.004 * 60;

  for (let index = 0; index < count; index += 1) {
    const angle = random() * Math.PI * 2;
    const speed = baseSpeed + random() * baseSpeed * 3;

    state.particles.push({
      x: state.player.x,
      y: state.player.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      size: shortEdge * (0.005 + random() * 0.01),
    });
  }
}

function endGame(state, random) {
  state.phase = 'gameover';
  state.finalScore = Math.floor(state.elapsed);
  state.isNewRecord = state.finalScore > state.bestScoreAtStart;

  if (state.isNewRecord) {
    state.bestScore = state.finalScore;
  }

  state.shake = Math.min(state.width, state.height) * 0.03;
  createParticles(state, random);
}

function updateEnemies(state, deltaTime, random) {
  const difficulty = getDifficulty(state.elapsed);
  if (difficulty.protected) {
    state.spawnElapsed = 0;
  } else if (state.enemies.length >= difficulty.enemyCap) {
    state.spawnElapsed = 0;
  } else {
    state.spawnElapsed += deltaTime;
    if (state.spawnElapsed + 1e-9 >= difficulty.spawnInterval) {
      state.spawnElapsed = Math.max(
        0,
        state.spawnElapsed - difficulty.spawnInterval,
      );
      if (!spawnEnemy(state, random, difficulty.speedMultiplier)) {
        state.spawnElapsed = 0;
      }
    }
  }

  const margin = Math.max(state.width, state.height) * 0.2;
  let collided = false;

  for (let index = state.enemies.length - 1; index >= 0; index -= 1) {
    const enemy = state.enemies[index];
    enemy.x += enemy.vx * deltaTime;
    enemy.y += enemy.vy * deltaTime;

    if (
      enemy.x < -margin ||
      enemy.x > state.width + margin ||
      enemy.y < -margin ||
      enemy.y > state.height + margin
    ) {
      state.enemies.splice(index, 1);
    } else if (
      Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y) <
      state.player.size + enemy.size
    ) {
      collided = true;
    }
  }

  if (collided) {
    endGame(state, random);
  }
}

function updateEffects(state, deltaTime) {
  for (let index = state.particles.length - 1; index >= 0; index -= 1) {
    const particle = state.particles[index];
    particle.x += particle.vx * deltaTime;
    particle.y += particle.vy * deltaTime;
    particle.life -= 1.5 * deltaTime;

    if (particle.life <= 0) {
      state.particles.splice(index, 1);
    }
  }

  if (state.shake > 0) {
    state.shake *= Math.pow(0.87, deltaTime * 60);

    if (state.shake < 0.05) {
      state.shake = 0;
    }
  }
}

export function sanitizeBestScore(value) {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;

  return Number.isInteger(numericValue) && numericValue >= 0 ? numericValue : 0;
}

export function playerSize(width, height) {
  return Math.max(8, Math.min(width, height) * 0.018);
}

function sanitizeDimension(value) {
  return Number.isFinite(value) && value >= 1
    ? Math.min(value, MAX_LOGICAL_DIMENSION)
    : 1;
}

export function createGameState({ width, height, bestScore = 0 }) {
  const validWidth = sanitizeDimension(width);
  const validHeight = sanitizeDimension(height);
  const validBestScore = sanitizeBestScore(bestScore);

  return {
    width: validWidth,
    height: validHeight,
    phase: 'idle',
    accumulator: 0,
    player: {
      x: validWidth / 2,
      y: validHeight / 2,
      size: playerSize(validWidth, validHeight),
    },
    enemies: [],
    particles: [],
    countdownElapsed: 0,
    elapsed: 0,
    spawnElapsed: 0,
    shake: 0,
    finalScore: 0,
    bestScore: validBestScore,
    bestScoreAtStart: validBestScore,
    isNewRecord: false,
  };
}

export function resizeGame(state, width, height) {
  const safeWidth = sanitizeDimension(width);
  const safeHeight = sanitizeDimension(height);
  const xRatio = safeWidth / state.width;
  const yRatio = safeHeight / state.height;
  const sizeRatio =
    Math.min(safeWidth, safeHeight) / Math.min(state.width, state.height);

  state.player.x *= xRatio;
  state.player.y *= yRatio;
  state.player.size = playerSize(safeWidth, safeHeight);

  for (const enemy of state.enemies) {
    enemy.x *= xRatio;
    enemy.y *= yRatio;
    enemy.vx *= sizeRatio;
    enemy.vy *= sizeRatio;
    enemy.size *= sizeRatio;
  }

  for (const particle of state.particles) {
    particle.x *= xRatio;
    particle.y *= yRatio;
    particle.vx *= sizeRatio;
    particle.vy *= sizeRatio;
    particle.size *= sizeRatio;
  }

  state.shake *= sizeRatio;
  state.width = safeWidth;
  state.height = safeHeight;
  state.player.x = clampPlayerAxis(
    state.player.x,
    state.player.size,
    state.width,
  );
  state.player.y = clampPlayerAxis(
    state.player.y,
    state.player.size,
    state.height,
  );

  return state;
}

function resetRound(state) {
  state.player = {
    x: state.width / 2,
    y: state.height / 2,
    size: playerSize(state.width, state.height),
  };
  state.enemies = [];
  state.particles = [];
  state.elapsed = 0;
  state.spawnElapsed = 0;
  state.shake = 0;
  state.finalScore = 0;
  state.bestScoreAtStart = state.bestScore;
  state.isNewRecord = false;
}

export function startCountdown(state) {
  state.phase = 'countdown';
  state.accumulator = 0;
  state.countdownElapsed = 0;
  resetRound(state);

  return state;
}

export function startGame(state) {
  state.phase = 'running';
  state.accumulator = 0;
  state.countdownElapsed = COUNTDOWN_SECONDS;
  resetRound(state);

  return state;
}

export function stepGame(state, deltaTime, input = {}, random = Math.random) {
  const safeDeltaTime =
    Number.isFinite(deltaTime) && deltaTime >= 0 ? deltaTime : 0;

  if (state.phase === 'countdown') {
    state.countdownElapsed = Math.min(
      COUNTDOWN_SECONDS,
      state.countdownElapsed + safeDeltaTime,
    );

    if (state.countdownElapsed + 1e-9 >= COUNTDOWN_SECONDS) {
      state.countdownElapsed = COUNTDOWN_SECONDS;
      state.phase = 'running';
      state.elapsed = 0;
      state.spawnElapsed = 0;
    }
  } else if (state.phase === 'running') {
    updatePlayer(state, safeDeltaTime, input);
    state.elapsed += safeDeltaTime;
    updateEnemies(state, safeDeltaTime, random);
  }

  updateEffects(state, safeDeltaTime);

  return state;
}

export function advanceGame(state, elapsedTime, input, random = Math.random) {
  const frameTime = Number.isFinite(elapsedTime)
    ? clamp(elapsedTime, 0, MAX_FRAME_TIME)
    : 0;
  state.accumulator += frameTime;

  let steps = 0;
  while (
    state.accumulator + 1e-9 >= FIXED_STEP &&
    steps < MAX_STEPS_PER_FRAME
  ) {
    stepGame(state, FIXED_STEP, input, random);
    state.accumulator = Math.max(0, state.accumulator - FIXED_STEP);
    steps += 1;
  }

  if (
    steps === MAX_STEPS_PER_FRAME &&
    state.accumulator + 1e-9 >= FIXED_STEP
  ) {
    state.accumulator = 0;
  }

  return state;
}
