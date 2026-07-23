import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState, startGame } from '../src/game-core.js';

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

test('startGame 原地重置新一局状态并保留开局最高分', () => {
  const state = createGameState({ width: 800, height: 600, bestScore: 12 });
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
