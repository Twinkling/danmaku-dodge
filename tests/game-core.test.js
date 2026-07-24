import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COUNTDOWN_DIGIT_SECONDS,
  COUNTDOWN_SECONDS,
  COUNTDOWN_TRANSFER_SECONDS,
  FIXED_STEP,
  OPENING_PROTECTION_SECONDS,
  advanceGame,
  createGameState,
  getDifficulty,
  playerSize,
  resizeGame,
  startCountdown,
  startGame,
  stepGame,
} from '../src/game-core.js';

const MAX_LOGICAL_DIMENSION = 100_000;

const keyboardRight = {
  mode: 'keyboard',
  left: false,
  right: true,
  up: false,
  down: false,
  pointerActive: false,
};

const noInput = {
  ...keyboardRight,
  right: false,
};

function simulateAtRate(rate) {
  const state = createGameState({ width: 1600, height: 600 });
  startGame(state);

  for (let frame = 0; frame < rate; frame += 1) {
    advanceGame(state, 1 / rate, keyboardRight, () => 0.5);
  }

  return state;
}

function assertClose(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

function spawnOneEnemyAt(elapsed, randomValues) {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);
  state.elapsed = elapsed;
  state.spawnElapsed = getDifficulty(elapsed).spawnInterval;
  let randomIndex = 0;

  stepGame(state, 0, noInput, () => randomValues[randomIndex++]);

  assert.equal(state.enemies.length, 1);
  return { enemy: state.enemies[0], randomIndex, state };
}

function assertSpatialStateIsFinite(state) {
  for (const field of ['x', 'y', 'size']) {
    assert.equal(Number.isFinite(state.player[field]), true);
  }
  for (const entity of [...state.enemies, ...state.particles]) {
    for (const field of ['x', 'y', 'vx', 'vy', 'size']) {
      assert.equal(Number.isFinite(entity[field]), true);
    }
  }
  assert.equal(Number.isFinite(state.shake), true);
}

test('OPENING_PROTECTION_SECONDS 定义为 3 秒', () => {
  assert.equal(OPENING_PROTECTION_SECONDS, 3);
});

test('倒计时常量定义为指定秒数', () => {
  assert.equal(COUNTDOWN_DIGIT_SECONDS, 1.6);
  assert.equal(COUNTDOWN_TRANSFER_SECONDS, 0.8);
  assert.equal(COUNTDOWN_SECONDS, 5.6);
});

test('getDifficulty 按时间返回连续分段难度', () => {
  const cases = [
    [0, true, Number.POSITIVE_INFINITY, 0, 0],
    [2.999, true, Number.POSITIVE_INFINITY, 0, 0],
    [3, false, 1.4, 0.45, 6],
    [11.5, false, 1.15, 0.575, 6],
    [20, false, 0.9, 0.7, 12],
    [37.5, false, 0.725, 0.85, 12],
    [55, false, 0.55, 1, 18],
    [72.5, false, 0.435, 1.15, 18],
    [90, false, 0.32, 1.3, 18],
    [300, false, 0.32, 1.3, 18],
  ];

  for (const [
    elapsedSeconds,
    expectedProtected,
    expectedSpawnInterval,
    expectedSpeedMultiplier,
    expectedEnemyCap,
  ] of cases) {
    const difficulty = getDifficulty(elapsedSeconds);

    assert.deepEqual(Object.keys(difficulty).sort(), [
      'enemyCap',
      'protected',
      'spawnInterval',
      'speedMultiplier',
    ]);
    assert.equal(difficulty.protected, expectedProtected);
    if (Number.isFinite(expectedSpawnInterval)) {
      assertClose(difficulty.spawnInterval, expectedSpawnInterval);
    } else {
      assert.equal(difficulty.spawnInterval, expectedSpawnInterval);
    }
    assertClose(difficulty.speedMultiplier, expectedSpeedMultiplier);
    assert.equal(difficulty.enemyCap, expectedEnemyCap);
  }
});

