# 独立倒计时与保护罩衔接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax so execution can be tracked directly in this document.

**Goal:** 将开局倒计时从正式游戏中拆出，用方块粒子呈现 `3`、`2` 外散和 `1` 回流，并在保护罩完全成形后才开始计分、移动与正式开局保护。

**Architecture:** `game-core.js` 只维护 `countdown` 阶段及 5.6 秒确定性时序；新建 `countdown-animation.js` 负责时序派生、数字像素缓存和绘制；`game.js` 只负责输入入口、画面组合和无障碍状态。倒计时粒子不进入核心实体数组，离屏 Canvas 不可用时退化为实心数字。

**Tech Stack:** 原生 JavaScript ES Modules、Canvas 2D、Node.js `node:test`、静态 HTML

**State Flow:** `idle → countdown → running → gameover`，重开从 `gameover` 回到 `countdown`。

---

## 执行约束

- 严格按 Task 1 → Task 4 执行，每个 Task 独立完成测试、实现、自检和 commit。
- 每个行为改动先写失败测试，再写最小实现，再运行相关测试。
- 不修改既有难度曲线、刷怪、公平性和碰撞规则。
- 不引入依赖、构建系统、图片或音频资源。
- 不把倒计时显示粒子写入 `state.particles`。
- 不执行 `git add .`，只暂存当前 Task 的明确文件。
- 不 push。

## Task 1：增加独立倒计时核心状态

**Files:**

- Modify: `src/game-core.js`
- Modify: `tests/game-core.test.js`

### Step 1：为核心时序写失败测试

- [ ] 在 `tests/game-core.test.js` 的核心模块 import 中加入：

```js
import {
  COUNTDOWN_DIGIT_SECONDS,
  COUNTDOWN_SECONDS,
  COUNTDOWN_TRANSFER_SECONDS,
  createGameState,
  FIXED_STEP,
  OPENING_PROTECTION_SECONDS,
  startCountdown,
  startGame,
  stepGame,
} from '../src/game-core.js';
```

- [ ] 新增以下测试，明确常量、冻结行为、边界转换和直接正式开始的兼容语义：

```js
test('独立倒计时使用三个 1.6 秒数字和 0.8 秒回流', () => {
  assert.equal(COUNTDOWN_DIGIT_SECONDS, 1.6);
  assert.equal(COUNTDOWN_TRANSFER_SECONDS, 0.8);
  assert.equal(COUNTDOWN_SECONDS, 5.6);
});

test('开始倒计时会重置回合并保持正式游戏时间冻结', () => {
  const state = createGameState({ width: 800, height: 600, bestScore: 9 });
  state.phase = 'gameover';
  state.elapsed = 12.7;
  state.spawnElapsed = 0.6;
  state.finalScore = 12;
  state.enemies.push({ x: 1, y: 1, vx: 0, vy: 0, size: 1 });
  state.particles.push({ x: 1, y: 1, vx: 0, vy: 0, size: 1, life: 1 });

  startCountdown(state);

  assert.equal(state.phase, 'countdown');
  assert.equal(state.countdownElapsed, 0);
  assert.equal(state.elapsed, 0);
  assert.equal(state.spawnElapsed, 0);
  assert.equal(state.finalScore, 0);
  assert.deepEqual(state.enemies, []);
  assert.deepEqual(state.particles, []);
  assert.deepEqual(state.player, {
    x: 400,
    y: 300,
    size: state.player.size,
  });
  assert.equal(state.bestScoreAtStart, 9);
  assert.equal(state.isNewRecord, false);
});

test('倒计时期间冻结玩家、敌人、刷怪与正式时间', () => {
  const state = createGameState({ width: 800, height: 600 });
  startCountdown(state);
  const startingPlayer = { ...state.player };

  stepGame(
    state,
    COUNTDOWN_SECONDS - FIXED_STEP,
    {
      mode: 'keyboard',
      right: true,
      down: true,
    },
    () => 0.5,
  );

  assert.equal(state.phase, 'countdown');
  assert.equal(state.countdownElapsed, COUNTDOWN_SECONDS - FIXED_STEP);
  assert.equal(state.elapsed, 0);
  assert.equal(state.spawnElapsed, 0);
  assert.deepEqual(state.player, startingPlayer);
  assert.deepEqual(state.enemies, []);
});

test('倒计时到达 5.6 秒后从零开始正式游戏', () => {
  const state = createGameState({ width: 800, height: 600 });
  startCountdown(state);

  stepGame(state, COUNTDOWN_SECONDS - FIXED_STEP, {}, () => 0.5);
  stepGame(state, FIXED_STEP, { mode: 'keyboard', right: true }, () => 0.5);

  assert.equal(state.phase, 'running');
  assert.equal(state.countdownElapsed, COUNTDOWN_SECONDS);
  assert.equal(state.elapsed, 0);
  assert.equal(state.spawnElapsed, 0);
  assert.equal(state.player.x, 400);
  assert.deepEqual(state.enemies, []);

  stepGame(state, FIXED_STEP, { mode: 'keyboard', right: true }, () => 0.5);

  assert.equal(state.elapsed, FIXED_STEP);
  assert.ok(state.player.x > 400);
  assert.deepEqual(state.enemies, []);
});

test('直接开始正式游戏会将倒计时标记为已完成', () => {
  const state = createGameState({ width: 800, height: 600 });

  startGame(state);

  assert.equal(state.phase, 'running');
  assert.equal(state.countdownElapsed, COUNTDOWN_SECONDS);
  assert.equal(state.elapsed, 0);
});
```

