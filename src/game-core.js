export const FIXED_STEP = 1 / 60;
export const INITIAL_SPAWN_INTERVAL = 28 / 60;
export const MIN_SPAWN_INTERVAL = 5 / 60;
export const SPAWN_INTERVAL_DECREASE = 0.22 / 60;

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

function validDimension(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 1;
}

export function createGameState({ width, height, bestScore = 0 }) {
  const validWidth = validDimension(width);
  const validHeight = validDimension(height);
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