test('getDifficulty 将负数和非有限输入按 0 秒处理', () => {
  const protectionStart = getDifficulty(0);

  for (const elapsedSeconds of [
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    assert.deepEqual(getDifficulty(elapsedSeconds), protectionStart);
  }
});

test('createGameState 初始化空闲状态并规范化最高分', () => {
  const state = createGameState({ width: 800, height: 600, bestScore: -4 });

  assert.equal(state.phase, 'idle');
  assert.equal(state.width, 800);
  assert.equal(state.height, 600);
  assert.equal(state.bestScore, 0);
  assert.equal(state.player.x, 400);
  assert.equal(state.player.y, 300);
  assert.ok(Math.abs(state.player.size - 10.8) < Number.EPSILON * 10.8);
  assert.deepEqual(state.enemies, []);
  assert.deepEqual(state.particles, []);
  assert.equal(state.countdownElapsed, 0);
  assert.equal(createGameState({ width: 800, height: 600, bestScore: '7' }).bestScore, 7);
  assert.equal(createGameState({ width: 800, height: 600, bestScore: '7 秒' }).bestScore, 0);
});

test('createGameState 将非法尺寸回退为有限的最小状态', () => {
  const invalidDimensions = [
    { width: 0, height: -600 },
    { width: Number.NaN, height: Number.POSITIVE_INFINITY },
  ];

  for (const dimensions of invalidDimensions) {
    const state = createGameState(dimensions);

    assert.equal(state.width, 1);
    assert.equal(state.height, 1);
    assert.equal(Number.isFinite(state.player.x), true);
    assert.equal(Number.isFinite(state.player.y), true);
    assert.equal(Number.isFinite(state.player.size), true);
  }
});

test('createGameState 将极小正数尺寸规范为安全最小值', () => {
  const state = createGameState({
    width: Number.MIN_VALUE,
    height: Number.MIN_VALUE,
  });

  assert.equal(state.width, 1);
  assert.equal(state.height, 1);

  resizeGame(state, 1, 1);

  assertSpatialStateIsFinite(state);
});

test('createGameState 将超大尺寸限制到逻辑上界', () => {
  const state = createGameState({
    width: Number.MAX_VALUE,
    height: Number.MAX_VALUE,
  });

  assert.equal(state.width, MAX_LOGICAL_DIMENSION);
  assert.equal(state.height, MAX_LOGICAL_DIMENSION);
  assertSpatialStateIsFinite(state);
});

test('startGame 原地重置新一局状态并保留开局最高分', () => {
  const state = createGameState({ width: 800, height: 600, bestScore: 12 });
  state.phase = 'gameover';
  state.width = 640;
  state.height = 480;
  state.accumulator = 1;
  state.player = { x: 1, y: 2, size: 3 };
  state.enemies.push({ id: 'enemy' });
  state.particles.push({ id: 'particle' });
  state.elapsed = 9;
  state.spawnElapsed = 4;
  state.shake = 3;
  state.finalScore = 8;
  state.bestScore = 15;
  state.bestScoreAtStart = 12;
  state.isNewRecord = true;

  const result = startGame(state);

  assert.strictEqual(result, state);
  assert.equal(state.phase, 'running');
  assert.equal(state.accumulator, 0);
  assert.equal(state.countdownElapsed, COUNTDOWN_SECONDS);
  assert.equal(state.player.x, 320);
  assert.equal(state.player.y, 240);
  assert.ok(Math.abs(state.player.size - 8.64) < Number.EPSILON * 8.64);
  assert.deepEqual(state.enemies, []);
  assert.deepEqual(state.particles, []);
  assert.equal(state.elapsed, 0);
  assert.equal(state.spawnElapsed, 0);
  assert.equal(state.shake, 0);
  assert.equal(state.finalScore, 0);
  assert.equal(state.bestScore, 15);
  assert.equal(state.bestScoreAtStart, 15);
  assert.equal(state.isNewRecord, false);
});

test('startCountdown 原地重置新一局状态并保留开局最高分', () => {
  const state = createGameState({ width: 800, height: 600, bestScore: 9 });
  state.phase = 'gameover';
  state.accumulator = 0.4;
  state.player = { x: 123, y: 456, size: 7 };
  state.elapsed = 12.7;
  state.spawnElapsed = 0.6;
  state.shake = 12;
  state.finalScore = 12;
  state.bestScore = 9;
  state.enemies.push({ id: 'enemy' });
  state.particles.push({ id: 'particle' });
  state.isNewRecord = true;

  const result = startCountdown(state);

  assert.strictEqual(result, state);
  assert.equal(state.phase, 'countdown');
  assert.equal(state.accumulator, 0);
  assert.equal(state.countdownElapsed, 0);
  assert.equal(state.elapsed, 0);
  assert.equal(state.spawnElapsed, 0);
  assert.equal(state.finalScore, 0);
  assert.deepEqual(state.enemies, []);
  assert.deepEqual(state.particles, []);
  assert.equal(state.player.x, 400);
  assert.equal(state.player.y, 300);
  assert.equal(state.player.size, playerSize(800, 600));
  assert.equal(state.shake, 0);
  assert.equal(state.bestScore, 9);
  assert.equal(state.bestScoreAtStart, 9);
  assert.equal(state.isNewRecord, false);
});

test('倒计时期间冻结计分、刷怪和玩家移动', () => {
  const state = createGameState({ width: 800, height: 600 });
  startCountdown(state);
  state.enemies.push({
    x: 100,
    y: 100,
    vx: 120,
    vy: 60,
    size: 10,
  });
  const enemiesBeforeCountdown = structuredClone(state.enemies);

  stepGame(
    state,
    COUNTDOWN_SECONDS - FIXED_STEP,
    { ...keyboardRight, down: true },
    () => 0.5,
  );

  assert.equal(state.phase, 'countdown');
  assertClose(state.countdownElapsed, COUNTDOWN_SECONDS - FIXED_STEP);
  assert.equal(state.elapsed, 0);
  assert.equal(state.spawnElapsed, 0);
  assert.equal(state.player.x, 400);
  assert.equal(state.player.y, 300);
  assert.deepEqual(state.enemies, enemiesBeforeCountdown);
});

test('倒计时边界只切换阶段并在下一固定步开始游戏', () => {
  const state = createGameState({ width: 800, height: 600 });
  startCountdown(state);
  const input = { ...keyboardRight, down: true };

  stepGame(state, COUNTDOWN_SECONDS - FIXED_STEP, input, () => 0.5);
  stepGame(state, FIXED_STEP, input, () => 0.5);

  assert.equal(state.phase, 'running');
  assert.equal(state.countdownElapsed, COUNTDOWN_SECONDS);
  assert.equal(state.elapsed, 0);
  assert.equal(state.spawnElapsed, 0);
  assert.equal(state.player.x, 400);
  assert.equal(state.player.y, 300);
  assert.deepEqual(state.enemies, []);

  stepGame(state, FIXED_STEP, input, () => 0.5);

  assert.equal(state.elapsed, FIXED_STEP);
  assert.ok(state.player.x > 400);
});

test('resizeGame 按新旧画布比例迁移空间状态', () => {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);
  state.player.x = 200;
  state.player.y = 150;
  state.enemies.push({
    x: 100,
    y: 90,
    vx: 120,
    vy: 60,
    size: 12,
    color: '',
  });
  state.particles.push({
    x: 300,
    y: 200,
    vx: 30,
    vy: 15,
    size: 6,
    life: 1,
  });
  state.shake = 12;

  resizeGame(state, 400, 300);

  assert.equal(state.width, 400);
  assert.equal(state.height, 300);
  assert.deepEqual(state.player, { x: 100, y: 75, size: 8 });
  assert.deepEqual(state.enemies[0], {
    x: 50,
    y: 45,
    vx: 60,
    vy: 30,
    size: 6,
    color: '',
  });
  assert.deepEqual(state.particles[0], {
    x: 150,
    y: 100,
    vx: 15,
    vy: 7.5,
    size: 3,
    life: 1,
  });
  assert.equal(state.shake, 6);
});

