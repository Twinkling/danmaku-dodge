# 预判型敌人与阶段构成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一开局热身难度，将出生安全距离调整为 5%，并在 20 秒后按阶段加入可识别的预判型敌人。

**Architecture:** 保留 `game-core.js` 的单一敌人数组和更新管线，只给玩家补充最近实际速度、给敌人补充类型，并在生成时选择当前位置或 0.6 秒预判位置。`game.js` 仅根据类型选择圆形或菱形绘制，不新增模块、调度器、资源或运行依赖。

**Tech Stack:** 原生 JavaScript ES Modules、Canvas 2D、Node.js 内置 `node:test` 与 `assert/strict`

---

## 文件结构

- Modify: `src/game-core.js` — 热身曲线、5% 出生距离、玩家实际速度、阶段敌人比例和预判方向。
- Modify: `tests/game-core.test.js` — 难度边界、出生距离、类型比例、预判方向、重置和缩放回归。
- Modify: `src/game.js` — 橙红色菱形预判敌人和普通圆形回退。
- Modify: `tests/browser-entry.test.js` — 记录绘制颜色并验证两类敌人路径。
- Modify: `docs/superpowers/specs/2026-07-23-gameplay-pacing-design.md` — 消除旧保护期参数与新规则的冲突。

不创建新的源码模块，不拆分现有敌人数组，不引入配置层或敌人类层次。

### Task 1: 统一开局热身曲线与出生距离

**Files:**
- Modify: `tests/game-core.test.js:89-127`
- Modify: `tests/game-core.test.js:924-1032`
- Modify: `tests/game-core.test.js:1072-1087`
- Modify: `src/game-core.js:12-19`
- Modify: `src/game-core.js:30-62`

- [ ] **Step 1: 写入连续热身曲线失败测试**

将 `getDifficulty 按时间返回分段难度` 中的用例替换为：

```js
const cases = [
  [0, true, 1.4, 0.45, 6],
  [2.999, true, 1.325025, 0.4874875, 6],
  [3, false, 1.325, 0.4875, 6],
  [10, false, 1.15, 0.575, 6],
  [20, false, 0.9, 0.7, 12],
  [37.5, false, 0.725, 0.85, 12],
  [55, false, 0.55, 1, 18],
  [72.5, false, 0.435, 1.15, 18],
  [90, false, 0.32, 1.3, 18],
  [300, false, 0.32, 1.3, 18],
];
```

现有断言结构保持不变。

- [ ] **Step 2: 写入保护罩只免疫碰撞的失败测试**

用以下测试替换 `固定步累加使保护期内自然首刷且保护结束后延续节奏`：

```js
test('保护期沿用热身刷怪且保护结束不重置积累', () => {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);
  state.spawnElapsed = getDifficulty(0).spawnInterval - FIXED_STEP;

  stepGame(state, FIXED_STEP, noInput, () => 0.5);

  assert.equal(getDifficulty(state.elapsed).protected, true);
  assert.equal(state.enemies.length, 1);

  state.enemies = [];
  state.elapsed = 2.99;
  state.spawnElapsed = 0.4;
  stepGame(state, FIXED_STEP, noInput, () => 0.5);

  assert.equal(getDifficulty(state.elapsed).protected, false);
  assert.equal(state.enemies.length, 0);
  assertClose(state.spawnElapsed, 0.4 + FIXED_STEP);
});
```

- [ ] **Step 3: 写入 5% 出生距离失败测试**

用以下测试替换 `八次生成点过近时跳过本次刷怪`：

```js
test('靠近边缘的玩家允许生成满足短边百分之五距离的敌人', () => {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);
  state.elapsed = 3;
  state.player.x = state.player.size;
  state.player.y = state.height / 2;
  state.spawnElapsed = getDifficulty(3).spawnInterval;
  const randomValues = [0.75, 0.5, 0.5, 0.5, 0.5, 0.5, 0.125];
  let randomIndex = 0;

  stepGame(state, 0, noInput, () => randomValues[randomIndex++]);

  assert.equal(randomIndex, randomValues.length);
  assert.equal(state.enemies.length, 1);
  assert.ok(
    Math.hypot(
      state.enemies[0].x - state.player.x,
      state.enemies[0].y - state.player.y,
    ) >= Math.min(state.width, state.height) * 0.05,
  );
});
```

