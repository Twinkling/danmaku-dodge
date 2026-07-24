import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COUNTDOWN_AGGREGATE_SECONDS,
  COUNTDOWN_EXPLODE_START_SECONDS,
  COUNTDOWN_SHIELD_START_SECONDS,
  createCountdownRenderer,
  getCountdownFrame,
} from '../src/countdown-animation.js';

function createMainContext() {
  const calls = [];
  const context = {
    calls,
    globalAlpha: 1,
    fillStyle: '#000000',
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    save() {
      calls.push({ method: 'save' });
    },
    restore() {
      calls.push({ method: 'restore' });
    },
    translate(x, y) {
      calls.push({ method: 'translate', x, y });
    },
    scale(x, y) {
      calls.push({ method: 'scale', x, y });
    },
    fillRect(x, y, width, height) {
      calls.push({
        method: 'fillRect',
        x,
        y,
        width,
        height,
        globalAlpha: this.globalAlpha,
        fillStyle: this.fillStyle,
      });
    },
    fillText(text, x, y) {
      calls.push({
        method: 'fillText',
        text,
        x,
        y,
        globalAlpha: this.globalAlpha,
        fillStyle: this.fillStyle,
      });
    },
  };
  return context;
}

function createSamplingCanvas(reads) {
  const offscreenContext = {
    font: '',
    fillStyle: '#000000',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    clearRect() {},
    fillText() {},
    getImageData(_x, _y, width, height) {
      reads.count += 1;
      const data = new Uint8ClampedArray(width * height * 4);
      const left = Math.floor(width * 0.4);
      const right = Math.ceil(width * 0.6);
      for (let y = 0; y < height; y += 1) {
        for (let x = left; x < right; x += 1) {
          data[(y * width + x) * 4 + 3] = 255;
        }
      }
      return { data };
    },
  };

  return {
    width: 0,
    height: 0,
    getContext(type) {
      assert.equal(type, '2d');
      return offscreenContext;
    },
  };
}

function draw(renderer, frame, overrides = {}) {
  renderer.draw({
    frame,
    centerX: 100,
    centerY: 90,
    playerX: 240,
    playerY: 210,
    fontSize: 48,
    ...overrides,
  });
}

test('导出倒计时表现阶段常量', () => {
  assert.equal(COUNTDOWN_AGGREGATE_SECONDS, 0.42);
  assert.equal(COUNTDOWN_EXPLODE_START_SECONDS, 1.12);
  assert.equal(COUNTDOWN_SHIELD_START_SECONDS, 5.2);
});

test('按精确边界派生完整倒计时帧', () => {
  assert.deepEqual(getCountdownFrame(0), {
    digit: 3,
    stage: 'aggregate',
    stageProgress: 0,
    shieldProgress: 0,
  });
  assert.deepEqual(getCountdownFrame(0.42), {
    digit: 3,
    stage: 'hold',
    stageProgress: 0,
    shieldProgress: 0,
  });
  assert.deepEqual(getCountdownFrame(1.12), {
    digit: 3,
    stage: 'explode',
    stageProgress: 0,
    shieldProgress: 0,
  });
  assert.deepEqual(getCountdownFrame(1.6), {
    digit: 2,
    stage: 'aggregate',
    stageProgress: 0,
    shieldProgress: 0,
  });
  assert.deepEqual(getCountdownFrame(2.02), {
    digit: 2,
    stage: 'hold',
    stageProgress: 0,
    shieldProgress: 0,
  });
  assert.deepEqual(getCountdownFrame(2.72), {
    digit: 2,
    stage: 'explode',
    stageProgress: 0,
    shieldProgress: 0,
  });
  assert.deepEqual(getCountdownFrame(3.2), {
    digit: 1,
    stage: 'aggregate',
    stageProgress: 0,
    shieldProgress: 0,
  });
  assert.deepEqual(getCountdownFrame(3.62), {
    digit: 1,
    stage: 'hold',
    stageProgress: 0,
    shieldProgress: 0,
  });
  assert.deepEqual(getCountdownFrame(4.79), {
    digit: 1,
    stage: 'hold',
    stageProgress: (4.79 - 3.62) / (4.8 - 3.62),
    shieldProgress: 0,
  });
  assert.deepEqual(getCountdownFrame(4.8), {
    digit: 1,
    stage: 'return',
    stageProgress: 0,
    shieldProgress: 0,
  });
  const shieldStartFrame = getCountdownFrame(5.2);
  assert.equal(shieldStartFrame.digit, 1);
  assert.equal(shieldStartFrame.stage, 'return');
  assert.ok(Math.abs(shieldStartFrame.stageProgress - 0.5) < 1e-12);
  assert.equal(shieldStartFrame.shieldProgress, 0);
  assert.ok(Math.abs(getCountdownFrame(5.4).shieldProgress - 0.5) < 1e-12);
  assert.deepEqual(getCountdownFrame(5.6), {
    digit: null,
    stage: 'complete',
    stageProgress: 1,
    shieldProgress: 1,
  });
});