- [ ] 调整原有“非运行阶段不推进玩法”的测试，使它分别覆盖 `idle` 和 `gameover`，不要再把新增的 `countdown` 当作完全静止状态。
- [ ] 在创建状态与 resize 相关断言中加入 `countdownElapsed`，确认 resize 不改变倒计时进度。

### Step 2：运行测试并确认红灯原因

- [ ] 运行：

```bash
node --test tests/game-core.test.js
```

预期：失败原因只来自缺少倒计时常量、`countdownElapsed`、`startCountdown` 或阶段转换；既有难度和碰撞测试仍保持原结果。

### Step 3：实现核心状态和转换

- [ ] 在 `src/game-core.js` 顶部加入：

```js
export const COUNTDOWN_DIGIT_SECONDS = 1.6;
export const COUNTDOWN_TRANSFER_SECONDS = 0.8;
export const COUNTDOWN_SECONDS = 5.6;
```

- [ ] 保留总时长的显式 `5.6`，不要改成浮点乘加；JavaScript 中 `1.6 * 3 + 0.8` 可能得到 `5.6000000000000005`，会让临界帧多停留一次。
- [ ] 在 `createGameState()` 返回值中，将倒计时独立于正式时间保存：

```js
countdownElapsed: 0,
elapsed: 0,
spawnElapsed: 0,
```

- [ ] 抽取回合重置函数，避免倒计时边界内调用 `startGame()` 时意外清空 fixed-step accumulator：

```js
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
```

- [ ] 在 `stepGame()` 中先处理倒计时边界，再处理正式玩法；边界所在的 fixed step 只完成阶段切换，不提前移动或计分：

```js
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
```

### Step 4：验证核心实现

- [ ] 运行：

```bash
node --test tests/game-core.test.js
npm run check
git diff --check
```

预期：核心测试和完整检查全部通过；已有正式开局 3 秒保护测试不需要改变预期。

### Step 5：自检并提交

- [ ] 检查 `startCountdown()` 和 `startGame()` 都只重置一次回合。
- [ ] 检查倒计时边界没有调用会清空 accumulator 的公开入口。
- [ ] 检查 `elapsed`、`spawnElapsed`、玩家位置和敌人在倒计时期间不变化。
- [ ] 暂存并提交：

```bash
git add src/game-core.js tests/game-core.test.js
git commit -m "feat(core): 增加独立开局倒计时状态"
```

## Task 2：实现可测试的倒计时粒子演出模块

**Files:**

- Create: `src/countdown-animation.js`
- Create: `tests/countdown-animation.test.js`
- Modify: `package.json`

### Step 1：为时序派生写失败测试

- [ ] 新建 `tests/countdown-animation.test.js`，先加入：

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCountdownRenderer,
  getCountdownFrame,
} from '../src/countdown-animation.js';

test('倒计时帧按 3、2 外散和 1 回流分段', () => {
  assert.deepEqual(getCountdownFrame(0), {
    digit: 3,
    stage: 'aggregate',
    stageProgress: 0,
    shieldProgress: 0,
  });
  assert.equal(getCountdownFrame(0.42).stage, 'hold');
  assert.deepEqual(getCountdownFrame(1.12), {
    digit: 3,
    stage: 'explode',
    stageProgress: 0,
    shieldProgress: 0,
  });
  assert.equal(getCountdownFrame(1.6).digit, 2);
  assert.equal(getCountdownFrame(1.6).stage, 'aggregate');
  assert.equal(getCountdownFrame(3.2).digit, 1);
  assert.equal(getCountdownFrame(3.2).stage, 'aggregate');
  assert.equal(getCountdownFrame(4.79).stage, 'hold');
  assert.deepEqual(getCountdownFrame(4.8), {
    digit: 1,
    stage: 'return',
    stageProgress: 0,
    shieldProgress: 0,
  });
  assert.equal(getCountdownFrame(5.2).shieldProgress, 0);
  assert.ok(Math.abs(getCountdownFrame(5.4).shieldProgress - 0.5) < 1e-9);
  assert.deepEqual(getCountdownFrame(5.6), {
    digit: null,
    stage: 'complete',
    stageProgress: 1,
    shieldProgress: 1,
  });
});