- [ ] **Step 4: 运行核心测试并确认按预期失败**

Run:

```bash
node --test tests/game-core.test.js
```

Expected: FAIL；0–3 秒仍返回独立保护期参数，且靠近边缘的左侧出生点仍因 20% 距离规则被拒绝。

- [ ] **Step 5: 实现最小热身曲线与距离调整**

在 `src/game-core.js` 中：

```js
const MIN_SPAWN_DISTANCE_FACTOR = 0.05;
const MAX_SPAWN_ATTEMPTS = 8;
const WARMUP_SPAWN_INTERVAL = 1.4;
const WARMUP_SPEED_MULTIPLIER = 0.45;
const WARMUP_ENEMY_CAP = 6;
```

删除 `PROTECTION_SPAWN_INTERVAL`、`PROTECTION_SPEED_MULTIPLIER` 和 `PROTECTION_ENEMY_CAP`，并将 `getDifficulty()` 的前两段合并为：

```js
if (elapsed < 20) {
  return {
    protected: elapsed < OPENING_PROTECTION_SECONDS,
    spawnInterval: interpolate(
      elapsed,
      0,
      20,
      WARMUP_SPAWN_INTERVAL,
      0.9,
    ),
    speedMultiplier: interpolate(
      elapsed,
      0,
      20,
      WARMUP_SPEED_MULTIPLIER,
      0.7,
    ),
    enemyCap: WARMUP_ENEMY_CAP,
  };
}
```

20 秒后的现有分段保持不变。

- [ ] **Step 6: 运行核心测试并确认通过**

Run:

```bash
node --test tests/game-core.test.js
```

Expected: PASS，全部核心测试通过。

- [ ] **Step 7: 提交热身曲线与出生距离**

```bash
git add tests/game-core.test.js src/game-core.js
git commit -m "feat(gameplay): 统一开局热身难度"
```

### Task 2: 增加阶段比例与预判方向

**Files:**
- Modify: `tests/game-core.test.js:54-65`
- Modify: `tests/game-core.test.js:89-127`
- Modify: `tests/game-core.test.js:142-266`
- Modify: `tests/game-core.test.js:336-378`
- Modify: `tests/game-core.test.js:1034-1044`
- Modify: `tests/game-core.test.js:1089-1147`
- Modify: `src/game-core.js:9-19`
- Modify: `src/game-core.js:30-88`
- Modify: `src/game-core.js:94-186`
- Modify: `src/game-core.js:308-395`

- [ ] **Step 1: 写入阶段预判比例失败测试**

给 `getDifficulty 按时间返回分段难度` 的每个用例增加预判比例：

```js
const cases = [
  [0, true, 1.4, 0.45, 6, 0],
  [2.999, true, 1.325025, 0.4874875, 6, 0],
  [3, false, 1.325, 0.4875, 6, 0],
  [10, false, 1.15, 0.575, 6, 0],
  [20, false, 0.9, 0.7, 12, 0.25],
  [37.5, false, 0.725, 0.85, 12, 0.25],
  [55, false, 0.55, 1, 18, 0.5],
  [72.5, false, 0.435, 1.15, 18, 0.5],
  [90, false, 0.32, 1.3, 18, 0.75],
  [300, false, 0.32, 1.3, 18, 0.75],
];
```

将原有难度循环更新为：

```js
for (const testCase of cases) {
  const [
    elapsedSeconds,
    expectedProtected,
    expectedSpawnInterval,
    expectedSpeedMultiplier,
    expectedEnemyCap,
    expectedPredictiveRatio,
  ] = testCase;
  const difficulty = getDifficulty(elapsedSeconds);

  assert.deepEqual(Object.keys(difficulty).sort(), [
    'enemyCap',
    'predictiveRatio',
    'protected',
    'spawnInterval',
    'speedMultiplier',
  ]);
  assert.equal(difficulty.protected, expectedProtected);
  assertClose(difficulty.spawnInterval, expectedSpawnInterval);
  assertClose(difficulty.speedMultiplier, expectedSpeedMultiplier);
  assert.equal(difficulty.enemyCap, expectedEnemyCap);
  assertClose(difficulty.predictiveRatio, expectedPredictiveRatio);
}
```