test('resizeGame 将非法或极小目标尺寸规范为有限的最小状态', () => {
  const state = createGameState({ width: 320, height: 240 });
  state.enemies.push({
    x: 80,
    y: 60,
    vx: 120,
    vy: 60,
    size: 12,
    color: '',
  });
  state.particles.push({
    x: 160,
    y: 120,
    vx: 30,
    vy: 15,
    size: 6,
    life: 1,
  });
  state.shake = 12;

  resizeGame(state, 0, Number.POSITIVE_INFINITY);

  assert.equal(state.width, 1);
  assert.equal(state.height, 1);
  assert.equal(state.player.x, 0.5);
  assert.equal(state.player.y, 0.5);
  assert.equal(Number.isFinite(state.shake), true);
  assert.equal(state.shake, 12 / 240);
  assertSpatialStateIsFinite(state);
});

test('resizeGame 往返极小正数尺寸时始终保持空间状态有限', () => {
  const state = createGameState({ width: 320, height: 240 });
  state.enemies.push({
    x: 80,
    y: 60,
    vx: 120,
    vy: 60,
    size: 12,
    color: '',
  });
  state.particles.push({
    x: 160,
    y: 120,
    vx: 30,
    vy: 15,
    size: 6,
    life: 1,
  });
  state.shake = 12;

  for (const [width, height] of [
    [Number.MIN_VALUE, Number.MIN_VALUE],
    [320, 240],
  ]) {
    resizeGame(state, width, height);

    assert.ok(state.width >= 1);
    assert.ok(state.height >= 1);
    assertSpatialStateIsFinite(state);
  }
});

