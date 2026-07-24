# 难度曲线扩展实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 逐项实施本计划。所有步骤使用复选框跟踪。

**Goal:** 将正式游戏难度扩展为持续至 150 秒的六段连续曲线，最终达到 `0.16` 秒刷怪间隔、`2.00` 倍速度和 72 个敌人上限。

**Architecture:** 继续由 `src/game-core.js` 的纯函数 `getDifficulty(elapsed)` 派生全部难度参数，不增加运行时状态或模块。测试先锁定阶段边界、连续插值、敌人构成和上限行为，再最小化替换现有参数分支；渲染、输入和倒计时不改动。

**Tech Stack:** 原生 JavaScript ES modules、Canvas 2D、Node.js `node:test`、Git。

---

## 文件结构

- 修改 `src/game-core.js:14-83`：更新首段常量和 `getDifficulty()` 的六段参数。
- 修改 `tests/game-core.test.js:104-158`：锁定完整参数表、阶段连续性和非法输入回退。
- 修改 `tests/game-core.test.js:1033-1136`：同步最终速度、预判比例边界、已有敌人速度和 72 个上限行为。
- 不修改 `src/game.js`、`src/countdown-animation.js` 或 `index.html`；本轮没有新的视觉、输入或页面结构。

### Task 1：扩展难度曲线并锁定核心行为

**Files:**

- Modify: `src/game-core.js:14-83`
- Test: `tests/game-core.test.js:104-158`
- Test: `tests/game-core.test.js:1033-1136`

- [ ] **Step 1：先替换难度参数表测试**

将 `tests/game-core.test.js` 中现有的 `getDifficulty 按时间返回分段难度` 测试替换为：

```js
test('getDifficulty 按时间返回扩展后的分段难度', () => {
  const cases = [
    [0, true, 1, 0.7, 12, 0],
    [2.999, true, 0.9500166666666667, 0.7399866666666667, 12, 0],
    [3, false, 0.95, 0.74, 12, 0],
    [7.5, false, 0.875, 0.8, 12, 0],
    [15, false, 0.75, 0.9, 20, 0.25],
    [25, false, 0.65, 1, 20, 0.25],
    [35, false, 0.55, 1.1, 30, 0.25],
    [47.5, false, 0.475, 1.225, 30, 0.25],
    [60, false, 0.4, 1.35, 42, 0.5],
    [75, false, 0.34, 1.475, 42, 0.5],
    [90, false, 0.28, 1.6, 56, 0.75],
    [105, false, 0.24, 1.7, 56, 0.75],
    [120, false, 0.2, 1.8, 72, 0.75],
    [135, false, 0.18, 1.9, 72, 0.75],
    [150, false, 0.16, 2, 72, 0.75],
    [300, false, 0.16, 2, 72, 0.75],
  ];

  for (const [
    elapsedSeconds,
    expectedProtected,
    expectedSpawnInterval,
    expectedSpeedMultiplier,
    expectedEnemyCap,
    expectedPredictiveRatio,
  ] of cases) {
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
    assert.equal(difficulty.predictiveRatio, expectedPredictiveRatio);
  }
});
```

紧接着增加连续性测试：

```js
test('getDifficulty 在阶段边界保持刷怪间隔和速度连续', () => {
  for (const boundary of [15, 35, 60, 90, 120, 150]) {
    const beforeBoundary = getDifficulty(boundary - 1e-7);
    const atBoundary = getDifficulty(boundary);

    assertClose(
      beforeBoundary.spawnInterval,
      atBoundary.spawnInterval,
      1e-8,
    );
    assertClose(
      beforeBoundary.speedMultiplier,
      atBoundary.speedMultiplier,
      1e-8,
    );
  }
});
```

- [ ] **Step 2：运行定向测试并确认旧参数失败**

Run:

```bash
node --test --test-name-pattern="getDifficulty" tests/game-core.test.js
```

Expected: FAIL；参数表测试仍得到旧的 `1.4` 秒、`0.45` 倍速度和 6 个敌人上限。非法输入回退测试继续通过。

- [ ] **Step 3：最小化实现六段难度曲线**

将 `src/game-core.js` 的三个热身常量改为：

```js
const WARMUP_SPAWN_INTERVAL = 1;
const WARMUP_SPEED_MULTIPLIER = 0.7;
const WARMUP_ENEMY_CAP = 12;
```

将 `getDifficulty()` 完整替换为：