- [ ] **Step 2: 写入玩家实际速度失败测试**

在玩家移动测试附近增加：

```js
test('玩家记录最近固定步的实际移动速度', () => {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);

  stepGame(state, FIXED_STEP, keyboardRight, () => 0.5);

  assertClose(state.player.vx, 600 * 0.65);
  assert.equal(state.player.vy, 0);

  stepGame(state, FIXED_STEP, noInput, () => 0.5);

  assert.equal(state.player.vx, 0);
  assert.equal(state.player.vy, 0);
});
```

在尺寸迁移测试调用 `resizeGame()` 前设置：

```js
state.player.vx = 120;
state.player.vy = 60;
```

该测试把画布短边缩小一半，因此玩家完整对象期望更新为：

```js
assert.deepEqual(state.player, {
  x: 100,
  y: 75,
  size: 8,
  vx: 60,
  vy: 30,
});
```

并在 `createGameState` 与重开测试中增加：

```js
assert.equal(state.player.vx, 0);
assert.equal(state.player.vy, 0);
```

- [ ] **Step 3: 写入敌人类型比例失败测试**

增加：

```js
test('阶段比例边界确定生成普通或预判型敌人', () => {
  const cases = [
    [20, 0.249, 'predictive'],
    [20, 0.25, 'normal'],
    [55, 0.499, 'predictive'],
    [55, 0.5, 'normal'],
    [90, 0.749, 'predictive'],
    [90, 0.75, 'normal'],
  ];

  for (const [elapsed, typeRandom, expectedType] of cases) {
    const values = [
      0,
      0.5,
      typeRandom,
      0.5,
      0.5,
      0.5,
      0.5,
      0.125,
    ];
    const { enemy, randomIndex } = spawnOneEnemyAt(elapsed, values);

    assert.equal(enemy.type, expectedType);
    assert.equal(randomIndex, values.length);
  }

  const warmup = spawnOneEnemyAt(
    19.999,
    [0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.125],
  );
  assert.equal(warmup.enemy.type, 'normal');
});
```

- [ ] **Step 4: 写入预判方向与固定航向失败测试**

增加：

```js
function spawnMovingEnemy(typeRandom) {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);
  state.elapsed = 20;
  state.spawnElapsed = getDifficulty(20).spawnInterval;
  const values = [
    0,
    0.5,
    typeRandom,
    0.5,
    0.5,
    0.5,
    0.5,
    0.125,
  ];
  let randomIndex = 0;

  stepGame(
    state,
    FIXED_STEP,
    keyboardRight,
    () => values[randomIndex++],
  );

  return { state, enemy: state.enemies[0] };
}

test('预判型敌人瞄准玩家约零点六秒后的预计位置', () => {
  const predictive = spawnMovingEnemy(0);
  const normal = spawnMovingEnemy(0.9);

  assert.equal(predictive.enemy.type, 'predictive');
  assert.equal(normal.enemy.type, 'normal');
  assertClose(
    Math.hypot(predictive.enemy.vx, predictive.enemy.vy),
    Math.hypot(normal.enemy.vx, normal.enemy.vy),
  );
  assert.ok(
    predictive.enemy.vx / predictive.enemy.vy >
      normal.enemy.vx / normal.enemy.vy,
  );
});

test('预判型敌人出生后不再修正方向', () => {
  const { state, enemy } = spawnMovingEnemy(0);
  const initialVelocity = { vx: enemy.vx, vy: enemy.vy };
  state.spawnElapsed = 0;

  stepGame(state, FIXED_STEP, {
    ...keyboardRight,
    right: false,
    left: true,
  }, () => 0.5);

  assert.equal(enemy.vx, initialVelocity.vx);
  assert.equal(enemy.vy, initialVelocity.vy);
});
```

