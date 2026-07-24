# 游戏节奏优化实施计划

> **供智能体执行者使用：** 必须使用子技能 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，逐项实施本计划。各步骤使用复选框（`- [ ]`）跟踪状态。

**目标：** 加入 3 秒开局保护和可预测的连续难度曲线，使普通新玩家的单局中位存活时间达到 60–90 秒。

**架构：** `src/game-core.js` 新增纯函数 `getDifficulty(elapsed)`，并在固定时间步长内使用派生难度控制刷怪间隔、生成速度和敌人上限。`src/game.js` 只读取保护期状态，绘制倒计时和玩家光环；输入、碰撞、最高分和持久化边界保持不变。

**技术栈：** 原生 JavaScript ES modules、HTML Canvas、Node.js 内置测试；不新增依赖、构建流程、发布配置或 `package-lock.json`。

---

## 文件范围

- Modify: `src/game-core.js` — 难度曲线、保护期、公平生成和敌人上限。
- Modify: `tests/game-core.test.js` — 难度边界、生成安全、速度倍率、敌人上限和重开回归。
- Modify: `src/game.js` — “准备 3、2、1”和保护期光环。
- Modify: `tests/browser-entry.test.js` — Canvas 渲染行为回归。
- Modify: `docs/superpowers/plans/2026-07-23-gameplay-pacing.md` — 仅勾选执行状态和记录人工试玩结果。

不修改 `index.html`、`README.md`、`package.json`、发布规格或 GitHub 配置。

### Task 1: 建立纯难度曲线

**Files:**
- Modify: `src/game-core.js:1-20`
- Test: `tests/game-core.test.js:1-120`

- [ ] **Step 1: 写入难度边界失败测试**

在 `tests/game-core.test.js` 的 import 中加入 `OPENING_PROTECTION_SECONDS` 和 `getDifficulty`，并增加：

```js
test('getDifficulty 按时间返回连续且有上限的难度', () => {
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
    elapsed,
    isProtected,
    spawnInterval,
    speedMultiplier,
    maxEnemies,
  ] of cases) {
    const difficulty = getDifficulty(elapsed);

    assert.equal(difficulty.isProtected, isProtected);
    assertClose(difficulty.spawnInterval, spawnInterval);
    assertClose(difficulty.speedMultiplier, speedMultiplier);
    assert.equal(difficulty.maxEnemies, maxEnemies);
  }

  assert.equal(OPENING_PROTECTION_SECONDS, 3);
});

test('getDifficulty 将非法时间按开局保护处理', () => {
  for (const elapsed of [
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    assert.deepEqual(getDifficulty(elapsed), getDifficulty(0));
  }
});
```

- [ ] **Step 2: 运行定向测试确认 RED**

Run:

```bash
node --test --test-name-pattern="getDifficulty" tests/game-core.test.js
```

Expected: FAIL，提示 `getDifficulty` 或 `OPENING_PROTECTION_SECONDS` 未导出。

- [ ] **Step 3: 实现最小难度函数**

在 `src/game-core.js` 顶部加入：

```js
export const OPENING_PROTECTION_SECONDS = 3;

function interpolate(value, start, end, from, to) {
  const progress = clamp((value - start) / (end - start), 0, 1);
  return from + (to - from) * progress;
}

export function getDifficulty(elapsed) {
  const safeElapsed =
    Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : 0;

  if (safeElapsed < OPENING_PROTECTION_SECONDS) {
    return {
      isProtected: true,
      spawnInterval: Number.POSITIVE_INFINITY,
      speedMultiplier: 0,
      maxEnemies: 0,
    };
  }

  if (safeElapsed < 20) {
    return {
      isProtected: false,
      spawnInterval: interpolate(safeElapsed, 3, 20, 1.4, 0.9),
      speedMultiplier: interpolate(safeElapsed, 3, 20, 0.45, 0.7),
      maxEnemies: 6,
    };
  }

  if (safeElapsed < 55) {
    return {
      isProtected: false,
      spawnInterval: interpolate(safeElapsed, 20, 55, 0.9, 0.55),
      speedMultiplier: interpolate(safeElapsed, 20, 55, 0.7, 1),
      maxEnemies: 12,
    };
  }

  if (safeElapsed < 90) {
    return {
      isProtected: false,
      spawnInterval: interpolate(safeElapsed, 55, 90, 0.55, 0.32),
      speedMultiplier: interpolate(safeElapsed, 55, 90, 1, 1.3),
      maxEnemies: 18,
    };
  }

  return {
    isProtected: false,
    spawnInterval: 0.32,
    speedMultiplier: 1.3,
    maxEnemies: 18,
  };
}
```