test('resizeGame 从最小尺寸放大到逻辑上界时空间状态保持有限', () => {
  const state = createGameState({ width: 1, height: 1 });
  state.enemies.push({
    x: 1,
    y: 1,
    vx: 2,
    vy: 2,
    size: 2,
    color: '',
  });
  state.particles.push({
    x: 1,
    y: 1,
    vx: 2,
    vy: 2,
    size: 2,
    life: 1,
  });
  state.shake = 2;

  resizeGame(state, Number.MAX_VALUE, Number.MAX_VALUE);

  assert.equal(state.width, MAX_LOGICAL_DIMENSION);
  assert.equal(state.height, MAX_LOGICAL_DIMENSION);
  assertSpatialStateIsFinite(state);
});

test('resizeGame 往返超大尺寸时始终保持空间状态有限', () => {
  const state = createGameState({ width: 320, height: 240 });
  state.enemies.push({
    x: 80,
    y: 60,
    vx: 1000,
    vy: 800,
    size: 12,
    color: '',
  });
  state.particles.push({
    x: 160,
    y: 120,
    vx: 900,
    vy: 700,
    size: 6,
    life: 1,
  });
  state.shake = 1000;

  resizeGame(state, Number.MAX_VALUE, Number.MAX_VALUE);

  assert.equal(state.width, MAX_LOGICAL_DIMENSION);
  assert.equal(state.height, MAX_LOGICAL_DIMENSION);
  assertSpatialStateIsFinite(state);

  resizeGame(state, 320, 240);

  assert.equal(state.width, 320);
  assert.equal(state.height, 240);
  assertSpatialStateIsFinite(state);
});

test('resizeGame 原地更新实体并保持生命周期状态', () => {
  const state = createGameState({ width: 800, height: 600, bestScore: 9 });
  startGame(state);
  state.elapsed = 8.25;
  state.spawnElapsed = 0.12;
  state.finalScore = 8;
  state.bestScore = 9;
  state.bestScoreAtStart = 9;
  state.isNewRecord = true;
  state.accumulator = 0.007;
  state.countdownElapsed = 2.4;
  state.enemies.push({
    x: 100,
    y: 90,
    vx: 120,
    vy: 60,
    size: 12,
    color: '',
  });
  state.particles.push({
    x: 300,
    y: 200,
    vx: 30,
    vy: 15,
    size: 6,
    life: 1,
  });
  const player = state.player;
  const enemies = state.enemies;
  const particles = state.particles;
  const enemy = state.enemies[0];
  const particle = state.particles[0];
  const lifecycle = {
    phase: state.phase,
    elapsed: state.elapsed,
    spawnElapsed: state.spawnElapsed,
    finalScore: state.finalScore,
    bestScore: state.bestScore,
    bestScoreAtStart: state.bestScoreAtStart,
    isNewRecord: state.isNewRecord,
    accumulator: state.accumulator,
    countdownElapsed: state.countdownElapsed,
  };

  const result = resizeGame(state, 640, 480);

  assert.strictEqual(result, state);
  assert.strictEqual(state.player, player);
  assert.strictEqual(state.enemies, enemies);
  assert.strictEqual(state.particles, particles);
  assert.strictEqual(state.enemies[0], enemy);
  assert.strictEqual(state.particles[0], particle);
  assert.deepEqual(
    {
      phase: state.phase,
      elapsed: state.elapsed,
      spawnElapsed: state.spawnElapsed,
      finalScore: state.finalScore,
      bestScore: state.bestScore,
      bestScoreAtStart: state.bestScoreAtStart,
      isNewRecord: state.isNewRecord,
      accumulator: state.accumulator,
      countdownElapsed: state.countdownElapsed,
    },
    lifecycle,
  );
});