- [ ] **Step 5: 调整既有随机序列测试**

将 `敌人速度在生成时应用难度倍率` 改为：

```js
test('敌人速度在生成时应用难度倍率', () => {
  const warmupValues = [0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.125];
  const intenseValues = [0, 0.5, 0.9, 0.5, 0.5, 0.5, 0.5, 0.125];
  const warmup = spawnOneEnemyAt(0, warmupValues);
  const intense = spawnOneEnemyAt(90, intenseValues);
  const warmupSpeed = Math.hypot(warmup.enemy.vx, warmup.enemy.vy);
  const intenseSpeed = Math.hypot(intense.enemy.vx, intense.enemy.vy);

  assert.equal(warmup.randomIndex, warmupValues.length);
  assert.equal(intense.randomIndex, intenseValues.length);
  assertClose(intenseSpeed / warmupSpeed, 1.3 / 0.45);
});
```

四边生成测试继续使用 3 秒热身阶段，原有 7 个随机值不变，并增加：

```js
assert.equal(enemy.type, 'normal');
```

- [ ] **Step 6: 运行核心测试并确认按预期失败**

Run:

```bash
node --test tests/game-core.test.js
```

Expected: FAIL；难度尚无 `predictiveRatio`，玩家没有速度字段，敌人没有类型和预判方向。

- [ ] **Step 7: 实现玩家速度与阶段比例**

在 `src/game-core.js` 增加：

```js
const PREDICTIVE_LEAD_SECONDS = 0.6;
const NORMAL_TARGET_JITTER_FACTOR = 0.25;
const PREDICTIVE_TARGET_JITTER_FACTOR = 0.1;
```

给四个难度返回值分别增加：

```js
predictiveRatio: 0,
predictiveRatio: 0.25,
predictiveRatio: 0.5,
predictiveRatio: 0.75,
```

在 `updatePlayer()` 开头记录旧坐标，并在边界夹取后记录实际速度：

```js
const previousX = state.player.x;
const previousY = state.player.y;

// 保留现有输入移动和边界夹取逻辑。

if (deltaTime > 0) {
  state.player.vx = (state.player.x - previousX) / deltaTime;
  state.player.vy = (state.player.y - previousY) / deltaTime;
} else {
  state.player.vx = 0;
  state.player.vy = 0;
}
```

在 `createGameState()` 和 `resetRound()` 创建玩家时增加：

```js
vx: 0,
vy: 0,
```

在 `resizeGame()` 更新玩家大小前增加：

```js
state.player.vx =
  Number.isFinite(state.player.vx) ? state.player.vx * sizeRatio : 0;
state.player.vy =
  Number.isFinite(state.player.vy) ? state.player.vy * sizeRatio : 0;
```

- [ ] **Step 8: 实现最小预判生成逻辑**

把 `spawnEnemy()` 第三个参数改为 `difficulty`，在确定出生点后增加：

```js
const isPredictive =
  difficulty.predictiveRatio > 0 &&
  random() < difficulty.predictiveRatio;
const type = isPredictive ? 'predictive' : 'normal';
const playerVx = Number.isFinite(state.player.vx) ? state.player.vx : 0;
const playerVy = Number.isFinite(state.player.vy) ? state.player.vy : 0;
const targetX = clampPlayerAxis(
  state.player.x + (isPredictive ? playerVx * PREDICTIVE_LEAD_SECONDS : 0),
  state.player.size,
  state.width,
);
const targetY = clampPlayerAxis(
  state.player.y + (isPredictive ? playerVy * PREDICTIVE_LEAD_SECONDS : 0),
  state.player.size,
  state.height,
);
const jitterFactor = isPredictive
  ? PREDICTIVE_TARGET_JITTER_FACTOR
  : NORMAL_TARGET_JITTER_FACTOR;
const dx =
  targetX - spawnPoint.x + (random() - 0.5) * shortEdge * jitterFactor;
const dy =
  targetY - spawnPoint.y + (random() - 0.5) * shortEdge * jitterFactor;
```

保留现有归一化、速度、尺寸和颜色计算，并在敌人对象中增加：