test('非法时间按零处理且超过总时长按完成处理', () => {
  for (const elapsed of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(getCountdownFrame(elapsed), getCountdownFrame(0));
  }
  assert.deepEqual(getCountdownFrame(99), getCountdownFrame(5.6));
});

test('相同数字跨目标字号只采样一次并限制粒子数量', () => {
  const context = createMainContext();
  const reads = { count: 0 };
  const renderer = createCountdownRenderer({
    context,
    createCanvas: () => createSamplingCanvas(reads),
    maxParticles: 24,
  });
  const frame = getCountdownFrame(0.21);

  draw(renderer, frame, { fontSize: 48 });
  const firstRects = context.calls.filter(
    ({ method }) => method === 'fillRect',
  );
  assert.equal(firstRects.length, 24);

  context.calls.length = 0;
  draw(renderer, frame, { fontSize: 96 });
  const secondRects = context.calls.filter(
    ({ method }) => method === 'fillRect',
  );

  assert.equal(reads.count, 1);
  assert.equal(secondRects.length, 24);
});

test('超大目标字号仍只使用固定有界的离屏采样画布', () => {
  const context = createMainContext();
  const dimensions = {};
  const canvas = {
    width: 0,
    height: 0,
    getContext() {
      return {
        font: '',
        fillStyle: '',
        textAlign: '',
        textBaseline: '',
        clearRect() {},
        fillText() {},
        getImageData(_x, _y, width, height) {
          dimensions.readWidth = width;
          dimensions.readHeight = height;
          if (width > 256 || height > 320) {
            throw new Error('拒绝为超大测试画布分配像素数组');
          }
          return {
            data: new Uint8ClampedArray(width * height * 4),
          };
        },
      };
    },
  };
  const renderer = createCountdownRenderer({
    context,
    createCanvas: () => canvas,
  });

  draw(renderer, getCountdownFrame(0.21), { fontSize: 100_000 });
  dimensions.canvasWidth = canvas.width;
  dimensions.canvasHeight = canvas.height;

  assert.ok(dimensions.canvasWidth <= 256);
  assert.ok(dimensions.canvasHeight <= 320);
  assert.ok(dimensions.readWidth <= 256);
  assert.ok(dimensions.readHeight <= 320);
});

test('目标字号翻倍时hold粒子相对中心的几何距离同比放大', () => {
  const context = createMainContext();
  const reads = { count: 0 };
  const renderer = createCountdownRenderer({
    context,
    createCanvas: () => createSamplingCanvas(reads),
    maxParticles: 24,
  });
  const frame = getCountdownFrame(0.8);

  draw(renderer, frame, { fontSize: 48 });
  const smallDistance = Math.max(
    ...context.calls
      .filter(({ method }) => method === 'fillRect')
      .map(({ x, y, width, height }) =>
        Math.hypot(x + width / 2 - 100, y + height / 2 - 90),
      ),
  );

  context.calls.length = 0;
  draw(renderer, frame, { fontSize: 96 });
  const largeDistance = Math.max(
    ...context.calls
      .filter(({ method }) => method === 'fillRect')
      .map(({ x, y, width, height }) =>
        Math.hypot(x + width / 2 - 100, y + height / 2 - 90),
      ),
  );

  assert.ok(Math.abs(largeDistance / smallDistance - 2) < 1e-12);
});

test('爆炸粒子离开数字且回归粒子抵达玩家', () => {
  const context = createMainContext();
  const reads = { count: 0 };
  const renderer = createCountdownRenderer({
    context,
    createCanvas: () => createSamplingCanvas(reads),
  });

  draw(renderer, {
    digit: 3,
    stage: 'explode',
    stageProgress: 1,
    shieldProgress: 0,
  });
  const exploded = context.calls.filter(
    ({ method }) => method === 'fillRect',
  );
  assert.ok(
    exploded.some(
      ({ x, y, width, height }) =>
        Math.hypot(x + width / 2 - 100, y + height / 2 - 90) > 48,
    ),
  );

  context.calls.length = 0;
  draw(renderer, {
    digit: 1,
    stage: 'return',
    stageProgress: 1,
    shieldProgress: 1,
  });
  const returned = context.calls.filter(
    ({ method }) => method === 'fillRect',
  );
  assert.ok(returned.length > 0);
  assert.ok(
    returned.every(
      ({ x, y, width, height }) =>
        Math.hypot(x + width / 2 - 240, y + height / 2 - 210) < 1e-9,
    ),
  );
});