`interpolate` 放在现有 `clamp` 后，确保函数声明提升和调用顺序清晰。

- [ ] **Step 4: 运行定向测试确认 GREEN**

Run:

```bash
node --test --test-name-pattern="getDifficulty" tests/game-core.test.js
```

Expected: 2 tests passed，0 failed。

- [ ] **Step 5: 提交纯难度曲线**

```bash
git add src/game-core.js tests/game-core.test.js
git commit -m "feat(core): 定义平滑难度曲线"
```

### Task 2: 应用保护期和公平刷怪

**Files:**
- Modify: `src/game-core.js:54-166`
- Modify: `src/game-core.js:210-316`
- Test: `tests/game-core.test.js:120-156`
- Test: `tests/game-core.test.js:731-845`

- [ ] **Step 1: 写入保护期、速度和敌人上限失败测试**

删除依赖旧 `INITIAL_SPAWN_INTERVAL`、`MIN_SPAWN_INTERVAL` 和 `SPAWN_INTERVAL_DECREASE` 的四个刷怪测试，移除对应 imports，并加入：

```js
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

test('开局保护允许移动并自然刷怪', () => {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);
  const initialX = state.player.x;

  for (let step = 0; step < 179; step += 1) {
    stepGame(state, FIXED_STEP, keyboardRight, () => 0.5);
  }

  assert.ok(state.player.x > initialX);
  assert.ok(state.elapsed < OPENING_PROTECTION_SECONDS);
  assert.ok(state.enemies.length > 0);
  assert.ok(state.spawnElapsed > 0);
});

test('保护结束后按热身间隔生成首个敌人', () => {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);
  state.elapsed = OPENING_PROTECTION_SECONDS;
  state.spawnElapsed = getDifficulty(state.elapsed).spawnInterval;

  stepGame(state, 0, noInput, () => 0.5);

  assert.equal(state.enemies.length, 1);
});

test('敌人速度在生成时应用难度倍率', () => {
  const randomValues = [0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.125];
  const warm = spawnOneEnemyAt(3, randomValues);
  const high = spawnOneEnemyAt(90, randomValues);
  const warmSpeed = Math.hypot(warm.enemy.vx, warm.enemy.vy);
  const highSpeed = Math.hypot(high.enemy.vx, high.enemy.vy);

  assertClose(highSpeed / warmSpeed, 1.3 / 0.45);
});

test('达到敌人上限时清空刷怪积累且不补刷', () => {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);
  state.elapsed = 20;
  state.spawnElapsed = getDifficulty(state.elapsed).spawnInterval;
  state.enemies = Array.from({ length: 12 }, (_, index) => ({
    x: 100 + index,
    y: 100,
    vx: 0,
    vy: 0,
    size: 4,
    color: '#fff',
  }));

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
  state.spawnElapsed = getDifficulty(state.elapsed).spawnInterval;
  const values = Array.from({ length: 8 }, () => [0.75, 0.5]).flat();
  let randomIndex = 0;

  stepGame(state, 0, noInput, () => values[randomIndex++]);

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
    size: 4,
    color: '#fff',
  });

  startGame(state);

  assert.deepEqual(getDifficulty(state.elapsed), getDifficulty(0));
  assert.equal(state.spawnElapsed, 0);
  assert.deepEqual(state.enemies, []);
});
```

同步清理所有旧派生状态：

- 从 `startGame 原地重置新一局状态并保留开局最高分` 删除 `spawnInterval` 赋值和断言。
- 从 `resizeGame 原地更新实体并保持生命周期状态` 删除 `spawnInterval` 赋值和快照字段。
- 在 `注入的随机序列能确定敌人从四条边界外生成` 中，将刷怪准备改为：

```js
state.elapsed = 3;
state.spawnElapsed = getDifficulty(state.elapsed).spawnInterval;
```

保留该测试的四条边界断言和 7 个确定性随机值。完成修改后运行：

```bash
rg -n "state\\.spawnInterval|INITIAL_SPAWN_INTERVAL|MIN_SPAWN_INTERVAL|SPAWN_INTERVAL_DECREASE" \
  src/game-core.js tests/game-core.test.js
```

Expected: 无输出。

- [ ] **Step 2: 运行核心测试确认 RED**

Run:

```bash
node --test tests/game-core.test.js
```

Expected: FAIL；保护期仍会累计刷怪时间，速度倍率、敌人上限和生成距离规则尚未生效。

- [ ] **Step 3: 实现安全生成点和速度倍率**

用以下边界替换旧的逐次递减常量：