```js
type,
```

把调用改为：

```js
if (!spawnEnemy(state, random, difficulty)) {
  state.spawnElapsed = 0;
}
```

速度计算使用：

```js
const speed =
  (baseSpeed + random() * baseSpeed * 1.5) *
  difficulty.speedMultiplier;
```

- [ ] **Step 9: 运行核心测试并确认通过**

Run:

```bash
node --test tests/game-core.test.js
```

Expected: PASS，全部核心测试通过。

- [ ] **Step 10: 提交预判敌人核心规则**

```bash
git add tests/game-core.test.js src/game-core.js
git commit -m "feat(gameplay): 增加分阶段预判敌人"
```

### Task 3: 绘制橙红色菱形敌人

**Files:**
- Modify: `tests/browser-entry.test.js:52-93`
- Modify: `tests/browser-entry.test.js:658-720`
- Modify: `src/game.js:342-358`

- [ ] **Step 1: 让 Canvas 测试桩记录填充颜色**

在 `createContext()` 创建 `context` 后增加：

```js
let fillStyle = '';
Object.defineProperty(context, 'fillStyle', {
  get() {
    return fillStyle;
  },
  set(value) {
    fillStyle = value;
    calls.push(['fillStyle', value]);
  },
});
```

- [ ] **Step 2: 写入菱形和普通回退失败测试**

增加：

```js
test('预判型敌人绘制为橙红菱形且未知类型回退圆形', () => {
  const environment = createEnvironment();
  const game = createBrowserGame({
    windowObject: environment.windowObject,
    documentObject: environment.documentObject,
  });
  const state = game.getState();
  state.phase = 'running';
  state.elapsed = 10;
  state.enemies.push(
    {
      type: 'predictive',
      x: 100,
      y: 120,
      vx: 0,
      vy: 0,
      size: 10,
      color: '#fff',
    },
    {
      type: 'normal',
      x: 200,
      y: 120,
      vx: 0,
      vy: 0,
      size: 10,
      color: '#0f0',
    },
    {
      type: 'future-type',
      x: 300,
      y: 120,
      vx: 0,
      vy: 0,
      size: 10,
      color: '#00f',
    },
  );

  environment.runNextFrame(0);

  assert.ok(
    environment.context.calls.some(
      (call) => JSON.stringify(call) ===
        JSON.stringify(['fillStyle', '#ff6438']),
    ),
  );
  assert.ok(
    environment.context.calls.some(
      (call) => JSON.stringify(call) ===
        JSON.stringify(['moveTo', 100, 110]),
    ),
  );
  assert.ok(
    environment.context.calls.some(
      ([method, x, y, radius]) =>
        method === 'arc' && x === 200 && y === 120 && radius === 10,
    ),
  );
  assert.ok(
    environment.context.calls.some(
      ([method, x, y, radius]) =>
        method === 'arc' && x === 300 && y === 120 && radius === 10,
    ),
  );
});
```

- [ ] **Step 3: 运行浏览器入口测试并确认按预期失败**

Run:

```bash
node --test tests/browser-entry.test.js
```

Expected: FAIL；预判型敌人仍走普通圆形绘制，不存在橙红色菱形路径。

- [ ] **Step 4: 实现菱形绘制**

在 `drawEnemy()` 前增加：

```js
function drawPredictiveEnemy(enemy) {
  context.fillStyle = '#ff6438';
  context.beginPath();
  context.moveTo(enemy.x, enemy.y - enemy.size);
  context.lineTo(enemy.x + enemy.size, enemy.y);
  context.lineTo(enemy.x, enemy.y + enemy.size);
  context.lineTo(enemy.x - enemy.size, enemy.y);
  context.lineTo(enemy.x, enemy.y - enemy.size);
  context.fill();

  const highlightSize = enemy.size * 0.35;
  context.fillStyle = 'rgba(255, 255, 255, 0.45)';
  context.beginPath();
  context.moveTo(enemy.x, enemy.y - highlightSize);
  context.lineTo(enemy.x + highlightSize, enemy.y);
  context.lineTo(enemy.x, enemy.y + highlightSize);
  context.lineTo(enemy.x - highlightSize, enemy.y);
  context.lineTo(enemy.x, enemy.y - highlightSize);
  context.fill();
}
```