test('倒计时帧会夹取非法和越界时间', () => {
  assert.deepEqual(getCountdownFrame(Number.NaN), getCountdownFrame(0));
  assert.deepEqual(getCountdownFrame(-1), getCountdownFrame(0));
  assert.deepEqual(getCountdownFrame(Number.POSITIVE_INFINITY), getCountdownFrame(0));
  assert.deepEqual(getCountdownFrame(99), getCountdownFrame(5.6));
});
```

### Step 2：为粒子采样、缓存、路径和降级写失败测试

- [ ] 在同一文件加入记录绘制调用的主 context：

```js
function createDrawingContext() {
  const calls = [];
  return {
    calls,
    globalAlpha: 1,
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    save() {
      calls.push(['save']);
    },
    restore() {
      calls.push(['restore']);
    },
    translate(...args) {
      calls.push(['translate', ...args]);
    },
    scale(...args) {
      calls.push(['scale', ...args]);
    },
    fillRect(...args) {
      calls.push(['fillRect', ...args]);
    },
    fillText(...args) {
      calls.push(['fillText', ...args]);
    },
  };
}

function createSamplingCanvas(counter) {
  const samplingContext = {
    clearRect() {},
    fillText() {},
    getImageData(_x, _y, width, height) {
      counter.reads += 1;
      const data = new Uint8ClampedArray(width * height * 4);
      for (let index = 0; index < width * height; index += 3) {
        data[index * 4 + 3] = 255;
      }
      return { data };
    },
  };

  return {
    width: 0,
    height: 0,
    getContext() {
      return samplingContext;
    },
  };
}

test('数字模板按数字和字号缓存且粒子数有上限', () => {
  const context = createDrawingContext();
  const counter = { reads: 0 };
  const renderer = createCountdownRenderer({
    context,
    createCanvas: () => createSamplingCanvas(counter),
    maxParticles: 180,
  });
  const common = {
    centerX: 400,
    centerY: 210,
    playerX: 400,
    playerY: 300,
    fontSize: 120,
  };

  renderer.draw({ ...common, frame: getCountdownFrame(0.5) });
  const firstCount = context.calls.filter(([name]) => name === 'fillRect').length;
  renderer.draw({ ...common, frame: getCountdownFrame(0.7) });
  const secondCount =
    context.calls.filter(([name]) => name === 'fillRect').length - firstCount;

  assert.equal(counter.reads, 1);
  assert.ok(firstCount > 0);
  assert.ok(firstCount <= 180);
  assert.equal(secondCount, firstCount);
});

test('3 外散而 1 回流到玩家位置', () => {
  const context = createDrawingContext();
  const renderer = createCountdownRenderer({
    context,
    createCanvas: () => createSamplingCanvas({ reads: 0 }),
  });
  const common = {
    centerX: 400,
    centerY: 210,
    playerX: 400,
    playerY: 300,
    fontSize: 120,
  };

  renderer.draw({
    ...common,
    frame: { ...getCountdownFrame(1.59), stageProgress: 1 },
  });
  const exploded = context.calls
    .filter(([name]) => name === 'fillRect')
    .map(([, x, y]) => [x, y]);
  context.calls.length = 0;

  renderer.draw({
    ...common,
    frame: { ...getCountdownFrame(5.59), stageProgress: 1 },
  });
  const returned = context.calls
    .filter(([name]) => name === 'fillRect')
    .map(([, x, y]) => [x, y]);

  assert.ok(exploded.some(([x, y]) => Math.hypot(x - 400, y - 210) > 120));
  assert.ok(
    returned.every(([x, y]) => Math.hypot(x - 400, y - 300) < 8),
  );
});

test('离屏 Canvas 不可用时回退为实心数字', () => {
  const context = createDrawingContext();
  const renderer = createCountdownRenderer({
    context,
    createCanvas: () => null,
  });

  assert.doesNotThrow(() => {
    renderer.draw({
      frame: getCountdownFrame(0.2),
      centerX: 400,
      centerY: 210,
      playerX: 400,
      playerY: 300,
      fontSize: 120,
    });
  });

  assert.ok(
    context.calls.some(
      ([name, text]) => name === 'fillText' && text === '3',
    ),
  );
});
```

### Step 3：运行测试并确认红灯

- [ ] 运行：

```bash
node --test tests/countdown-animation.test.js
```

预期：模块尚不存在导致失败。

### Step 4：实现确定性帧派生与粒子绘制

- [ ] 新建 `src/countdown-animation.js`，实现以下完整接口：

```js
import {
  COUNTDOWN_DIGIT_SECONDS,
  COUNTDOWN_SECONDS,
} from './game-core.js';

export const COUNTDOWN_AGGREGATE_SECONDS = 0.42;
export const COUNTDOWN_EXPLODE_START_SECONDS = 1.12;
export const COUNTDOWN_SHIELD_START_SECONDS = 5.2;

const COUNTDOWN_RETURN_START_SECONDS = 4.8;
const DEFAULT_MAX_PARTICLES = 180;

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
    : 1 - ((-2 * value + 2) ** 3) / 2;
}