```js
const MIN_SPAWN_DISTANCE_FACTOR = 0.2;
const MAX_SPAWN_ATTEMPTS = 8;
```

将生成点选择拆为：

```js
function createSpawnPoint(state, random, margin) {
  const side = Math.floor(random() * 4);
  const offset = random();

  if (side === 0) return { x: offset * state.width, y: -margin };
  if (side === 1) {
    return { x: state.width + margin, y: offset * state.height };
  }
  if (side === 2) {
    return { x: offset * state.width, y: state.height + margin };
  }
  return { x: -margin, y: offset * state.height };
}
```

将 `spawnEnemy` 改为接收 `speedMultiplier` 并返回是否生成成功：

```js
function spawnEnemy(state, random, speedMultiplier) {
  const shortEdge = Math.min(state.width, state.height);
  const margin = shortEdge * 0.05;
  const minimumDistance = shortEdge * MIN_SPAWN_DISTANCE_FACTOR;
  let point = null;

  for (let attempt = 0; attempt < MAX_SPAWN_ATTEMPTS; attempt += 1) {
    const candidate = createSpawnPoint(state, random, margin);
    const distance = Math.hypot(
      candidate.x - state.player.x,
      candidate.y - state.player.y,
    );

    if (distance >= minimumDistance) {
      point = candidate;
      break;
    }
  }

  if (point === null) return false;

  const dx =
    state.player.x - point.x + (random() - 0.5) * shortEdge * 0.25;
  const dy =
    state.player.y - point.y + (random() - 0.5) * shortEdge * 0.25;
  const distance = Math.hypot(dx, dy) || 1;
  const baseSpeed = shortEdge * 0.006 * 60;
  const speed =
    (baseSpeed + random() * baseSpeed * 1.5) * speedMultiplier;

  state.enemies.push({
    x: point.x,
    y: point.y,
    vx: (dx / distance) * speed,
    vy: (dy / distance) * speed,
    size: shortEdge * (0.01 + random() * 0.016),
    color: `hsl(${random() * 360}, 80%, 55%)`,
  });

  return true;
}
```

- [ ] **Step 4: 用派生难度替换旧刷怪递减**

将 `updateEnemies` 的刷怪部分替换为：

```js
function updateEnemies(state, deltaTime, random) {
  const difficulty = getDifficulty(state.elapsed);

  if (difficulty.isProtected) {
    state.spawnElapsed = 0;
  } else if (state.enemies.length >= difficulty.maxEnemies) {
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

  if (collided) endGame(state, random);
}
```

从 `createGameState` 和 `startGame` 删除 `spawnInterval` 字段；保留 `spawnElapsed`。

- [ ] **Step 5: 运行核心测试确认 GREEN**

Run:

```bash
node --test tests/game-core.test.js
```

Expected: 全部核心测试通过，0 failed。

- [ ] **Step 6: 提交保护期和刷怪规则**

```bash
git add src/game-core.js tests/game-core.test.js
git commit -m "feat(core): 应用公平刷怪与敌人上限"
```

### Task 3: 绘制保护期反馈

**Files:**
- Modify: `src/game.js:1-10`
- Modify: `src/game.js:351-368`
- Modify: `src/game.js:489-500`
- Test: `tests/browser-entry.test.js:648-662`

- [ ] **Step 1: 写入倒计时和光环失败测试**

在 `tests/browser-entry.test.js` 增加：

```js
test('保护期绘制倒计时和额外光环并在三秒后消失', () => {
  const environment = createEnvironment();
  const game = createBrowserGame({
    windowObject: environment.windowObject,
    documentObject: environment.documentObject,
  });

  game.beginGame();
  environment.runNextFrame(0);

  let labels = environment.context.calls
    .filter(([method]) => method === 'fillText')
    .map(([, text]) => text);
  let arcCount = environment.context.calls
    .filter(([method]) => method === 'arc').length;
  assert.ok(labels.includes('准备 3'));
  assert.equal(arcCount, 2);

  environment.context.calls.length = 0;
  game.getState().elapsed = 1.1;
  environment.runNextFrame(16);
  labels = environment.context.calls
    .filter(([method]) => method === 'fillText')
    .map(([, text]) => text);
  assert.ok(labels.includes('准备 2'));

  environment.context.calls.length = 0;
  game.getState().elapsed = 3;
  environment.runNextFrame(34);
  labels = environment.context.calls
    .filter(([method]) => method === 'fillText')
    .map(([, text]) => text);
  arcCount = environment.context.calls
    .filter(([method]) => method === 'arc').length;
  assert.equal(labels.some((text) => text.startsWith('准备 ')), false);
  assert.equal(arcCount, 1);
});
```