test('resizeGame 重复应用同一尺寸不会累积空间状态误差', () => {
  const state = createGameState({ width: 800, height: 600 });
  state.player.x = 200;
  state.player.y = 150;
  state.enemies.push({
    x: 100,
    y: 90,
    vx: 120,
    vy: 60,
    size: 12,
    color: '',
  });
  state.particles.push({
    x: 300,
    y: 200,
    vx: 30,
    vy: 15,
    size: 6,
    life: 1,
  });
  state.shake = 12;

  for (let resizeCount = 0; resizeCount < 3; resizeCount += 1) {
    resizeGame(state, 800, 600);
  }

  assertClose(state.player.x, 200);
  assertClose(state.player.y, 150);
  assertClose(state.player.size, 10.8);
  assertClose(state.enemies[0].x, 100);
  assertClose(state.enemies[0].y, 90);
  assertClose(state.enemies[0].vx, 120);
  assertClose(state.enemies[0].vy, 60);
  assertClose(state.enemies[0].size, 12);
  assertClose(state.particles[0].x, 300);
  assertClose(state.particles[0].y, 200);
  assertClose(state.particles[0].vx, 30);
  assertClose(state.particles[0].vy, 15);
  assertClose(state.particles[0].size, 6);
  assertClose(state.shake, 12);
});

test('resizeGame 横竖尺寸往返不会累积空间状态误差', () => {
  const state = createGameState({ width: 800, height: 600 });
  state.player.x = 200;
  state.player.y = 150;
  state.enemies.push({
    x: 100,
    y: 90,
    vx: 120,
    vy: 60,
    size: 12,
    color: '',
  });
  state.particles.push({
    x: 300,
    y: 200,
    vx: 30,
    vy: 15,
    size: 6,
    life: 1,
  });
  state.shake = 12;

  resizeGame(state, 600, 800);
  resizeGame(state, 800, 600);

  assertClose(state.player.x, 200);
  assertClose(state.player.y, 150);
  assertClose(state.player.size, 10.8);
  assertClose(state.enemies[0].x, 100);
  assertClose(state.enemies[0].y, 90);
  assertClose(state.enemies[0].vx, 120);
  assertClose(state.enemies[0].vy, 60);
  assertClose(state.enemies[0].size, 12);
  assertClose(state.particles[0].x, 300);
  assertClose(state.particles[0].y, 200);
  assertClose(state.particles[0].vx, 30);
  assertClose(state.particles[0].vy, 15);
  assertClose(state.particles[0].size, 6);
  assertClose(state.shake, 12);
});

test('固定时间步长让不同刷新率的一秒模拟保持一致', () => {
  const at60 = simulateAtRate(60);
  const at120 = simulateAtRate(120);
  const at144 = simulateAtRate(144);

  assert.ok(Math.abs(at60.elapsed - 1) <= FIXED_STEP);
  assert.ok(Math.abs(at60.elapsed - at120.elapsed) <= FIXED_STEP);
  assert.ok(Math.abs(at60.elapsed - at144.elapsed) <= FIXED_STEP);
  assert.ok(Math.abs(at120.elapsed - at144.elapsed) <= FIXED_STEP);
  assert.ok(Math.abs(at60.player.x - at120.player.x) < 0.001);
  assert.ok(Math.abs(at60.player.x - at144.player.x) < 0.001);
  assert.ok(Math.abs(at120.player.x - at144.player.x) < 0.001);
});

test('玩家移动始终限制在游戏边界内', () => {
  const state = createGameState({ width: 320, height: 240 });
  startGame(state);
  state.player.x = state.width - state.player.size;

  stepGame(state, 1, keyboardRight, () => 0.5);

  assert.equal(state.player.x, state.width - state.player.size);
});

test('指针目标缺失或非有限时整次忽略移动', () => {
  const invalidPointerInputs = [
    { mode: 'pointer', pointerActive: true, pointerX: 600 },
    { mode: 'pointer', pointerActive: true, pointerY: 500 },
    { mode: 'pointer', pointerActive: true, pointerX: Number.NaN, pointerY: 500 },
    {
      mode: 'pointer',
      pointerActive: true,
      pointerX: 600,
      pointerY: Number.POSITIVE_INFINITY,
    },
  ];

  for (const input of invalidPointerInputs) {
    const state = createGameState({ width: 800, height: 600 });
    startGame(state);
    const initialX = state.player.x;
    const initialY = state.player.y;

    stepGame(state, FIXED_STEP, input, () => 0.5);

    assert.equal(Number.isFinite(state.player.x), true);
    assert.equal(Number.isFinite(state.player.y), true);
    assert.equal(state.player.x, initialX);
    assert.equal(state.player.y, initialY);
  }
});

