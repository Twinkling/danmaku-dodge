# 弹幕躲避稳定性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有单文件小游戏改造成跨刷新率一致、支持键盘和无障碍操作、具有零依赖自动化测试的可维护静态应用。

**Architecture:** `src/game-core.js` 只处理状态和规则，并通过带上限的固定时间步长推进模拟；`src/game.js` 只处理浏览器输入、Canvas 渲染、动画时间戳和最高分存储。`index.html` 作为轻量页面外壳，Node 内置测试直接验证核心模块。

**Tech Stack:** HTML5 Canvas、原生 ES Module、Node.js `node:test`、Node.js `node:assert/strict`、npm scripts。

---

## 文件职责

- Create: `package.json` — 声明 ES Module 和零依赖检查命令。
- Create: `src/game-core.js` — 游戏状态、固定时间步长、玩家、敌人、碰撞、特效、纪录和尺寸迁移。
- Create: `src/game.js` — Canvas 初始化、输入、渲染、动画循环、存储和状态播报。
- Create: `tests/game-core.test.js` — 核心规则的确定性单元测试。
- Modify: `index.html` — 移除内联游戏代码，保留页面结构、样式、无障碍内容和模块入口。
- Create: `README.md` — 运行、测试、操作和部署说明。

### Task 1: 建立可测试的核心状态

**Files:**
- Create: `package.json`
- Create: `tests/game-core.test.js`
- Create: `src/game-core.js`

- [x] **Step 1: 创建零依赖测试命令**

```json
{
  "name": "danmaku-dodge",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "check": "node --check src/game-core.js && node --check src/game.js && node --test"
  }
}
```

- [x] **Step 2: 编写初始状态和重新开局的失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createGameState,
    startGame
} from '../src/game-core.js';

test('创建状态时会规范化尺寸和最高分', () => {
    const state = createGameState({ width: 800, height: 600, bestScore: -4 });
    const validRecord = createGameState({ width: 800, height: 600, bestScore: '7' });
    const invalidRecord = createGameState({ width: 800, height: 600, bestScore: '7 秒' });

    assert.equal(state.phase, 'idle');
    assert.equal(state.width, 800);
    assert.equal(state.height, 600);
    assert.equal(state.bestScore, 0);
    assert.equal(validRecord.bestScore, 7);
    assert.equal(invalidRecord.bestScore, 0);
    assert.deepEqual(state.player, { x: 400, y: 300, size: 10.8 });
    assert.deepEqual(state.enemies, []);
    assert.deepEqual(state.particles, []);
});

test('开始新一局时会重置瞬态字段并保留最高分', () => {
    const state = createGameState({ width: 800, height: 600, bestScore: 7 });
    state.enemies.push({ x: 1 });
    state.particles.push({ x: 1 });
    state.elapsed = 9;
    state.isNewRecord = true;

    startGame(state);

    assert.equal(state.phase, 'running');
    assert.equal(state.elapsed, 0);
    assert.equal(state.finalScore, 0);
    assert.equal(state.bestScoreAtStart, 7);
    assert.equal(state.isNewRecord, false);
    assert.equal(state.spawnInterval, 28 / 60);
    assert.deepEqual(state.enemies, []);
    assert.deepEqual(state.particles, []);
});
```

- [x] **Step 3: 运行测试并确认因核心模块缺失而失败**

Run: `npm test -- tests/game-core.test.js`

Expected: FAIL，并包含 `ERR_MODULE_NOT_FOUND`。

- [x] **Step 4: 实现最小状态模型**

```js
export const FIXED_STEP = 1 / 60;
export const INITIAL_SPAWN_INTERVAL = 28 / 60;
export const MIN_SPAWN_INTERVAL = 5 / 60;
export const SPAWN_INTERVAL_DECREASE = 0.22 / 60;

function positiveDimension(value) {
    return Number.isFinite(value) && value > 0 ? value : 1;
}