```js
export function getDifficulty(elapsedSeconds) {
  const elapsed =
    Number.isFinite(elapsedSeconds) && elapsedSeconds >= 0 ? elapsedSeconds : 0;

  if (elapsed < 15) {
    return {
      protected: elapsed < OPENING_PROTECTION_SECONDS,
      spawnInterval: interpolate(
        elapsed,
        0,
        15,
        WARMUP_SPAWN_INTERVAL,
        0.75,
      ),
      speedMultiplier: interpolate(
        elapsed,
        0,
        15,
        WARMUP_SPEED_MULTIPLIER,
        0.9,
      ),
      enemyCap: WARMUP_ENEMY_CAP,
      predictiveRatio: 0,
    };
  }

  if (elapsed < 35) {
    return {
      protected: false,
      spawnInterval: interpolate(elapsed, 15, 35, 0.75, 0.55),
      speedMultiplier: interpolate(elapsed, 15, 35, 0.9, 1.1),
      enemyCap: 20,
      predictiveRatio: 0.25,
    };
  }

  if (elapsed < 60) {
    return {
      protected: false,
      spawnInterval: interpolate(elapsed, 35, 60, 0.55, 0.4),
      speedMultiplier: interpolate(elapsed, 35, 60, 1.1, 1.35),
      enemyCap: 30,
      predictiveRatio: 0.25,
    };
  }

  if (elapsed < 90) {
    return {
      protected: false,
      spawnInterval: interpolate(elapsed, 60, 90, 0.4, 0.28),
      speedMultiplier: interpolate(elapsed, 60, 90, 1.35, 1.6),
      enemyCap: 42,
      predictiveRatio: 0.5,
    };
  }

  if (elapsed < 120) {
    return {
      protected: false,
      spawnInterval: interpolate(elapsed, 90, 120, 0.28, 0.2),
      speedMultiplier: interpolate(elapsed, 90, 120, 1.6, 1.8),
      enemyCap: 56,
      predictiveRatio: 0.75,
    };
  }

  if (elapsed < 150) {
    return {
      protected: false,
      spawnInterval: interpolate(elapsed, 120, 150, 0.2, 0.16),
      speedMultiplier: interpolate(elapsed, 120, 150, 1.8, 2),
      enemyCap: 72,
      predictiveRatio: 0.75,
    };
  }

  return {
    protected: false,
    spawnInterval: 0.16,
    speedMultiplier: 2,
    enemyCap: 72,
    predictiveRatio: 0.75,
  };
}
```

- [ ] **Step 4：运行难度函数定向测试**

Run:

```bash
node --test --test-name-pattern="getDifficulty" tests/game-core.test.js
```

Expected: PASS；3 个名称包含 `getDifficulty` 的测试全部通过。

- [ ] **Step 5：运行核心测试并确认依赖旧阶段的断言**

Run:

```bash
node --test tests/game-core.test.js
```

Expected: FAIL；旧的预判比例用例仍以 55 秒为 50% 边界，旧的敌人上限用例仍在 20 秒硬编码 12 个敌人。其余核心测试继续通过。

- [ ] **Step 6：同步生成速度、预判比例和上限测试**

将 `敌人速度在生成时应用难度倍率` 测试替换为：

```js
test('敌人速度在生成时应用难度倍率', () => {
  const openingValues = [0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.125];
  const finalValues = [0, 0.5, 0.9, 0.5, 0.5, 0.5, 0.5, 0.125];
  const opening = spawnOneEnemyAt(0, openingValues);
  const final = spawnOneEnemyAt(150, finalValues);
  const openingSpeed = Math.hypot(opening.enemy.vx, opening.enemy.vy);
  const finalSpeed = Math.hypot(final.enemy.vx, final.enemy.vy);

  assert.equal(opening.randomIndex, openingValues.length);
  assert.equal(final.randomIndex, finalValues.length);
  assertClose(
    finalSpeed / openingSpeed,
    getDifficulty(150).speedMultiplier / getDifficulty(0).speedMultiplier,
  );
});
```

在其后增加已有敌人不被追溯加速的回归测试：

```js
test('已生成敌人不会因进入更高阶段而改变速度', () => {
  const values = [0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.125];
  const { enemy, state } = spawnOneEnemyAt(0, values);
  const { vx, vy } = enemy;

  state.elapsed = 150;
  state.spawnElapsed = 0;
  stepGame(state, FIXED_STEP, noInput, () => 0.5);

  assert.equal(enemy.vx, vx);
  assert.equal(enemy.vy, vy);
});
```

将 `各阶段按预判比例选择敌人类型并保持随机序列消费` 中的阶段数据和首段边界替换为：