test('stepGame 忽略非有限或负数时间', () => {
  const invalidDeltaTimes = [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -FIXED_STEP,
  ];

  for (const deltaTime of invalidDeltaTimes) {
    const state = createGameState({ width: 800, height: 600 });
    startGame(state);
    const initialX = state.player.x;
    const initialY = state.player.y;

    stepGame(state, deltaTime, keyboardRight, () => 0.5);

    assert.equal(state.elapsed, 0);
    assert.equal(state.player.x, initialX);
    assert.equal(state.player.y, initialY);
  }
});

test('无法容纳玩家直径的轴固定在画布中心', () => {
  const state = createGameState({ width: 1, height: 1 });
  startGame(state);

  stepGame(state, FIXED_STEP, noInput, () => 0.5);

  assert.equal(state.player.x, 0.5);
  assert.equal(state.player.y, 0.5);
});

test('advanceGame 累积两个半步后恰好推进一个固定步长', () => {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);
  const initialX = state.player.x;

  advanceGame(state, FIXED_STEP / 2, keyboardRight, () => 0.5);

  assert.equal(state.elapsed, 0);
  assert.equal(state.player.x, initialX);

  advanceGame(state, FIXED_STEP / 2, keyboardRight, () => 0.5);

  assert.ok(Math.abs(state.elapsed - FIXED_STEP) < 1e-12);
  assert.equal(state.accumulator, 0);
  assert.ok(state.player.x > initialX);
});

test('advanceGame 达到最大步数后丢弃剩余积压', () => {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);
  state.accumulator = FIXED_STEP;

  advanceGame(state, 1, noInput, () => 0.5);

  assert.ok(Math.abs(state.elapsed - 0.1) < 1e-12);
  assert.equal(state.accumulator, 0);
});

test('idle 和 gameover 阶段冻结 stepGame 的时间和玩家位置', () => {
  for (const phase of ['idle', 'gameover']) {
    const state = createGameState({ width: 800, height: 600 });
    state.phase = phase;
    const initialX = state.player.x;
    const initialY = state.player.y;

    stepGame(state, FIXED_STEP, keyboardRight, () => 0.5);

    assert.equal(state.elapsed, 0);
    assert.equal(state.player.x, initialX);
    assert.equal(state.player.y, initialY);
  }
});

test('键盘斜向移动与单轴移动速度一致', () => {
  const axisState = createGameState({ width: 1600, height: 600 });
  const diagonalState = createGameState({ width: 1600, height: 600 });
  startGame(axisState);
  startGame(diagonalState);
  const axisStart = { x: axisState.player.x, y: axisState.player.y };
  const diagonalStart = {
    x: diagonalState.player.x,
    y: diagonalState.player.y,
  };

  stepGame(axisState, FIXED_STEP, keyboardRight, () => 0.5);
  stepGame(
    diagonalState,
    FIXED_STEP,
    { ...keyboardRight, down: true },
    () => 0.5,
  );

  const axisDistance = Math.hypot(
    axisState.player.x - axisStart.x,
    axisState.player.y - axisStart.y,
  );
  const diagonalDistance = Math.hypot(
    diagonalState.player.x - diagonalStart.x,
    diagonalState.player.y - diagonalStart.y,
  );
  assert.ok(Math.abs(axisDistance - diagonalDistance) < 1e-12);
});

test('指针模式每个固定步长跟随约百分之二十二的剩余距离', () => {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);
  const initialX = state.player.x;
  const targetX = 600;

  stepGame(
    state,
    FIXED_STEP,
    {
      mode: 'pointer',
      pointerActive: true,
      pointerX: targetX,
      pointerY: state.player.y,
    },
    () => 0.5,
  );

  const expectedDistance = (targetX - initialX) * 0.22;
  assert.ok(Math.abs(state.player.x - initialX - expectedDistance) < 1e-12);
  assert.equal(state.player.y, 300);
});