export function sanitizeBestScore(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function playerSize(width, height) {
    return Math.max(8, Math.min(width, height) * 0.018);
}

export function createGameState({ width, height, bestScore = 0 }) {
    const safeWidth = positiveDimension(width);
    const safeHeight = positiveDimension(height);

    return {
        width: safeWidth,
        height: safeHeight,
        phase: 'idle',
        accumulator: 0,
        player: {
            x: safeWidth / 2,
            y: safeHeight / 2,
            size: playerSize(safeWidth, safeHeight)
        },
        enemies: [],
        particles: [],
        elapsed: 0,
        spawnElapsed: 0,
        spawnInterval: INITIAL_SPAWN_INTERVAL,
        shake: 0,
        finalScore: 0,
        bestScore: sanitizeBestScore(bestScore),
        bestScoreAtStart: sanitizeBestScore(bestScore),
        isNewRecord: false
    };
}

export function startGame(state) {
    state.phase = 'running';
    state.accumulator = 0;
    state.player.x = state.width / 2;
    state.player.y = state.height / 2;
    state.player.size = playerSize(state.width, state.height);
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
```

- [x] **Step 5: 运行测试并确认通过**

Run: `npm test -- tests/game-core.test.js`

Expected: PASS，2 tests passed。

- [x] **Step 6: 提交核心状态**

```bash
git add package.json src/game-core.js tests/game-core.test.js
git commit -m "feat(core): 建立可测试的游戏状态模型"
```

### Task 2: 实现固定时间步长和玩家控制

**Files:**
- Modify: `tests/game-core.test.js`
- Modify: `src/game-core.js`

- [x] **Step 1: 编写不同刷新率结果一致的失败测试**

```js
import {
    FIXED_STEP,
    advanceGame,
    createGameState,
    startGame,
    stepGame
} from '../src/game-core.js';

const keyboardRight = {
    mode: 'keyboard',
    left: false,
    right: true,
    up: false,
    down: false,
    pointerActive: false,
    pointerX: 0,
    pointerY: 0
};

function simulateAtRate(rate) {
    const state = createGameState({ width: 800, height: 600 });
    startGame(state);
    state.spawnInterval = 10;
    for (let frame = 0; frame < rate; frame += 1) {
        advanceGame(state, 1 / rate, keyboardRight, () => 0.5);
    }
    return state;
}

test('60Hz、120Hz 和 144Hz 的一秒模拟结果一致', () => {
    const at60 = simulateAtRate(60);
    const at120 = simulateAtRate(120);
    const at144 = simulateAtRate(144);

    assert.ok(Math.abs(at60.elapsed - 1) <= FIXED_STEP);
    assert.ok(Math.abs(at60.elapsed - at120.elapsed) <= FIXED_STEP);
    assert.ok(Math.abs(at60.elapsed - at144.elapsed) <= FIXED_STEP);
    assert.ok(Math.abs(at60.player.x - at120.player.x) < 0.001);
    assert.ok(Math.abs(at60.player.x - at144.player.x) < 0.001);
});

test('玩家会被限制在游戏边界内', () => {
    const state = createGameState({ width: 320, height: 240 });
    startGame(state);
    state.player.x = state.width - state.player.size;

    stepGame(state, 1, keyboardRight, () => 0.5);

    assert.equal(state.player.x, state.width - state.player.size);
});
```

- [x] **Step 2: 运行测试并确认缺少推进函数**

Run: `npm test -- tests/game-core.test.js`

Expected: FAIL，并指出 `advanceGame` 或 `stepGame` 未导出。

- [x] **Step 3: 实现固定步长与时间无关玩家移动**

```js
export const MAX_FRAME_TIME = 0.1;
export const MAX_STEPS_PER_FRAME = 6;
const KEYBOARD_SPEED_FACTOR = 0.65;
const POINTER_FOLLOW_RATE = -Math.log(1 - 0.22) * 60;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function updatePlayer(state, deltaTime, input) {
    const player = state.player;
    if (input.mode === 'keyboard') {
        const horizontal = Number(input.right) - Number(input.left);
        const vertical = Number(input.down) - Number(input.up);
        const length = Math.hypot(horizontal, vertical) || 1;
        const speed = Math.min(state.width, state.height) * KEYBOARD_SPEED_FACTOR;
        player.x += (horizontal / length) * speed * deltaTime;
        player.y += (vertical / length) * speed * deltaTime;
    } else if (input.pointerActive) {
        const alpha = 1 - Math.exp(-POINTER_FOLLOW_RATE * deltaTime);
        player.x += (input.pointerX - player.x) * alpha;
        player.y += (input.pointerY - player.y) * alpha;
    }

    player.x = clamp(player.x, player.size, state.width - player.size);
    player.y = clamp(player.y, player.size, state.height - player.size);
}

export function stepGame(state, deltaTime, input, random = Math.random) {
    if (state.phase === 'running') {
        updatePlayer(state, deltaTime, input);
        state.elapsed += deltaTime;
    }
    return state;
}

export function advanceGame(state, elapsedTime, input, random = Math.random) {
    const safeElapsed = Number.isFinite(elapsedTime)
        ? clamp(elapsedTime, 0, MAX_FRAME_TIME)
        : 0;
    state.accumulator += safeElapsed;

    let steps = 0;
    while (state.accumulator + 1e-9 >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
        stepGame(state, FIXED_STEP, input, random);
        state.accumulator = Math.max(0, state.accumulator - FIXED_STEP);
        steps += 1;
    }
    if (steps === MAX_STEPS_PER_FRAME && state.accumulator >= FIXED_STEP) {
        state.accumulator = 0;
    }
    return state;
}
```

- [x] **Step 4: 运行测试并确认通过**

Run: `npm test -- tests/game-core.test.js`

Expected: PASS，4 tests passed。

- [x] **Step 5: 提交时间步长与控制逻辑**

```bash
git add src/game-core.js tests/game-core.test.js
git commit -m "feat(core): 使用固定时间步长推进玩家状态"
```

### Task 3: 实现敌人、碰撞、纪录和结束特效

**Files:**
- Modify: `tests/game-core.test.js`
- Modify: `src/game-core.js`

- [x] **Step 1: 编写碰撞、纪录和特效的失败测试**

将测试文件的核心模块 import 列表补充为：

```js
import {
    FIXED_STEP,
    MIN_SPAWN_INTERVAL,
    advanceGame,
    createGameState,
    startGame,
    stepGame
} from '../src/game-core.js';
```

```js
test('碰撞会结束游戏并在严格破纪录时生成特效', () => {
    const state = createGameState({ width: 800, height: 600, bestScore: 4 });
    startGame(state);
    state.elapsed = 5.2;
    state.enemies.push({
        x: state.player.x,
        y: state.player.y,
        vx: 0,
        vy: 0,
        size: 10,
        color: 'hsl(0, 80%, 55%)'
    });

    stepGame(state, FIXED_STEP, {}, () => 0.5);

    assert.equal(state.phase, 'gameover');
    assert.equal(state.finalScore, 5);
    assert.equal(state.bestScore, 5);
    assert.equal(state.isNewRecord, true);
    assert.equal(state.particles.length, 35);
    assert.ok(state.shake > 0);
});

test('追平最高分不会标记为新纪录', () => {
    const state = createGameState({ width: 800, height: 600, bestScore: 5 });
    startGame(state);
    state.elapsed = 5.2;
    state.enemies.push({ x: 400, y: 300, vx: 0, vy: 0, size: 10, color: '' });

    stepGame(state, FIXED_STEP, {}, () => 0.5);

    assert.equal(state.finalScore, 5);
    assert.equal(state.bestScore, 5);
    assert.equal(state.isNewRecord, false);
});

test('游戏结束后敌人冻结但粒子和震动会自然结束', () => {
    const state = createGameState({ width: 800, height: 600 });
    startGame(state);
    state.enemies.push({ x: 400, y: 300, vx: 20, vy: 10, size: 10, color: '' });
    stepGame(state, FIXED_STEP, {}, () => 0.5);
    const enemyPosition = { x: state.enemies[0].x, y: state.enemies[0].y };

    for (let step = 0; step < 180; step += 1) {
        stepGame(state, FIXED_STEP, {}, () => 0.5);
    }

    assert.deepEqual(
        { x: state.enemies[0].x, y: state.enemies[0].y },
        enemyPosition
    );
    assert.equal(state.particles.length, 0);
    assert.equal(state.shake, 0);
});

test('刷怪间隔会降低但不会突破下限', () => {
    const state = createGameState({ width: 800, height: 600 });
    startGame(state);
    state.spawnInterval = MIN_SPAWN_INTERVAL;
    state.spawnElapsed = MIN_SPAWN_INTERVAL;

    stepGame(state, FIXED_STEP, {}, () => 0.5);

    assert.equal(state.enemies.length, 1);
    assert.equal(state.spawnInterval, MIN_SPAWN_INTERVAL);
});
```

- [x] **Step 2: 运行测试并确认游戏仍不会发生碰撞和特效**

Run: `npm test -- tests/game-core.test.js`

Expected: FAIL，`phase` 仍为 `running` 或未生成粒子。

- [x] **Step 3: 实现敌人生成、碰撞、纪录和特效**

在 `src/game-core.js` 增加并从 `stepGame` 调用以下函数：

```js
function spawnEnemy(state, random) {
    const shortEdge = Math.min(state.width, state.height);
    const margin = shortEdge * 0.05;
    const side = Math.floor(random() * 4);
    let x;
    let y;
    if (side === 0) ({ x, y } = { x: random() * state.width, y: -margin });
    else if (side === 1) ({ x, y } = { x: state.width + margin, y: random() * state.height });
    else if (side === 2) ({ x, y } = { x: random() * state.width, y: state.height + margin });
    else ({ x, y } = { x: -margin, y: random() * state.height });

    const dx = state.player.x - x + (random() - 0.5) * shortEdge * 0.25;
    const dy = state.player.y - y + (random() - 0.5) * shortEdge * 0.25;
    const distance = Math.hypot(dx, dy) || 1;
    const baseSpeed = shortEdge * 0.006 * 60;
    const speed = baseSpeed + random() * baseSpeed * 1.5;
    state.enemies.push({
        x,
        y,
        vx: (dx / distance) * speed,
        vy: (dy / distance) * speed,
        size: shortEdge * (0.01 + random() * 0.016),
        color: `hsl(${random() * 360}, 80%, 55%)`
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
            size: shortEdge * (0.005 + random() * 0.01)
        });
    }
}

function endGame(state, random) {
    state.phase = 'gameover';
    state.finalScore = Math.floor(state.elapsed);
    state.isNewRecord = state.finalScore > state.bestScoreAtStart;
    if (state.isNewRecord) state.bestScore = state.finalScore;
    state.shake = Math.min(state.width, state.height) * 0.03;
    createParticles(state, random);
}

function updateEnemies(state, deltaTime, random) {
    state.spawnElapsed += deltaTime;
    if (state.spawnElapsed >= state.spawnInterval) {
        state.spawnElapsed -= state.spawnInterval;
        spawnEnemy(state, random);
        state.spawnInterval = Math.max(
            MIN_SPAWN_INTERVAL,
            state.spawnInterval - SPAWN_INTERVAL_DECREASE
        );
    }

    const margin = Math.max(state.width, state.height) * 0.2;
    for (let index = state.enemies.length - 1; index >= 0; index -= 1) {
        const enemy = state.enemies[index];
        enemy.x += enemy.vx * deltaTime;
        enemy.y += enemy.vy * deltaTime;
        if (
            enemy.x < -margin || enemy.x > state.width + margin ||
            enemy.y < -margin || enemy.y > state.height + margin
        ) {
            state.enemies.splice(index, 1);
            continue;
        }
        if (Math.hypot(state.player.x - enemy.x, state.player.y - enemy.y) <
            state.player.size + enemy.size) {
            endGame(state, random);
            return;
        }
    }
}

function updateEffects(state, deltaTime) {
    for (let index = state.particles.length - 1; index >= 0; index -= 1) {
        const particle = state.particles[index];
        particle.x += particle.vx * deltaTime;
        particle.y += particle.vy * deltaTime;
        particle.life -= 1.5 * deltaTime;
        if (particle.life <= 0) state.particles.splice(index, 1);
    }
    if (state.shake > 0) {
        state.shake *= Math.pow(0.87, deltaTime * 60);
        if (state.shake < 0.05) state.shake = 0;
    }
}
```

将 `stepGame` 完整调整为：

```js
export function stepGame(state, deltaTime, input = {}, random = Math.random) {
    if (state.phase === 'running') {
        updatePlayer(state, deltaTime, input);
        state.elapsed += deltaTime;
        updateEnemies(state, deltaTime, random);
    }
    updateEffects(state, deltaTime);
    return state;
}
```

- [x] **Step 4: 运行测试并确认通过**

Run: `npm test -- tests/game-core.test.js`

Expected: PASS，8 tests passed。

- [x] **Step 5: 提交核心玩法规则**

```bash
git add src/game-core.js tests/game-core.test.js
git commit -m "fix(core): 统一刷怪碰撞与结束特效时序"
```

### Task 4: 实现尺寸迁移

**Files:**
- Modify: `tests/game-core.test.js`
- Modify: `src/game-core.js`

- [x] **Step 1: 编写尺寸迁移的失败测试**

在测试文件的核心模块 import 列表加入 `resizeGame`：

```js
import {
    FIXED_STEP,
    MIN_SPAWN_INTERVAL,
    advanceGame,
    createGameState,
    resizeGame,
    startGame,
    stepGame
} from '../src/game-core.js';
```

```js
test('尺寸变化会按比例迁移坐标、尺寸和速度', () => {
    const state = createGameState({ width: 800, height: 600 });
    startGame(state);
    state.player.x = 200;
    state.player.y = 150;
    state.enemies.push({ x: 100, y: 90, vx: 120, vy: 60, size: 12, color: '' });
    state.particles.push({ x: 300, y: 200, vx: 30, vy: 15, size: 6, life: 1 });

    resizeGame(state, 400, 300);

    assert.equal(state.player.x, 100);
    assert.equal(state.player.y, 75);
    assert.equal(state.player.size, 8);
    assert.deepEqual(
        { x: state.enemies[0].x, y: state.enemies[0].y },
        { x: 50, y: 45 }
    );
    assert.deepEqual(
        { vx: state.enemies[0].vx, vy: state.enemies[0].vy, size: state.enemies[0].size },
        { vx: 60, vy: 30, size: 6 }
    );
    assert.deepEqual(
        { x: state.particles[0].x, y: state.particles[0].y },
        { x: 150, y: 100 }
    );
});
```

- [x] **Step 2: 运行测试并确认 `resizeGame` 缺失**

Run: `npm test -- tests/game-core.test.js`

Expected: FAIL，并指出 `resizeGame` 未导出。

- [x] **Step 3: 实现尺寸迁移**

```js
export function resizeGame(state, width, height) {
    const safeWidth = positiveDimension(width);
    const safeHeight = positiveDimension(height);
    const xRatio = safeWidth / state.width;
    const yRatio = safeHeight / state.height;
    const sizeRatio = Math.min(safeWidth, safeHeight) / Math.min(state.width, state.height);

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
    state.width = safeWidth;
    state.height = safeHeight;
    state.player.x = clamp(state.player.x, state.player.size, safeWidth - state.player.size);
    state.player.y = clamp(state.player.y, state.player.size, safeHeight - state.player.size);
    return state;
}
```

- [x] **Step 4: 运行测试并确认通过**

Run: `npm test -- tests/game-core.test.js`

Expected: PASS，9 tests passed。

- [x] **Step 5: 提交尺寸迁移**

```bash
git add src/game-core.js tests/game-core.test.js
git commit -m "fix(core): 在画布变化时迁移游戏状态"
```

### Task 5: 接入浏览器、键盘和无障碍界面

**Files:**
- Create: `src/game.js`
- Modify: `index.html`

- [x] **Step 1: 先运行完整检查并确认浏览器入口尚不存在**

Run: `npm run check`

Expected: FAIL，`node --check src/game.js` 报告文件不存在。

- [x] **Step 2: 将 `index.html` 改为轻量页面外壳**

使用以下完整页面：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <meta name="description" content="使用鼠标、触摸或键盘躲避彩色弹幕球。">
    <meta name="theme-color" content="#0a0a0a">
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%2300ddff'/%3E%3Ccircle cx='50' cy='50' r='18' fill='white'/%3E%3C/svg%3E">
    <title>弹幕躲避</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-tap-highlight-color: transparent;
        }
        html, body {
            width: 100%;
            height: 100%;
            height: -webkit-fill-available;
            overflow: hidden;
            background: #0a0a0a;
            font-family: -apple-system, Arial, sans-serif;
            touch-action: none;
            user-select: none;
            -webkit-user-select: none;
            position: fixed;
            inset: 0;
        }
        canvas {
            display: block;
            position: fixed;
            inset: 0;
            width: 100%;
            height: 100%;
        }
        canvas:focus-visible {
            outline: 2px solid #00ddff;
            outline-offset: -4px;
        }
        .visually-hidden {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
        }
    </style>
</head>
<body>
    <canvas
        id="game"
        tabindex="0"
        role="application"
        aria-label="弹幕躲避游戏"
        aria-describedby="game-instructions game-status"
    ></canvas>
    <p id="game-instructions" class="visually-hidden">
        移动鼠标或滑动屏幕控制角色，也可以使用方向键或 WASD。按 Enter 或空格开始和重新开始。
    </p>
    <p id="game-status" class="visually-hidden" aria-live="polite">等待开始游戏</p>
    <script type="module" src="./src/game.js"></script>
</body>
</html>
```

- [x] **Step 3: 实现浏览器适配层**

创建以下完整 `src/game.js`：

```js
import {
    advanceGame,
    createGameState,
    resizeGame,
    sanitizeBestScore,
    startGame
} from './game-core.js';

const canvas = document.getElementById('game');
const statusElement = document.getElementById('game-status');
const context = canvas.getContext('2d');
const input = {
    mode: 'pointer',
    pointerActive: false,
    pointerX: window.innerWidth / 2,
    pointerY: window.innerHeight / 2,
    left: false,
    right: false,
    up: false,
    down: false
};

function readBestScore() {
    try {
        return sanitizeBestScore(localStorage.getItem('dodgeBestScoreV2'));
    } catch {
        return 0;
    }
}

function writeBestScore(score) {
    try {
        localStorage.setItem('dodgeBestScoreV2', String(score));
    } catch {
        // 存储不可用时保持当前会话内的纪录。
    }
}

let state = createGameState({
    width: window.innerWidth,
    height: window.innerHeight,
    bestScore: readBestScore()
});
let persistedBestScore = state.bestScore;

function setupCanvas() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const xRatio = width / state.width;
    const yRatio = height / state.height;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    input.pointerX *= xRatio;
    input.pointerY *= yRatio;
    resizeGame(state, width, height);
    input.pointerX = Math.max(0, Math.min(width, input.pointerX));
    input.pointerY = Math.max(0, Math.min(height, input.pointerY));
}

function beginGame() {
    startGame(state);
    statusElement.textContent = '游戏开始';
}

function updatePointer(event) {
    const rect = canvas.getBoundingClientRect();
    input.pointerX = (event.clientX - rect.left) * (state.width / (rect.width || 1));
    input.pointerY = (event.clientY - rect.top) * (state.height / (rect.height || 1));
    input.pointerActive = true;
    input.mode = 'pointer';
}

const movementKeys = new Map([
    ['ArrowLeft', 'left'], ['KeyA', 'left'],
    ['ArrowRight', 'right'], ['KeyD', 'right'],
    ['ArrowUp', 'up'], ['KeyW', 'up'],
    ['ArrowDown', 'down'], ['KeyS', 'down']
]);

function bindInput() {
    canvas.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        canvas.focus({ preventScroll: true });
        updatePointer(event);
        if (state.phase !== 'running') beginGame();
    });
    canvas.addEventListener('pointermove', updatePointer);
    canvas.addEventListener('pointerleave', () => { input.pointerActive = false; });
    canvas.addEventListener('pointercancel', () => { input.pointerActive = false; });
    canvas.addEventListener('pointerup', (event) => {
        if (event.pointerType === 'touch') input.pointerActive = false;
    });

    window.addEventListener('keydown', (event) => {
        if ((event.code === 'Enter' || event.code === 'Space') && state.phase !== 'running') {
            event.preventDefault();
            beginGame();
            return;
        }
        const direction = movementKeys.get(event.code);
        if (direction) {
            event.preventDefault();
            input[direction] = true;
            input.mode = 'keyboard';
        }
    });
    window.addEventListener('keyup', (event) => {
        const direction = movementKeys.get(event.code);
        if (direction) input[direction] = false;
    });
    window.addEventListener('blur', () => {
        input.left = input.right = input.up = input.down = false;
    });
}

function getUiMetrics() {
    const shortEdge = Math.min(state.width, state.height);
    return {
        fontSize: Math.max(14, shortEdge * 0.05),
        padding: shortEdge * 0.04
    };
}

function drawBackground() {
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
}

function drawWorld() {
    const offsetX = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 2 : 0;
    const offsetY = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 2 : 0;
    context.save();
    context.translate(offsetX, offsetY);

    for (const enemy of state.enemies) {
        context.fillStyle = enemy.color;
        context.beginPath();
        context.arc(enemy.x, enemy.y, enemy.size, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = 'rgba(255,255,255,0.3)';
        context.beginPath();
        context.arc(
            enemy.x - enemy.size * 0.25,
            enemy.y - enemy.size * 0.25,
            enemy.size * 0.35,
            0,
            Math.PI * 2
        );
        context.fill();
    }

    for (const particle of state.particles) {
        context.fillStyle = `rgba(255, 140, 70, ${Math.max(0, particle.life)})`;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
    }

    if (state.phase === 'running') {
        const size = state.player.size;
        context.fillStyle = 'rgba(0, 220, 255, 0.3)';
        context.beginPath();
        context.arc(state.player.x, state.player.y, size * 1.6, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#00ddff';
        context.fillRect(state.player.x - size, state.player.y - size, size * 2, size * 2);
        context.fillStyle = 'rgba(255,255,255,0.5)';
        context.fillRect(
            state.player.x - size * 0.45,
            state.player.y - size * 0.45,
            size * 0.9,
            size * 0.9
        );
    }
    context.restore();
}

function drawHud() {
    const { fontSize, padding } = getUiMetrics();
    context.fillStyle = '#ffffff';
    context.font = `bold ${fontSize}px -apple-system, Arial, sans-serif`;
    context.textAlign = 'left';
    context.textBaseline = 'top';
    context.fillText(`${Math.floor(state.elapsed)} 秒`, padding, padding);

    context.fillStyle = '#999';
    context.font = `${fontSize * 0.55}px -apple-system, Arial, sans-serif`;
    context.textAlign = 'right';
    context.fillText(`最高: ${state.bestScore} 秒`, state.width - padding, padding);
}

function drawOverlay() {
    const { fontSize } = getUiMetrics();
    const centerX = state.width / 2;
    const centerY = state.height / 2;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    if (state.phase === 'idle') {
        context.fillStyle = '#ffffff';
        context.font = `bold ${fontSize * 1.1}px -apple-system, Arial, sans-serif`;
        context.fillText('弹幕躲避', centerX, centerY - fontSize * 0.8);
        context.fillStyle = '#aaaaaa';
        context.font = `${fontSize * 0.55}px -apple-system, Arial, sans-serif`;
        context.fillText('鼠标 / 触摸 / 方向键或 WASD 控制', centerX, centerY + fontSize * 0.5);
        context.globalAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 600);
        context.fillText('点击或按 Enter / 空格开始', centerX, centerY + fontSize * 1.4);
        context.globalAlpha = 1;
        return;
    }

    if (state.phase === 'gameover') {
        context.fillStyle = 'rgba(0, 0, 0, 0.75)';
        context.fillRect(0, 0, state.width, state.height);
        context.fillStyle = '#ff4444';
        context.font = `bold ${fontSize * 1.5}px -apple-system, Arial, sans-serif`;
        context.fillText('游戏结束', centerX, centerY - fontSize * 1.4);
        context.fillStyle = '#ffffff';
        context.font = `${fontSize * 0.85}px -apple-system, Arial, sans-serif`;
        context.fillText(`坚持了 ${state.finalScore} 秒`, centerX, centerY - fontSize * 0.15);
        if (state.isNewRecord) {
            context.fillStyle = '#ffcc00';
            context.font = `bold ${fontSize * 0.75}px -apple-system, Arial, sans-serif`;
            context.fillText('🏆 新纪录！', centerX, centerY + fontSize * 0.8);
        }
        context.fillStyle = '#aaaaaa';
        context.font = `${fontSize * 0.55}px -apple-system, Arial, sans-serif`;
        context.globalAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 600);
        context.fillText('点击或按 Enter / 空格重新开始', centerX, centerY + fontSize * 1.7);
        context.globalAlpha = 1;
    }
}

function draw() {
    drawBackground();
    drawWorld();
    drawHud();
    drawOverlay();
}

let previousTimestamp;
function gameLoop(timestamp) {
    if (previousTimestamp === undefined) previousTimestamp = timestamp;
    const elapsedTime = (timestamp - previousTimestamp) / 1000;
    previousTimestamp = timestamp;
    const previousPhase = state.phase;
    advanceGame(state, elapsedTime, input);
    if (previousPhase === 'running' && state.phase === 'gameover') {
        if (state.bestScore > persistedBestScore) {
            persistedBestScore = state.bestScore;
            writeBestScore(state.bestScore);
        }
        statusElement.textContent = state.isNewRecord
            ? `游戏结束，坚持了 ${state.finalScore} 秒，刷新最高纪录`
            : `游戏结束，坚持了 ${state.finalScore} 秒`;
    }
    draw();
    requestAnimationFrame(gameLoop);
}

if (!context) {
    statusElement.textContent = '当前浏览器不支持 Canvas 2D，无法启动游戏';
} else {
    bindInput();
    setupCanvas();
    window.addEventListener('resize', setupCanvas);
    window.addEventListener('orientationchange', () => {
        window.setTimeout(setupCanvas, 100);
    });
    requestAnimationFrame(gameLoop);
}
```

- [x] **Step 4: 运行语法与单元检查**

Run: `npm run check`

Expected: PASS，语法检查退出码 0，9 tests passed。

- [x] **Step 5: 提交浏览器界面**

```bash
git add index.html src/game.js
git commit -m "feat(ui): 接入多输入与无障碍游戏界面"
```

### Task 6: 补齐文档并执行完整回归

**Files:**
- Create: `README.md`
- Modify: `docs/superpowers/plans/2026-07-23-game-stability.md`

- [x] **Step 1: 编写 README**

README 必须包含以下实际命令和说明：

````markdown
# 弹幕躲避

一个零运行时依赖的 Canvas 弹幕躲避小游戏。

## 运行

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

访问 `http://127.0.0.1:4173/`。

## 操作

- 鼠标移动或单指滑动：控制角色跟随指针。
- 方向键或 WASD：移动角色。
- 点击、触摸、Enter 或空格：开始和重新开始。

## 检查

```bash
npm test
npm run check
```

## 部署

仓库不需要构建。将 `index.html` 和 `src/` 原样部署到任意静态文件服务，保持目录结构不变即可。
````

- [x] **Step 2: 运行完整自动化检查**

Run: `npm run check`

Expected: PASS，退出码 0，9 tests passed，0 failed。

- [x] **Step 3: 启动静态服务器并验证 HTTP**

Run: `python3 -m http.server 4173 --bind 127.0.0.1`

Expected: 输出 `Serving HTTP on 127.0.0.1 port 4173`。

Run: `curl -sS -I http://127.0.0.1:4173/`

Expected: 包含 `200 OK` 和 `Content-type: text/html`。

- [x] **Step 4: 执行浏览器回归**

在受控浏览器中完成以下检查并记录结果：

- 1280×720、DPR 2：Canvas 物理尺寸为 2560×1440。
- 点击开始后玩家和敌人正常绘制，鼠标移动改变玩家位置。
- 碰撞后出现结束页，粒子消失且震动归零，点击可重开。
- Enter 可开始，方向键可连续改变玩家位置，空格可在结束后重开。
- 390×844：初始页文字完整、Canvas 与视口一致。
- 页面控制台没有 error 或 warning。

- [x] **Step 5: 更新计划勾选状态并检查工作区**

Run: `git diff --check && git status --short`

Expected: `git diff --check` 无输出；状态只包含 README 和已勾选的计划文档。

- [x] **Step 6: 提交文档与验证记录**

```bash
git add README.md docs/superpowers/plans/2026-07-23-game-stability.md
git commit -m "docs: 补充游戏运行测试与部署说明"
```

- [x] **Step 7: 最终复核**

Run: `npm run check && git status --short --branch`

Expected: 自动化检查全部通过，工作区干净，当前分支只领先远端本次设计和实现提交。

## 验证记录

- `npm run check` 通过，42/42 项测试成功，0 项失败。
- 真实浏览器桌面视口（1280×720）已验证：点击开始、Enter 重新开始、Canvas 焦点、鼠标跟随、游戏结束和最高分流程均正常。
- 真实浏览器移动端视口（390×844）已验证：Canvas 尺寸与视口匹配，DPR 为 1，`touch-action` 为 `pinch-zoom`，首屏布局正常。
- 受控浏览器检查期间未观察到页面 console error 或 warning。
- 多触点仲裁由可执行的浏览器入口行为测试覆盖；真实物理设备上的双指缩放未直接模拟。
- 本地 HTTP 服务验证成功：`/`、`/src/game.js` 和 `/src/game-core.js` 均返回 200。