```js
  const cases = [
    [15, 0.249, 'predictive'],
    [15, 0.25, 'normal'],
    [60, 0.499, 'predictive'],
    [60, 0.5, 'normal'],
    [90, 0.749, 'predictive'],
    [90, 0.75, 'normal'],
  ];
```

```js
  const warmupValues = [0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.125];
  const warmup = spawnOneEnemyAt(14.999, warmupValues);
  assert.equal(warmup.enemy.type, 'normal');
  assert.equal(warmup.randomIndex, warmupValues.length);
```

将 `达到敌人上限时清空刷怪积累且不补刷` 测试替换为：

```js
test('达到敌人上限时清空刷怪积累且不补刷', () => {
  const state = createGameState({ width: 800, height: 600 });
  startGame(state);
  state.elapsed = 120;
  const difficulty = getDifficulty(state.elapsed);
  state.spawnElapsed = difficulty.spawnInterval;

  for (let index = 0; index < difficulty.enemyCap; index += 1) {
    state.enemies.push({
      x: 100,
      y: 100,
      vx: 0,
      vy: 0,
      size: 1,
    });
  }

  stepGame(state, 0, noInput, () => 0.5);

  assert.equal(state.enemies.length, difficulty.enemyCap);
  assert.equal(state.spawnElapsed, 0);

  state.enemies.pop();
  stepGame(state, FIXED_STEP, noInput, () => 0.5);

  assert.equal(state.enemies.length, difficulty.enemyCap - 1);
});
```

- [ ] **Step 7：运行全部核心测试**

Run:

```bash
node --test tests/game-core.test.js
```

Expected: PASS；所有核心测试通过。

- [ ] **Step 8：运行完整自动化检查**

Run:

```bash
npm run check
git diff --check
```

Expected: PASS；语法检查和 87 项测试全部通过，`git diff --check` 无输出。

- [ ] **Step 9：提交玩法与测试改动**

```bash
git add src/game-core.js tests/game-core.test.js
git commit -m "feat(gameplay): 扩展分阶段难度曲线"
```

Expected: 创建一个只包含难度参数与对应测试的原子提交。

### Task 2：浏览器试玩与最终交付验证

**Files:**

- Verify: `index.html`
- Verify: `src/game-core.js`
- Verify: `src/game.js`
- Verify: `tests/game-core.test.js`

- [ ] **Step 1：在独立端口启动 worktree 页面**

Run in a dedicated terminal:

```bash
python3 -m http.server 4176 --bind 127.0.0.1
```

Expected: 输出 `Serving HTTP on 127.0.0.1 port 4176`，且不影响 `main` 当前使用的 4175 端口。

- [ ] **Step 2：完成开局与阶段节奏试玩**

打开 `http://127.0.0.1:4176/`，分别使用鼠标和键盘验证：

- 开局约 1 秒出现首个敌人。
- 前 3 秒保护罩内正常刷怪、允许移动且碰撞不结束游戏。
- 保护结束后碰撞正常结束游戏。
- 0–15 秒敌人速度明显快于旧版，画面不再长期空白。
- 15、35、60 秒后的刷怪密度和速度逐步增加，没有突然加速已有敌人。
- 预判型敌人在 15 秒后出现，并在 60、90 秒阶段提高占比。
- 玩家靠近四条边缘时，不出现稳定复现的无解贴脸碰撞。
- 结束、最高分记录和重开流程保持可用。

Expected: 鼠标和键盘完整闭环均可用；没有控制、碰撞或重开回归。

- [ ] **Step 3：确认最终参数与性能安全边界**

Run:

```bash
node --input-type=module -e "import { getDifficulty } from './src/game-core.js'; console.log(getDifficulty(150), getDifficulty(300));"
```

Expected: 两个对象均包含 `spawnInterval: 0.16`、`speedMultiplier: 2`、`enemyCap: 72`、`predictiveRatio: 0.75` 和 `protected: false`。

在浏览器试玩中继续观察高密度阶段，确认画面、输入和碰撞保持流畅。72 个敌人是安全上限，不要求实际同时铺满。

- [ ] **Step 4：执行交付前最终检查**

Run:

```bash
npm run check
git diff --check
git status --short --branch
```

Expected: 87 项测试全部通过，`git diff --check` 无输出，工作区干净且分支为 `feature/huanxiong/difficulty-curve-expansion`。

- [ ] **Step 5：等待真人验收**

向用户提供 `http://127.0.0.1:4176/`，明确说明本轮变化为开局速度、六段难度、后期刷怪密度和 72 个敌人安全上限。收到真人验收结果后，再进入分支收尾与合并流程。