test('爆炸与回归中段粒子沿路径移动且保持可见有限坐标', () => {
  const context = createMainContext();
  const reads = { count: 0 };
  const renderer = createCountdownRenderer({
    context,
    createCanvas: () => createSamplingCanvas(reads),
    maxParticles: 24,
  });
  const holdFrame = {
    digit: 3,
    stage: 'hold',
    stageProgress: 0.5,
    shieldProgress: 0,
  };

  draw(renderer, holdFrame);
  const holdRects = context.calls.filter(
    ({ method }) => method === 'fillRect',
  );

  context.calls.length = 0;
  draw(renderer, {
    ...holdFrame,
    stage: 'explode',
  });
  const explodingRects = context.calls.filter(
    ({ method }) => method === 'fillRect',
  );
  assert.ok(
    explodingRects.some(
      ({ x, y }, index) =>
        x !== holdRects[index].x || y !== holdRects[index].y,
    ),
  );
  assert.ok(
    explodingRects.every(({ x, y, width, height, globalAlpha }) =>
      [x, y, width, height, globalAlpha].every(Number.isFinite),
    ),
  );
  assert.ok(explodingRects.every(({ globalAlpha }) => globalAlpha > 0));

  context.calls.length = 0;
  draw(renderer, {
    digit: 1,
    stage: 'hold',
    stageProgress: 0.5,
    shieldProgress: 0,
  });
  const returnStartRects = context.calls.filter(
    ({ method }) => method === 'fillRect',
  );

  context.calls.length = 0;
  draw(renderer, {
    digit: 1,
    stage: 'return',
    stageProgress: 0.5,
    shieldProgress: 0,
  });
  const returningRects = context.calls.filter(
    ({ method }) => method === 'fillRect',
  );
  assert.ok(
    returningRects.every(({ x, y, width, height }, index) => {
      const start = returnStartRects[index];
      const startDistance = Math.hypot(
        start.x + start.width / 2 - 240,
        start.y + start.height / 2 - 210,
      );
      const currentDistance = Math.hypot(
        x + width / 2 - 240,
        y + height / 2 - 210,
      );
      return currentDistance < startDistance;
    }),
  );
  assert.ok(
    returningRects.every(({ x, y, width, height, globalAlpha }) =>
      [x, y, width, height, globalAlpha].every(Number.isFinite),
    ),
  );
  assert.ok(returningRects.every(({ globalAlpha }) => globalAlpha > 0));
});

test('离屏画布不可用时回退绘制实心数字', () => {
  const context = createMainContext();
  const renderer = createCountdownRenderer({
    context,
    createCanvas: () => null,
  });

  assert.doesNotThrow(() => draw(renderer, getCountdownFrame(0.21)));
  assert.ok(
    context.calls.some(
      ({ method, text }) => method === 'fillText' && text === '3',
    ),
  );
});

test('离屏画布不可用时回归数字精确移动到玩家', () => {
  const context = createMainContext();
  const renderer = createCountdownRenderer({
    context,
    createCanvas: () => null,
  });
  const frame = {
    ...getCountdownFrame(5.5),
    stageProgress: 1,
  };

  draw(renderer, frame, {
    centerX: 80,
    centerY: 70,
    playerX: 260,
    playerY: 190,
  });

  assert.deepEqual(
    context.calls.filter(({ method }) => method === 'translate'),
    [{ method: 'translate', x: 260, y: 190 }],
  );
  assert.equal(context.calls[0].method, 'save');
  assert.equal(context.calls.at(-1).method, 'restore');
  assert.equal(
    context.calls.filter(({ method }) => method === 'save').length,
    1,
  );
  assert.equal(
    context.calls.filter(({ method }) => method === 'restore').length,
    1,
  );
});

test('像素读取失败会缓存降级结果且不会重复尝试', () => {
  const context = createMainContext();
  let reads = 0;
  const renderer = createCountdownRenderer({
    context,
    createCanvas: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        font: '',
        fillStyle: '',
        textAlign: '',
        textBaseline: '',
        clearRect() {},
        fillText() {},
        getImageData() {
          reads += 1;
          throw new Error('像素读取失败');
        },
      }),
    }),
  });

  draw(renderer, getCountdownFrame(0.21));
  draw(renderer, getCountdownFrame(0.22));

  assert.equal(reads, 1);
  assert.equal(
    context.calls.filter(
      ({ method, text }) => method === 'fillText' && text === '3',
    ).length,
    2,
  );
});

test('完成帧不产生可见绘制且闭合上下文状态', () => {
  const context = createMainContext();
  const renderer = createCountdownRenderer({
    context,
    createCanvas: () => {
      throw new Error('完成帧不应尝试采样');
    },
  });

  draw(renderer, getCountdownFrame(5.6));

  assert.equal(
    context.calls.filter(
      ({ method }) => method === 'fillRect' || method === 'fillText',
    ).length,
    0,
  );
  assert.equal(
    context.calls.filter(({ method }) => method === 'save').length,
    context.calls.filter(({ method }) => method === 'restore').length,
  );
  assert.equal(context.globalAlpha, 1);
  assert.equal(context.fillStyle, '#000000');
});

test('实际粒子绘制抛错时仍恢复上下文状态', () => {
  const context = createMainContext();
  const reads = { count: 0 };
  context.fillRect = () => {
    throw new Error('绘制失败');
  };
  const renderer = createCountdownRenderer({
    context,
    createCanvas: () => createSamplingCanvas(reads),
  });

  assert.throws(
    () => draw(renderer, getCountdownFrame(0.8)),
    /绘制失败/,
  );
  assert.equal(
    context.calls.filter(({ method }) => method === 'save').length,
    1,
  );
  assert.equal(
    context.calls.filter(({ method }) => method === 'restore').length,
    1,
  );
});