function safeElapsed(elapsedSeconds) {
  return Number.isFinite(elapsedSeconds) && elapsedSeconds >= 0
    ? Math.min(elapsedSeconds, COUNTDOWN_SECONDS)
    : 0;
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

  if (elapsed >= COUNTDOWN_RETURN_START_SECONDS) {
    return {
      digit: 1,
      stage: 'return',
      stageProgress: progressBetween(
        elapsed,
        COUNTDOWN_RETURN_START_SECONDS,
        COUNTDOWN_SECONDS,
      ),
      shieldProgress: progressBetween(
        elapsed,
        COUNTDOWN_SHIELD_START_SECONDS,
        COUNTDOWN_SECONDS,
      ),
    };
  }

  const digitIndex = Math.floor(elapsed / COUNTDOWN_DIGIT_SECONDS);
  const digit = 3 - digitIndex;
  const localElapsed = elapsed - digitIndex * COUNTDOWN_DIGIT_SECONDS;

  if (localElapsed < COUNTDOWN_AGGREGATE_SECONDS) {
    return {
      digit,
      stage: 'aggregate',
      stageProgress: progressBetween(
        localElapsed,
        0,
        COUNTDOWN_AGGREGATE_SECONDS,
      ),
      shieldProgress: 0,
    };
  }

  if (digit !== 1 && localElapsed >= COUNTDOWN_EXPLODE_START_SECONDS) {
    return {
      digit,
      stage: 'explode',
      stageProgress: progressBetween(
        localElapsed,
        COUNTDOWN_EXPLODE_START_SECONDS,
        COUNTDOWN_DIGIT_SECONDS,
      ),
      shieldProgress: 0,
    };
  }

  const holdEnd =
    digit === 1
      ? COUNTDOWN_DIGIT_SECONDS
      : COUNTDOWN_EXPLODE_START_SECONDS;

  return {
    digit,
    stage: 'hold',
    stageProgress: progressBetween(
      localElapsed,
      COUNTDOWN_AGGREGATE_SECONDS,
      holdEnd,
    ),
    shieldProgress: 0,
  };
}

function deterministicDirection(index) {
  const angle = (index * 2.399963229728653) % (Math.PI * 2);
  return {
    x: Math.cos(angle),
    y: Math.sin(angle),
  };
}

function sampleDigit(createCanvas, digit, fontSize, maxParticles) {
  const canvas = createCanvas?.();
  const samplingContext = canvas?.getContext?.('2d');

  if (!samplingContext || typeof samplingContext.getImageData !== 'function') {
    return null;
  }

  const width = Math.max(1, Math.ceil(fontSize * 1.15));
  const height = Math.max(1, Math.ceil(fontSize * 1.35));
  canvas.width = width;
  canvas.height = height;
  samplingContext.clearRect?.(0, 0, width, height);
  samplingContext.fillStyle = '#ffffff';
  samplingContext.font = `900 ${fontSize}px -apple-system, Arial, sans-serif`;
  samplingContext.textAlign = 'center';
  samplingContext.textBaseline = 'middle';
  samplingContext.fillText(String(digit), width / 2, height / 2);

  const imageData = samplingContext.getImageData(0, 0, width, height);
  const spacing = Math.max(3, Math.round(fontSize / 28));
  const points = [];

  for (let y = spacing / 2; y < height; y += spacing) {
    for (let x = spacing / 2; x < width; x += spacing) {
      const pixelX = Math.floor(x);
      const pixelY = Math.floor(y);
      const alpha = imageData.data[(pixelY * width + pixelX) * 4 + 3];
      if (alpha > 64) {
        points.push({
          x: x - width / 2,
          y: y - height / 2,
        });
      }
    }
  }

  if (points.length <= maxParticles) return points;

  const stride = points.length / maxParticles;
  return Array.from(
    { length: maxParticles },
    (_, index) => points[Math.floor(index * stride)],
  );
}

