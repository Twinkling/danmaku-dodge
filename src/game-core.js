export const FIXED_STEP = 1 / 60;
export const MAX_FRAME_TIME = 0.1;
export const MAX_STEPS_PER_FRAME = 6;
export const INITIAL_SPAWN_INTERVAL = 28 / 60;
export const MIN_SPAWN_INTERVAL = 5 / 60;
export const SPAWN_INTERVAL_DECREASE = 0.22 / 60;

const KEYBOARD_SPEED_FACTOR = 0.65;
const POINTER_FOLLOW_RATE = -Math.log(1 - 0.22) * 60;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 1;
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

export function stepGame(state, deltaTime, input, random = Math.random) {
  if (state.phase !== 'running') {
    return state;
  }

  const validDeltaTime =
    Number.isFinite(deltaTime) && deltaTime >= 0 ? deltaTime : 0;
  updatePlayer(state, validDeltaTime, input);
  state.elapsed += validDeltaTime;

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