- [ ] **Step 2: 运行浏览器入口测试确认 RED**

Run:

```bash
node --test --test-name-pattern="保护期绘制" tests/browser-entry.test.js
```

Expected: FAIL；不存在“准备 3”文本，保护期和普通阶段的玩家弧形数量相同。

- [ ] **Step 3: 实现玩家保护光环**

从 `game-core.js` 导入 `OPENING_PROTECTION_SECONDS`。在 `drawPlayer` 的现有光圈之前加入：

```js
if (state.elapsed < OPENING_PROTECTION_SECONDS) {
  const pulse = 1 + Math.sin(Date.now() / 120) * 0.08;
  context.fillStyle = 'rgba(0, 220, 255, 0.16)';
  context.beginPath();
  context.arc(x, y, size * 2.35 * pulse, 0, Math.PI * 2);
  context.fill();
}
```

- [ ] **Step 4: 实现准备倒计时**

在 `drawGameOverOverlay` 前加入：

```js
function drawReadyOverlay(metrics) {
  const seconds = Math.ceil(
    OPENING_PROTECTION_SECONDS - state.elapsed,
  );

  if (seconds <= 0) return;

  context.fillStyle = 'rgba(255, 255, 255, 0.82)';
  context.font = `bold ${metrics.fontSize * 0.8}px -apple-system, Arial, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(
    `准备 ${seconds}`,
    metrics.centerX,
    metrics.centerY - metrics.fontSize * 2,
  );
}
```

在 `drawOverlay` 中增加运行阶段分支：

```js
if (state.phase === 'idle') {
  drawIdleOverlay(metrics);
} else if (state.phase === 'gameover') {
  drawGameOverOverlay(metrics);
} else if (state.elapsed < OPENING_PROTECTION_SECONDS) {
  drawReadyOverlay(metrics);
}
```

- [ ] **Step 5: 运行浏览器测试确认 GREEN**

Run:

```bash
node --test tests/browser-entry.test.js
```

Expected: 全部浏览器入口测试通过，0 failed。

- [ ] **Step 6: 提交保护期画面反馈**

```bash
git add src/game.js tests/browser-entry.test.js
git commit -m "feat(ui): 展示开局保护倒计时"
```

### Task 4: 完整回归与人工节奏验收

**Files:**
- Modify: `docs/superpowers/plans/2026-07-23-gameplay-pacing.md`

- [ ] **Step 1: 运行完整自动化检查**

Run:

```bash
npm run check
git diff --check
git status --short --branch
```

Expected: 所有测试通过，`git diff --check` 无输出，工作区仅包含尚未勾选提交的计划文档。

- [ ] **Step 2: 启动独立试玩服务**

Run:

```bash
python3 -m http.server 4174 --bind 127.0.0.1
```

Expected: `http://127.0.0.1:4174/` 返回 200。验证完成后使用 Ctrl-C 退出服务。

- [ ] **Step 3: 完成技术 smoke test**

在受控浏览器中验证：

- 点击和 Enter 均可开始。
- 前 3 秒显示“准备 3、2、1”，玩家可以移动，画面中已有低速预热敌人。
- 保护期碰撞不会结束游戏，保护结束后恢复正常碰撞。
- 碰撞后出现结算页。
- 点击和 Space 均可重开，并重新进入 3 秒保护期。
- 页面 console 没有 error 或 warning。

Expected: 上述六项全部通过。

- [ ] **Step 4: 收集六局人工试玩数据**

请用户在同一地址完成鼠标 3 局、键盘 3 局，并返回六个存活秒数及明显不公平的死亡原因。按以下规则判断：

- 六局中位数位于 60–90 秒：通过。
- 中位数低于 60 秒：只提高 20 秒后的刷怪间隔或降低速度倍率。
- 中位数高于 90 秒：只降低 55 秒后的刷怪间隔或提高速度倍率。
- 不增加生命、护盾、技能或新敌人类型。

每轮调参都必须先更新 `getDifficulty` 的边界测试，再修改实现，并重新执行 `npm run check`。

- [ ] **Step 5: 记录验收结果并提交计划状态**

在本计划末尾追加六局存活时间、中位数、调参次数和最终结论；填写真实值，不保留空白占位符。然后执行：

```bash
git add docs/superpowers/plans/2026-07-23-gameplay-pacing.md
git commit -m "docs(playtest): 记录游戏节奏验收结果"
```

- [ ] **Step 6: 最终验证**

Run:

```bash
npm run check
git diff --check
git status --short --branch
```

Expected: 自动化检查全部通过，差异检查无错误，工作区干净，当前分支为 `feature/huanxiong/gameplay-pacing`。
