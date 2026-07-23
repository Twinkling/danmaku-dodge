export const FIXED_STEP = 1 / 60;
export const MAX_FRAME_TIME = 0.1;
export const MAX_STEPS_PER_FRAME = 6;
export const INITIAL_SPAWN_INTERVAL = 28 / 60;
export const MIN_SPAWN_INTERVAL = 5 / 60;
export const SPAWN_INTERVAL_DECREASE = 0.22 / 60;
export const OPENING_PROTECTION_SECONDS = 3;

const KEYBOARD_SPEED_FACTOR = 0.65;
const POINTER_FOLLOW_RATE = -Math.log(1 - 0.22) * 60;
const MAX_LOGICAL_DIMENSION = 100_000;

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

function spawnEnemy(state, random) {
  const shortEdge = Math.min(state.width, state.height);
  const margin = shortEdge * 0.05;
  const side = Math.floor(random() * 4);
  let x;
  let y;

  if (side === 0) {
    x = random() * state.width;
    y = -margin;
  } else if (side === 1) {
    x = state.width + margin;
    y = random() * state.height;
  } else if (side === 2) {
    x = random() * state.width;
    y = state.height + margin;
  } else {
    x = -margin;
    y = random() * state.height;
  }

  const dx =
    state.player.x - x + (random() - 0.5) * shortEdge * 0.25;
  const dy =
    state.player.y - y + (random() - 0.5) * shortEdge * 0.25;
  const distance = Math.hypot(dx, dy) || 1;
  const baseSpeed = shortEdge * 0.006 * 60;
  const speed = baseSpeed + random() * baseSpeed * 1.5;

  state.enemies.push({
    x,
    y,
    vx: (dx / distance) * speed,
    vy: (dy / distance) * speed,
    size: shortEdge * (0.01 + random() * 0.016),
    color: `hsl(${random() * 360}, 80%, 55%)`,
  });
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
  state.spawnElapsed += deltaTime;

  if (state.spawnElapsed + 1e-9 >= state.spawnInterval) {
    state.spawnElapsed = Math.max(
      0,
      state.spawnElapsed - state.spawnInterval,
    );
    spawnEnemy(state, random);
    state.spawnInterval = Math.max(
      MIN_SPAWN_INTERVAL,
      state.spawnInterval - SPAWN_INTERVAL_DECREASE,
    );
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
    elapsed: 0,
    spawnElapsed: 0,
    spawnInterval: INITIAL_SPAWN_INTERVAL,
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

export function startGame(state) {
  state.phase = 'running';
  state.accumulator = 0;
  state.player = {
    x: state.width / 2,
    y: state.height / 2,
    size: playerSize(state.width, state.height),
  };
  state.enemies = [];
  state.particles = [];
  state.elapsed = 0;
  state.spawnElapsed = 0;
  state.spawnInterval = INITIAL_SPAWN_INTERVAL;
  state.shake = 0;
  state.finalScore = 0;
  state.bestScoreAtStart = state.bestScore;
  state.isNewRecord = false;

  return state;
}

export function stepGame(state, deltaTime, input = {}, random = Math.random) {
  const safeDeltaTime =
    Number.isFinite(deltaTime) && deltaTime >= 0 ? deltaTime : 0;

  if (state.phase === 'running') {
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