在现有 `drawEnemy()` 开头增加：

```js
if (enemy.type === 'predictive') {
  drawPredictiveEnemy(enemy);
  return;
}
```

其余普通圆形绘制保持不变，因此未知类型自然回退为普通敌人。

- [ ] **Step 5: 运行浏览器入口测试并确认通过**

Run:

```bash
node --test tests/browser-entry.test.js
```

Expected: PASS，全部浏览器入口测试通过。

- [ ] **Step 6: 提交预判敌人视觉**

```bash
git add tests/browser-entry.test.js src/game.js
git commit -m "feat(ui): 区分预判型敌人外观"
```

### Task 4: 同步文档并完成整体验证

**Files:**
- Modify: `docs/superpowers/specs/2026-07-23-gameplay-pacing-design.md:1-79`
- Verify: `src/game-core.js`
- Verify: `src/game.js`
- Verify: `tests/game-core.test.js`
- Verify: `tests/browser-entry.test.js`

- [ ] **Step 1: 同步旧玩法节奏文档**

将文档开头的修订说明改为：

```md
> 2026-07-24 修订：独立倒计时与保护罩衔接以
> `2026-07-24-countdown-transition-design.md` 为准；0–20 秒统一热身曲线、
> 5% 出生距离和阶段敌人构成以
> `2026-07-24-predictive-enemies-design.md` 为准。
```

将难度表改为：

```md
| 时间 | 节奏 | 刷怪间隔 | 速度倍率 | 场上敌人上限 |
|---|---|---:|---:|---:|
| 0–20 秒 | 热身 | 1.4 → 0.9 秒 | 0.45 → 0.7 | 6 |
| 20–55 秒 | 稳步加压 | 0.9 → 0.55 秒 | 0.7 → 1.0 | 12 |
| 55–90 秒 | 高压阶段 | 0.55 → 0.32 秒 | 1.0 → 1.3 | 18 |
| 90 秒后 | 保持高难度 | 0.32 秒 | 1.3 | 18 |
```

将自动化验证中的旧边界描述改为：

```md
- `getDifficulty()` 在 0–20 秒使用连续热身曲线；20、55、90 秒切换预判型敌人比例。
- 正式开始后的前 3 秒只提供碰撞免疫，刷怪参数继续沿用热身曲线。
```

将生成距离规则改为：

```md
- 敌人仍从屏幕外生成；候选生成点与玩家的距离小于短边 5% 时重新选择。
```

将旧版非目标中的“或新敌人类型”删除，保留“不增加生命、护盾、技能、道具”。

- [ ] **Step 2: 运行完整自动化检查**

Run:

```bash
npm run check
```

Expected: PASS；JavaScript 语法检查通过，全部测试通过且无失败。

- [ ] **Step 3: 检查补丁格式和范围**

Run:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` 无输出；状态只包含本任务的文档改动。

- [ ] **Step 4: 提交文档同步**

```bash
git add docs/superpowers/specs/2026-07-23-gameplay-pacing-design.md
git commit -m "docs(spec): 同步预判敌人阶段规则"
```

- [ ] **Step 5: 启动本地服务进行人工验收**

Run:

```bash
python3 -m http.server 4175 --bind 127.0.0.1
```

Expected: `http://127.0.0.1:4175/` 可访问。至少确认：

- 0–20 秒只出现普通圆形敌人。
- 前 3 秒保护罩存在，敌人正常生成且碰撞不死亡。
- 20 秒后出现橙红色菱形敌人。
- 玩家持续向一个方向移动时，菱形敌人的入射方向领先当前位置。
- 菱形敌人出生后不会继续转向。
- 碰撞、结算和重开完整可用。

- [ ] **Step 6: 复核运行结果与提交状态**

Run:

```bash
git status --short --branch
git log --oneline -5
```

Expected: 工作区干净；最近提交依次覆盖热身规则、预判核心、视觉和文档，没有无关改动。
