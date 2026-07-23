import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIXED_STEP,
  advanceGame,
  createGameState,
  startGame,
  stepGame,
} from '../src/game-core.js';

const keyboardRight = {
  mode: 'keyboard',
  left: false,
  right: true,
  up: false,
  down: false,
  pointerActive: false,
};

function simulateAtRate(rate) {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);

  for (let frame = 0; frame < rate; frame += 1) {
    advanceGame(state, 1 / rate, keyboardRight, () => 0.5);
  }

  return state;
}

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
  state.spawnInterval = 1;
  state.shake = 3;
  state.finalScore = 8;
  state.bestScore = 15;
  state.bestScoreAtStart = 12;
  state.isNewRecord = true;

  const result = startGame(state);

  assert.strictEqual(result, state);
  assert.equal(state.phase, 'running');
  assert.equal(state.accumulator, 0);
  assert.equal(state.player.x, 320);
  assert.equal(state.player.y, 240);
  assert.ok(Math.abs(state.player.size - 8.64) < Number.EPSILON * 8.64);
  assert.deepEqual(state.enemies, []);
  assert.deepEqual(state.particles, []);
  assert.equal(state.elapsed, 0);
  assert.equal(state.spawnElapsed, 0);
  assert.equal(state.spawnInterval, 28 / 60);
  assert.equal(state.shake, 0);
  assert.equal(state.finalScore, 0);
  assert.equal(state.bestScore, 15);
  assert.equal(state.bestScoreAtStart, 15);
  assert.equal(state.isNewRecord, false);
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