test('碰撞且严格超过开局最高分时记录新纪录并生成特效', () => {
  const state = createGameState({ width: 800, height: 600, bestScore: 4 });
  startGame(state);
  state.elapsed = 5.2;
  state.enemies.push({
    x: state.player.x,
    y: state.player.y,
    vx: 0,
    vy: 0,
    size: 10,
  });

  stepGame(state, FIXED_STEP, {}, () => 0.5);

  assert.equal(state.phase, 'gameover');
  assert.equal(state.finalScore, 5);
  assert.equal(state.bestScore, 5);
  assert.equal(state.isNewRecord, true);
  assert.equal(state.particles.length, 35);
  assert.ok(state.shake > 0);
});

test('碰撞后追平开局最高分不算新纪录', () => {
  const state = createGameState({ width: 800, height: 600, bestScore: 5 });
  startGame(state);
  state.elapsed = 5.2;
  state.enemies.push({
    x: state.player.x,
    y: state.player.y,
    vx: 0,
    vy: 0,
    size: 10,
  });

  stepGame(state, FIXED_STEP, {}, () => 0.5);

  assert.equal(state.phase, 'gameover');
  assert.equal(state.finalScore, 5);
  assert.equal(state.bestScore, 5);
  assert.equal(state.isNewRecord, false);
});

test('结束后敌人冻结而粒子与震动自然结束', () => {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);
  state.enemies.push({
    x: state.player.x,
    y: state.player.y,
    vx: 20,
    vy: 10,
    size: 10,
  });

  stepGame(state, FIXED_STEP, {}, () => 0.5);
  assert.equal(state.phase, 'gameover');
  const collisionX = state.enemies[0].x;
  const collisionY = state.enemies[0].y;
  const collisionSpawnElapsed = state.spawnElapsed;
  const collisionFinalScore = state.finalScore;

  for (let step = 0; step < 180; step += 1) {
    stepGame(state, FIXED_STEP, {}, () => 0.5);
  }

  assert.equal(state.enemies[0].x, collisionX);
  assert.equal(state.enemies[0].y, collisionY);
  assert.equal(state.particles.length, 0);
  assert.equal(state.shake, 0);
  assert.equal(state.spawnElapsed, collisionSpawnElapsed);
  assert.equal(state.finalScore, collisionFinalScore);
});

test('开局保护允许移动并阻止刷怪', () => {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);
  const initialPlayerX = state.player.x;

  for (let step = 0; step < 179; step += 1) {
    stepGame(state, FIXED_STEP, keyboardRight, () => 0.5);
  }

  assert.ok(state.player.x > initialPlayerX);
  assert.ok(state.elapsed < 3);
  assert.equal(state.enemies.length, 0);
  assert.equal(state.spawnElapsed, 0);
});

test('刷怪债务达到热身间隔时生成敌人', () => {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);
  state.elapsed = 3;
  state.spawnElapsed = getDifficulty(3).spawnInterval;

  stepGame(state, 0, noInput, () => 0.5);

  assert.equal(state.enemies.length, 1);
});

test('固定步累加使保护边界落在第180与181步之间并于第262步自然首刷', () => {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);
  const random = () => 0.5;

  for (let step = 1; step <= 179; step += 1) {
    stepGame(state, FIXED_STEP, noInput, random);
    assert.equal(getDifficulty(state.elapsed).protected, true);
    assert.equal(state.enemies.length, 0);
  }

  // 连续累加的第 180 步略小于 3 秒，第 181 步才首次解除保护。
  stepGame(state, FIXED_STEP, noInput, random);
  assertClose(state.elapsed, 3);
  assert.equal(getDifficulty(state.elapsed).protected, true);
  assert.equal(state.enemies.length, 0);
  assert.equal(state.spawnElapsed, 0);

  stepGame(state, FIXED_STEP, noInput, random);
  assert.equal(getDifficulty(state.elapsed).protected, false);
  assert.equal(state.enemies.length, 0);
  assertClose(state.spawnElapsed, FIXED_STEP);

  for (let step = 182; step < 262; step += 1) {
    stepGame(state, FIXED_STEP, noInput, random);
    assert.equal(state.enemies.length, 0);
    assert.ok(
      state.spawnElapsed + 1e-9 <
        getDifficulty(state.elapsed).spawnInterval,
    );
  }

  stepGame(state, FIXED_STEP, noInput, random);

  assert.equal(state.enemies.length, 1);
});

test('敌人速度在生成时应用难度倍率', () => {
  const randomValues = [0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.125];
  const warmup = spawnOneEnemyAt(3, randomValues);
  const intense = spawnOneEnemyAt(90, randomValues);
  const warmupSpeed = Math.hypot(warmup.enemy.vx, warmup.enemy.vy);
  const intenseSpeed = Math.hypot(intense.enemy.vx, intense.enemy.vy);

  assert.equal(warmup.randomIndex, randomValues.length);
  assert.equal(intense.randomIndex, randomValues.length);
  assertClose(intenseSpeed / warmupSpeed, 1.3 / 0.45);
});