function drawFallback(context, frame, geometry) {
  if (frame.digit === null) return;

  const aggregateScale =
    frame.stage === 'aggregate' ? 0.72 + easeOutCubic(frame.stageProgress) * 0.28 : 1;
  const exitProgress =
    frame.stage === 'explode' || frame.stage === 'return'
      ? easeInOutCubic(frame.stageProgress)
      : 0;
  const targetX =
    geometry.centerX + (geometry.playerX - geometry.centerX) * exitProgress;
  const targetY =
    geometry.centerY + (geometry.playerY - geometry.centerY) * exitProgress;

  context.save();
  context.globalAlpha = frame.stage === 'explode' ? 1 - exitProgress : 1;
  context.fillStyle =
    frame.stage === 'return'
      ? `rgba(0, 221, 255, ${1 - exitProgress * 0.65})`
      : '#ffffff';
  context.font = `900 ${geometry.fontSize}px -apple-system, Arial, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.translate(targetX, targetY);
  context.scale(aggregateScale, aggregateScale);
  context.fillText(String(frame.digit), 0, 0);
  context.restore();
}

function drawParticles(context, frame, points, geometry) {
  const particleSize = Math.max(2, geometry.fontSize / 30);
  const aggregateProgress =
    frame.stage === 'aggregate' ? easeOutCubic(frame.stageProgress) : 1;
  const explodeProgress =
    frame.stage === 'explode' ? easeOutCubic(frame.stageProgress) : 0;
  const returnProgress =
    frame.stage === 'return' ? easeInOutCubic(frame.stageProgress) : 0;

  context.save();

  points.forEach((point, index) => {
    const direction = deterministicDirection(index);
    const startDistance =
      geometry.fontSize * (1.25 + (index % 7) * 0.08);
    const assembledX = geometry.centerX + point.x;
    const assembledY = geometry.centerY + point.y;
    const startX = assembledX + direction.x * startDistance;
    const startY = assembledY + direction.y * startDistance;
    const explodedX =
      assembledX + direction.x * geometry.fontSize * (1.2 + (index % 5) * 0.15);
    const explodedY =
      assembledY + direction.y * geometry.fontSize * (1.2 + (index % 5) * 0.15);

    let x = startX + (assembledX - startX) * aggregateProgress;
    let y = startY + (assembledY - startY) * aggregateProgress;

    if (frame.stage === 'explode') {
      x = assembledX + (explodedX - assembledX) * explodeProgress;
      y = assembledY + (explodedY - assembledY) * explodeProgress;
    } else if (frame.stage === 'return') {
      x = assembledX + (geometry.playerX - assembledX) * returnProgress;
      y = assembledY + (geometry.playerY - assembledY) * returnProgress;
    }

    const cyanMix = frame.stage === 'return' ? returnProgress : 0;
    context.globalAlpha =
      frame.stage === 'explode' ? 1 - explodeProgress * 0.85 : 1;
    context.fillStyle = `rgb(${Math.round(255 * (1 - cyanMix))}, ${Math.round(
      255 - 34 * cyanMix,
    )}, 255)`;
    context.fillRect(
      x - particleSize / 2,
      y - particleSize / 2,
      particleSize,
      particleSize,
    );
  });

  context.restore();
}

export function createCountdownRenderer({
  context,
  createCanvas,
  maxParticles = DEFAULT_MAX_PARTICLES,
}) {
  const cache = new Map();

  function pointsFor(digit, fontSize) {
    const roundedFontSize = Math.max(1, Math.round(fontSize));
    const key = `${digit}:${roundedFontSize}`;
    if (cache.has(key)) return cache.get(key);

    try {
      const points = sampleDigit(
        createCanvas,
        digit,
        roundedFontSize,
        maxParticles,
      );
      cache.set(key, points);
      return points;
    } catch {
      cache.set(key, null);
      return null;
    }
  }

  return {
    draw({ frame, centerX, centerY, playerX, playerY, fontSize }) {
      if (frame.digit === null) return;

      const geometry = {
        centerX,
        centerY,
        playerX,
        playerY,
        fontSize,
      };
      const points = pointsFor(frame.digit, fontSize);

      if (!points || points.length === 0) {
        drawFallback(context, frame, geometry);
        return;
      }

      drawParticles(context, frame, points, geometry);
    },
  };
}
```

### Step 5：修正测试采样夹具的数字像素

- [ ] 测试夹具不能把整个离屏画布当作实心矩形。将 `createSamplingCanvas()` 中 `getImageData()` 的 alpha 填充限制为中间区域，使粒子模板与数字的有界轮廓一致：

```js
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    if (
      x > width * 0.35 &&
      x < width * 0.65 &&
      y > height * 0.12 &&
      y < height * 0.88
    ) {
      data[(y * width + x) * 4 + 3] = 255;
    }
  }
}
```

说明：真实浏览器仍使用字体渲染后的像素；测试只验证缓存、粒子上限和路径，不声称模拟字体字形。

### Step 6：验证动画模块并纳入语法检查

- [ ] 将 `package.json` 的 `check` 改为：

```json
"check": "node --check src/game-core.js && node --check src/countdown-animation.js && node --check src/game.js && node --test"
```

- [ ] 运行：

```bash
node --test tests/countdown-animation.test.js
npm run check
git diff --check
```

预期：帧分段、模板缓存、粒子上限、外散、回流和降级测试全部通过。

### Step 7：自检并提交

- [ ] 确认同一数字与字号只读取一次像素。
- [ ] 确认最大粒子数默认是 180。
- [ ] 确认 `3`、`2` 才进入 `explode`，`1` 只进入 `aggregate`、`hold`、`return`。
- [ ] 确认模块不读写游戏 state，也不调用随机数。
- [ ] 暂存并提交：

```bash
git add src/countdown-animation.js tests/countdown-animation.test.js package.json
git commit -m "feat(ui): 定义倒计时粒子演出"
```

## Task 3：接入浏览器入口和保护罩衔接

**Files:**

- Modify: `src/game.js`
- Modify: `tests/browser-entry.test.js`

### Step 1：扩展浏览器测试夹具

- [ ] 在 `createContext()` 的方法列表中加入：

```js
'clearRect',
'scale',
```

- [ ] 新增离屏 Canvas 测试夹具：

```js
function createOffscreenCanvas() {
  const context = {
    clearRect() {},
    fillText() {},
    getImageData(_x, _y, width, height) {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (
            x > width * 0.35 &&
            x < width * 0.65 &&
            y > height * 0.12 &&
            y < height * 0.88
          ) {
            data[(y * width + x) * 4 + 3] = 255;
          }
        }
      }
      return { data };
    },
  };

  return {
    width: 0,
    height: 0,
    getContext() {
      return context;
    },
  };
}
```

- [ ] 为 `createEnvironment()` 增加 `offscreenAvailable = true` 参数，并给 `documentObject` 增加：

```js
createElement(tagName) {
  if (tagName !== 'canvas' || !offscreenAvailable) return null;
  return createOffscreenCanvas();
},
```

### Step 2：替换旧“准备”测试并写出浏览器行为红灯

- [ ] 删除原有“保护期绘制倒计时和额外光环……”测试，改为以下测试组：

```js
test('开始和重开进入完整倒计时且重复输入不重置进度', () => {
  const environment = createEnvironment();
  const game = createBrowserGame({
    windowObject: environment.windowObject,
    documentObject: environment.documentObject,
  });

  game.beginGame();
  assert.equal(game.getState().phase, 'countdown');
  assert.equal(environment.status.textContent, '倒计时开始');

  game.getState().countdownElapsed = 2.4;
  environment.windowObject.dispatch('keydown', { code: 'Space' });
  environment.canvas.dispatch('pointerdown', pointerEvent());

  assert.equal(game.getState().phase, 'countdown');
  assert.equal(game.getState().countdownElapsed, 2.4);
});

test('倒计时只绘制数字粒子且 5.2 秒后才形成保护罩', () => {
  const environment = createEnvironment();
  const game = createBrowserGame({
    windowObject: environment.windowObject,
    documentObject: environment.documentObject,
  });
  game.beginGame();
  environment.runNextFrame(0);

  const initialTexts = environment.context.calls
    .filter(([name]) => name === 'fillText')
    .map(([, text]) => String(text));
  const initialArcs = environment.context.calls.filter(
    ([name]) => name === 'arc',
  ).length;
  assert.equal(initialTexts.some((text) => text.startsWith('准备')), false);
  assert.equal(initialArcs, 1, '仅绘制玩家本体的常驻内层光晕');

  environment.context.calls.length = 0;
  game.getState().countdownElapsed = 5.4;
  environment.runNextFrame(16);

  const formingArcs = environment.context.calls.filter(
    ([name]) => name === 'arc',
  ).length;
  assert.equal(formingArcs, 2, '回流后半段开始绘制外层保护罩');
});

test('倒计时结束后正式游戏从零开始并完整显示保护罩', () => {
  const environment = createEnvironment();
  const game = createBrowserGame({
    windowObject: environment.windowObject,
    documentObject: environment.documentObject,
  });
  game.beginGame();
  game.getState().countdownElapsed = 5.6 - 1 / 60;

  environment.runNextFrame(1_000);
  environment.runNextFrame(1_017);

  assert.equal(game.getState().phase, 'running');
  assert.equal(game.getState().elapsed, 0);
  assert.equal(environment.status.textContent, '游戏开始');
  const arcs = environment.context.calls.filter(([name]) => name === 'arc');
  assert.ok(arcs.length >= 2);
});

test('离屏 Canvas 失败时用实心数字且不影响正式开局', () => {
  const environment = createEnvironment({ offscreenAvailable: false });
  const game = createBrowserGame({
    windowObject: environment.windowObject,
    documentObject: environment.documentObject,
  });

  game.beginGame();
  assert.doesNotThrow(() => environment.runNextFrame(0));
  assert.ok(
    environment.context.calls.some(
      ([name, text]) => name === 'fillText' && text === '3',
    ),
  );

  game.getState().countdownElapsed = 5.6 - 1 / 60;
  assert.doesNotThrow(() => environment.runNextFrame(17));
  assert.equal(game.getState().phase, 'running');
});
```

- [ ] 更新受阶段语义影响的既有测试：
  - 输入移动测试在 `game.beginGame()` 后显式将 `state.phase = 'running'`、`state.countdownElapsed = 5.6`，使测试继续只关注输入。
  - 碰撞、最高分和 localStorage 测试同样先进入 `running`，不要把 5.6 秒演出重复纳入无关测试。
  - 重开测试改为断言 `phase === 'countdown'`、`countdownElapsed === 0`，并验证首帧没有 pause debt。
  - 正常启动测试把第一阶段预期从 `running` 改为 `countdown`。

### Step 3：运行浏览器入口测试并确认红灯

- [ ] 运行：

```bash
node --test tests/browser-entry.test.js
```

预期：失败原因集中在浏览器入口尚未使用 `startCountdown()`、未接入 renderer、旧保护罩条件仍在 countdown 阶段生效。

### Step 4：接入倒计时入口和输入保护

- [ ] 将 `src/game.js` import 改为：

```js
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
```

- [ ] 在 state 创建后初始化 renderer；离屏 Canvas 能力延迟到实际采样时检查：

```js
const countdownRenderer = createCountdownRenderer({
  context,
  createCanvas: () => documentObject.createElement?.('canvas') ?? null,
});
```

注意：这段代码放在 `context === null` 分支判断之后，或只在 `context !== null` 时创建，不能破坏主 Canvas 不支持时的可见错误路径。

- [ ] 将 `beginGame()` 的启动动作替换为：

```js
previousTimestamp = undefined;
startCountdown(state);
status.textContent = '倒计时开始';
```

- [ ] 新增启动条件并在鼠标、Enter、Space 两条入口复用：

```js
function canBeginGame() {
  return state.phase === 'idle' || state.phase === 'gameover';
}
```

对应条件分别改为：

```js
if (canBeginGame()) {
  beginGame();
}
```

以及：

```js
if (
  canBeginGame() &&
  (event.code === 'Enter' || event.code === 'Space')
) {
```

这样倒计时期间的重复点击或按键不会重置演出。

### Step 5：接入玩家、保护罩和数字绘制

- [ ] 将 `drawPlayer()` 改为显式接收保护罩进度：

```js
function drawPlayer(shieldProgress = 0) {
  const { x, y, size } = state.player;

  if (shieldProgress > 0) {
    const easedProgress = 1 - (1 - clamp(shieldProgress, 0, 1)) ** 3;
    const pulse = 1 + Math.sin(Date.now() / 120) * 0.08;
    context.globalAlpha = easedProgress;
    context.fillStyle = 'rgba(0, 220, 255, 0.16)';
    context.beginPath();
    context.arc(
      x,
      y,
      size * (1.6 + 0.75 * easedProgress) * pulse,
      0,
      Math.PI * 2,
    );
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
```

- [ ] 让 `draw()` 只派生一次 countdown frame，并传入世界和 overlay：

```js
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
```

- [ ] 将 `drawWorld()` 改为：

```js
function drawWorld(countdownFrame) {
  context.save();
  context.globalAlpha = 1;

  if (state.shake > 0) {
    const shakeX = (Math.random() - 0.5) * state.shake * 2;
    const shakeY = (Math.random() - 0.5) * state.shake * 2;
    context.translate(shakeX, shakeY);
  }

  for (const enemy of state.enemies) drawEnemy(enemy);
  for (const particle of state.particles) drawParticle(particle);

  if (state.phase === 'countdown') {
    drawPlayer(countdownFrame?.shieldProgress ?? 0);
  } else if (state.phase === 'running') {
    drawPlayer(
      state.elapsed < OPENING_PROTECTION_SECONDS ? 1 : 0,
    );
  }

  context.globalAlpha = 1;
  context.restore();
}
```

- [ ] 删除 `drawReadyOverlay()`；在 `drawOverlay(metrics, countdownFrame)` 中用 renderer 替代旧“准备”文本：

```js
if (state.phase === 'idle') {
  drawIdleOverlay(metrics);
} else if (state.phase === 'gameover') {
  drawGameOverOverlay(metrics);
} else if (state.phase === 'countdown' && countdownFrame) {
  countdownRenderer.draw({
    frame: countdownFrame,
    centerX: metrics.centerX,
    centerY: metrics.centerY - metrics.fontSize * 1.25,
    playerX: state.player.x,
    playerY: state.player.y,
    fontSize: metrics.fontSize * 2.4,
  });
}
```

### Step 6：在正式切换时更新无障碍状态

- [ ] 在 `gameLoop()` 的阶段转换处理中，先加入：

```js
if (previousPhase === 'countdown' && state.phase === 'running') {
  status.textContent = '游戏开始';
}
```

保留原有 `running → gameover` 的持久化和结束播报。

### Step 7：验证浏览器入口

- [ ] 运行：

```bash
node --test tests/browser-entry.test.js
npm run check
git diff --check
```

预期：全部测试通过，且源码与测试中不再出现旧文案：

```bash
rg -n "准备 [123]|准备 \\$\\{seconds\\}|drawReadyOverlay" src tests
```

预期：无匹配。

### Step 8：自检并提交

- [ ] 检查 `idle`、`countdown`、`running`、`gameover` 四阶段绘制互不串扰。
- [ ] 检查倒计时 HUD 一直读取 `elapsed === 0`。
- [ ] 检查 5.2 秒前只绘制玩家常驻内层光晕，不绘制外层保护罩。
- [ ] 检查正式开始后旧 3 秒保护逻辑仍存在，但不再显示数字。
- [ ] 暂存并提交：

```bash
git add src/game.js tests/browser-entry.test.js
git commit -m "feat(ui): 接入像素倒计时与保护罩衔接"
```

## Task 4：完整回归、浏览器可用性和人工试玩

**Files:**

- Modify: `docs/superpowers/plans/2026-07-24-countdown-transition.md`（只记录实际验证结果）

### Step 1：执行完整静态与自动化验证

- [ ] 运行：

```bash
npm run check
git diff --check
git status --short
```

- [ ] 记录测试总数与通过数，不用“应该通过”代替实际输出。
- [ ] 检查分支相对基线的变更范围：

```bash
git diff --stat f390d59..HEAD
git log --oneline --decorate f390d59..HEAD
```

### Step 2：启动本地 HTTP 服务

- [ ] 使用不会覆盖现有服务的端口启动静态服务：

```bash
python3 -m http.server 4174 --bind 127.0.0.1
```

- [ ] 用浏览器访问 `http://127.0.0.1:4174/`，不要使用 `file://` 作为最终验收入口。

### Step 3：执行浏览器自动冒烟

- [ ] 验证开始、倒计时和正式开始：
  - 页面初始正常绘制且控制台无 error / warning。
  - 点击后状态进入 `countdown`。
  - 倒计时期间 HUD 为 `0 秒`，玩家不移动，敌人为空。
  - 5.6 秒后状态进入 `running`，正式时间从 0 开始。
- [ ] 验证视觉路径：
  - `3` 和 `2` 由方块聚合、清晰停留、向外炸散。
  - `1` 由方块聚合、清晰停留，不向外炸散。
  - `1` 的粒子在最后 0.8 秒直接回流到玩家。
  - 5.2 秒之前没有外层保护罩；5.2–5.6 秒逐渐成形。
  - 正式开始时数字消失、保护罩完整。
- [ ] 验证输入和生命周期：
  - 鼠标、Enter、空格都能开始。
  - 倒计时期间重复点击或按键不会重置。
  - 正式开始后鼠标和键盘都能移动。
  - 碰撞、结算、点击和空格重开均完整可用。

### Step 4：执行真实降级验证

- [ ] 在自动化夹具中确认离屏 Canvas 缺失时的实心数字测试通过。
- [ ] 浏览器中临时通过 DevTools 阻断离屏 `getImageData()` 后刷新，确认：
  - 页面不崩溃。
  - 显示实心数字。
  - 5.6 秒后仍进入正式游戏。
- [ ] 撤销 DevTools 临时改动，确认正常粒子版本恢复；不把调试代码写入仓库。

### Step 5：人工试玩

- [ ] 鼠标完整试玩 3 局。
- [ ] 键盘完整试玩 3 局。
- [ ] 每局确认正式存活时间不包含 5.6 秒倒计时。
- [ ] 至少一局坚持到正式保护结束并观察自然首刷。
- [ ] 至少一局主动碰撞，确认玩家死亡粒子、结算和最高分正常。

### Step 6：记录验证结果并提交文档

- [ ] 仅在实际完成上述验证后，于本文末尾追加：

```md
## 验证记录

- 自动化：`npm run check`，实际结果为 X/X 通过。
- 静态检查：`git diff --check` 通过。
- 浏览器：主流程、降级路径、控制台、鼠标 3 局、键盘 3 局均通过。
- 试玩结论：倒计时不计分；3、2 外散；1 回流；保护罩完全成形后正式开始。
```

- [ ] 暂存并提交：

```bash
git add docs/superpowers/plans/2026-07-24-countdown-transition.md
git commit -m "docs(validation): 记录倒计时完整验证结果"
```

## 最终自检

- [ ] 对照 `docs/superpowers/specs/2026-07-24-countdown-transition-design.md` 逐项确认目标、非目标、状态、时序、降级、自动化和人工验收都有对应步骤。
- [ ] 搜索未落实的占位符：

```bash
rg -n "TODO|FIXME|TBD|待补充|placeholder" src tests
rg -n "TODO|FIXME|TBD|待补充|placeholder" \
  docs/superpowers/plans/2026-07-24-countdown-transition.md | rg -v "rg -n"
```

预期：本次新增代码和计划无未落实占位符。

- [ ] 检查 phase 字符串和倒计时字段在核心、浏览器、测试中一致：

```bash
rg -n "countdownElapsed|phase === 'countdown'|phase, 'countdown'" src tests
```

- [ ] 检查常量只有核心定义，动画模块通过 import 使用：

```bash
rg -n "COUNTDOWN_(DIGIT_SECONDS|TRANSFER_SECONDS|SECONDS)" src tests
```

- [ ] 发起一次最终代码审查，重点检查：
  - fixed-step 边界是否重复计时或丢步。
  - 离屏像素读取是否每帧发生。
  - `context.globalAlpha` 是否在所有路径恢复。
  - 倒计时重复输入是否重置状态。
  - 主 Canvas 不支持路径是否回归。
- [ ] 未经用户明确要求，不合并 main、不清理 worktree、不 push。