test('达到敌人上限时清空刷怪积累且不补刷', () => {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);
  state.elapsed = 20;
  state.spawnElapsed = getDifficulty(20).spawnInterval;
  for (let index = 0; index < 12; index += 1) {
    state.enemies.push({
      x: 100,
      y: 100,
      vx: 0,
      vy: 0,
      size: 1,
    });
  }

  stepGame(state, 0, noInput, () => 0.5);

  assert.equal(state.enemies.length, 12);
  assert.equal(state.spawnElapsed, 0);

  state.enemies.pop();
  stepGame(state, FIXED_STEP, noInput, () => 0.5);

  assert.equal(state.enemies.length, 11);
});

test('八次生成点过近时跳过本次刷怪', () => {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);
  state.elapsed = 3;
  state.player.x = state.player.size;
  state.player.y = state.height / 2;
  state.spawnElapsed = getDifficulty(3).spawnInterval;
  const randomValues = Array.from({ length: 8 }, () => [0.75, 0.5]).flat();
  let randomIndex = 0;

  stepGame(state, 0, noInput, () => randomValues[randomIndex++]);

  assert.equal(randomIndex, 16);
  assert.equal(state.enemies.length, 0);
  assert.equal(state.spawnElapsed, 0);
});

test('重开后恢复保护期并清空刷怪积累', () => {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);
  state.elapsed = 80;
  state.spawnElapsed = 0.4;
  state.enemies.push({
    x: 100,
    y: 100,
    vx: 0,
    vy: 0,
    size: 1,
  });

  startGame(state);

  assert.deepEqual(getDifficulty(state.elapsed), getDifficulty(0));
  assert.equal(state.spawnElapsed, 0);
  assert.deepEqual(state.enemies, []);
});

test('注入的随机序列能确定敌人从四条边界外生成', () => {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);
  const sideRandomValues = [0, 0.25, 0.5, 0.75];
  const isOutsideSide = [
    (enemy) => enemy.y < 0,
    (enemy) => enemy.x > state.width,
    (enemy) => enemy.y > state.height,
    (enemy) => enemy.x < 0,
  ];

  for (let side = 0; side < sideRandomValues.length; side += 1) {
    state.enemies = [];
    state.elapsed = 3;
    state.spawnElapsed = getDifficulty(state.elapsed).spawnInterval;
    const values = [
      sideRandomValues[side],
      0.5,
      0.5,
      0.5,
      0.5,
      0.5,
      0.125,
    ];
    let randomIndex = 0;
    const random = () => values[randomIndex++];

    stepGame(state, FIXED_STEP, {}, random);

    assert.equal(randomIndex, values.length);
    assert.equal(state.enemies.length, 1);
    const [enemy] = state.enemies;
    assert.equal(isOutsideSide[side](enemy), true);
    for (const field of ['x', 'y', 'vx', 'vy', 'size']) {
      assert.equal(Number.isFinite(enemy[field]), true);
    }
    assert.equal(enemy.color, 'hsl(45, 80%, 55%)');
  }
});

test('明显越界且继续向外移动的敌人会被清理', () => {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);
  state.enemies.push({
    x: 1000,
    y: state.player.y,
    vx: 20,
    vy: 0,
    size: 10,
  });

  stepGame(state, FIXED_STEP, {}, () => 0.5);

  assert.equal(state.enemies.length, 0);
  assert.equal(state.phase, 'running');
});

test('碰撞检测不会阻止清理数组中更早的越界敌人', () => {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);
  const collisionEnemy = {
    x: state.player.x,
    y: state.player.y,
    vx: 0,
    vy: 0,
    size: 10,
  };
  state.enemies.push(
    { x: 1000, y: state.player.y, vx: 20, vy: 0, size: 10 },
    { x: state.player.x, y: -200, vx: 0, vy: -20, size: 10 },
    collisionEnemy,
  );

  stepGame(state, FIXED_STEP, {}, () => 0.5);

  assert.equal(state.phase, 'gameover');
  assert.equal(state.enemies.length, 1);
  assert.strictEqual(state.enemies[0], collisionEnemy);
});
