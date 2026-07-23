import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createBrowserGame } from '../src/game.js';

const rootUrl = new URL('../', import.meta.url);
const htmlUrl = new URL('index.html', rootUrl);
const MAX_BACKING_STORE_SIDE = 8_192;
const MAX_BACKING_STORE_PIXELS = 16_777_216;

function createClassList(initialClasses = []) {
  const classes = new Set(initialClasses);

  return {
    add(...names) {
      for (const name of names) classes.add(name);
    },
    remove(...names) {
      for (const name of names) classes.delete(name);
    },
    contains(name) {
      return classes.has(name);
    },
  };
}

function createStorage({ throwOnGet = false, throwOnSet = false } = {}) {
  const values = new Map();
  const setCalls = [];

  return {
    values,
    setCalls,
    getItem(key) {
      if (throwOnGet) throw new Error('storage get blocked');
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (throwOnSet) throw new Error('storage set blocked');
      const stringValue = String(value);
      setCalls.push([key, stringValue]);
      values.set(key, stringValue);
    },
  };
}

function createContext() {
  const calls = [];
  const context = {
    calls,
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  };

  for (const method of [
    'setTransform',
    'save',
    'restore',
    'fillRect',
    'beginPath',
    'moveTo',
    'lineTo',
    'stroke',
    'arc',
    'fill',
    'translate',
    'fillText',
  ]) {
    context[method] = (...args) => {
      calls.push([method, ...args]);
    };
  }

  return context;
}

function createEventTarget(properties = {}) {
  const listeners = new Map();

  return {
    ...properties,
    listeners,
    addEventListener(type, listener) {
      const handlers = listeners.get(type) ?? [];
      handlers.push(listener);
      listeners.set(type, handlers);
    },
    dispatch(type, event = {}) {
      const dispatchedEvent = {
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...event,
      };

      for (const listener of listeners.get(type) ?? []) {
        listener(dispatchedEvent);
      }

      return dispatchedEvent;
    },
    listenerCount() {
      let count = 0;
      for (const handlers of listeners.values()) count += handlers.length;
      return count;
    },
  };
}

function createEnvironment({
  context = createContext(),
  storage = createStorage(),
} = {}) {
  const animationFrames = [];
  const timeouts = [];
  let rafCalls = 0;
  const canvas = createEventTarget({
    width: 0,
    height: 0,
    hidden: false,
    style: {},
    focusCalls: [],
    classList: createClassList(),
    getContext() {
      return context;
    },
    getBoundingClientRect() {
      return {
        left: 0,
        top: 0,
        width: Number.parseFloat(this.style.width) || 0,
        height: Number.parseFloat(this.style.height) || 0,
      };
    },
    focus(options) {
      this.focusCalls.push(options);
    },
  });
  const attributes = new Map();
  const status = {
    textContent: '等待开始游戏',
    classList: createClassList(['visually-hidden']),
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
  };
  const windowObject = createEventTarget({
    innerWidth: 800,
    innerHeight: 600,
    devicePixelRatio: 2,
    localStorage: storage,
    requestAnimationFrame(callback) {
      rafCalls += 1;
      animationFrames.push(callback);
      return rafCalls;
    },
    setTimeout(callback, delay) {
      timeouts.push({ callback, delay });
      return timeouts.length;
    },
  });
  const documentObject = {
    getElementById(id) {
      if (id === 'game') return canvas;
      if (id === 'game-status') return status;
      return null;
    },
  };

  return {
    canvas,
    context,
    documentObject,
    status,
    storage,
    timeouts,
    windowObject,
    get rafCalls() {
      return rafCalls;
    },
    runNextFrame(timestamp) {
      const callback = animationFrames.shift();
      assert.equal(typeof callback, 'function', '应存在待执行的 RAF 回调');
      callback(timestamp);
    },
  };
}

function pointerEvent({
  pointerId = 1,
  pointerType = 'mouse',
  isPrimary = true,
  clientX = 400,
  clientY = 300,
} = {}) {
  return {
    pointerId,
    pointerType,
    isPrimary,
    clientX,
    clientY,
  };
}

function lastContextCall(context, method) {
  return context.calls.filter(([name]) => name === method).at(-1);
}

test('HTML 外壳保留元信息、无障碍结构并允许页面缩放', async () => {
  const html = await readFile(htmlUrl, 'utf8');
  const viewportTag = html.match(
    /<meta\b(?=[^>]*\bname="viewport")[^>]*>/,
  )?.[0];
  const canvasTag = html.match(/<canvas\b(?=[^>]*\bid="game")[^>]*>/)?.[0];
  const scriptTag = html.match(
    /<script\b(?=[^>]*\bsrc="\.\/src\/game\.js")[^>]*>/,
  )?.[0];
  const statusTag = html.match(
    /<(?:p|div)\b(?=[^>]*\bid="game-status")[^>]*>/,
  )?.[0];

  assert.match(html, /name="description"/);
  assert.match(html, /content="使用鼠标、触摸或键盘躲避彩色弹幕球。"/);
  assert.match(html, /name="theme-color"/);
  assert.match(html, /content="#0a0a0a"/);
  assert.match(html, /href="data:image\/svg\+xml,[^"]+"/);
  assert.ok(viewportTag);
  assert.match(viewportTag, /width=device-width/);
  assert.match(viewportTag, /initial-scale=1\.0/);
  assert.match(viewportTag, /viewport-fit=cover/);
  assert.doesNotMatch(viewportTag, /maximum-scale/);
  assert.doesNotMatch(viewportTag, /user-scalable/);
  assert.ok(canvasTag);
  assert.match(canvasTag, /tabindex="0"/);
  assert.match(canvasTag, /role="application"/);
  assert.match(canvasTag, /aria-label="弹幕躲避游戏"/);
  assert.match(canvasTag, /aria-describedby="game-instructions game-status"/);
  assert.match(html, /id="game-instructions"/);
  assert.ok(statusTag);
  assert.match(statusTag, /aria-live="polite"/);
  assert.match(html, /等待开始游戏/);
  assert.ok(scriptTag);
  assert.match(scriptTag, /type="module"/);
  assert.match(html, /:focus-visible/);
  assert.match(html, /\.visually-hidden/);
  assert.match(html, /\.game-error/);
  assert.equal(
    html.match(/touch-action:\s*pinch-zoom/g)?.length,
    2,
    '页面与 Canvas 都应允许双指缩放',
  );
  assert.doesNotMatch(html, /touch-action:\s*none/);
  assert.doesNotMatch(html, /function\s+gameLoop/);
  assert.doesNotMatch(html, /let\s+enemies/);
});

test('Canvas 2D 不可用时显示可见错误且不启动游戏运行时', async () => {
  const environment = createEnvironment({ context: null });

  createBrowserGame({
    windowObject: environment.windowObject,
    documentObject: environment.documentObject,
  });

  assert.equal(
    environment.status.textContent,
    '当前浏览器不支持 Canvas 2D，无法启动游戏',
  );
  assert.equal(environment.status.classList.contains('visually-hidden'), false);
  assert.equal(environment.status.classList.contains('game-error'), true);
  assert.equal(environment.status.getAttribute('role'), 'alert');
  assert.equal(environment.canvas.hidden, true);
  assert.equal(environment.canvas.listenerCount(), 0);
  assert.equal(environment.windowObject.listenerCount(), 0);
  assert.equal(environment.rafCalls, 0);
});

test('resize 保留非法视口前的尺寸并统一夹取画布与状态边界', async () => {
  const invalidInitialEnvironment = createEnvironment();
  invalidInitialEnvironment.windowObject.innerWidth = Number.NaN;
  invalidInitialEnvironment.windowObject.innerHeight = 0;
  const invalidInitialGame = createBrowserGame({
    windowObject: invalidInitialEnvironment.windowObject,
    documentObject: invalidInitialEnvironment.documentObject,
  });
  assert.equal(invalidInitialGame.getState().width, 1);
  assert.equal(invalidInitialGame.getState().height, 1);

  const environment = createEnvironment();
  const game = createBrowserGame({
    windowObject: environment.windowObject,
    documentObject: environment.documentObject,
  });

  assert.equal(game.getState().width, 800);
  assert.equal(game.getState().height, 600);
  game.beginGame();

  for (const [width, height] of [
    [0, Number.NaN],
    [-10, 0],
  ]) {
    environment.windowObject.innerWidth = width;
    environment.windowObject.innerHeight = height;
    environment.windowObject.dispatch('resize');
    assert.equal(game.getState().width, 800);
    assert.equal(game.getState().height, 600);
  }

  environment.windowObject.innerWidth = Number.MAX_VALUE;
  environment.windowObject.innerHeight = Number.MAX_VALUE;
  environment.windowObject.dispatch('resize');
  assert.equal(game.getState().width, 100_000);
  assert.equal(game.getState().height, 100_000);

  environment.windowObject.innerWidth = 800;
  environment.windowObject.innerHeight = 600;
  environment.windowObject.devicePixelRatio = Number.MIN_VALUE;
  environment.windowObject.dispatch('resize');
  assert.equal(game.getState().width, 800);
  assert.equal(game.getState().height, 600);
  assert.equal(environment.canvas.width, 1);
  assert.equal(environment.canvas.height, 1);
  assert.deepEqual(lastContextCall(environment.context, 'setTransform'), [
    'setTransform',
    1 / 800,
    0,
    0,
    1 / 600,
    0,
    0,
  ]);
});

test('超大正方形视口保留逻辑尺寸并限制 backing store 总像素', () => {
  const environment = createEnvironment();
  environment.windowObject.innerWidth = 100_000;
  environment.windowObject.innerHeight = 100_000;
  environment.windowObject.devicePixelRatio = 3;

  const game = createBrowserGame({
    windowObject: environment.windowObject,
    documentObject: environment.documentObject,
  });

  assert.equal(game.getState().width, 100_000);
  assert.equal(game.getState().height, 100_000);
  assert.equal(environment.canvas.style.width, '100000px');
  assert.equal(environment.canvas.style.height, '100000px');
  assert.equal(environment.canvas.width, 4_096);
  assert.equal(environment.canvas.height, 4_096);
  assert.ok(environment.canvas.width <= MAX_BACKING_STORE_SIDE);
  assert.ok(environment.canvas.height <= MAX_BACKING_STORE_SIDE);
  assert.ok(
    environment.canvas.width * environment.canvas.height <=
      MAX_BACKING_STORE_PIXELS,
  );
  assert.deepEqual(lastContextCall(environment.context, 'setTransform'), [
    'setTransform',
    environment.canvas.width / 100_000,
    0,
    0,
    environment.canvas.height / 100_000,
    0,
    0,
  ]);
});

test('超宽视口受单边预算约束且使用实际非等比变换', () => {
  const environment = createEnvironment();
  environment.windowObject.innerWidth = 100_000;
  environment.windowObject.innerHeight = 1_000;
  environment.windowObject.devicePixelRatio = 3;

  const game = createBrowserGame({
    windowObject: environment.windowObject,
    documentObject: environment.documentObject,
  });

  assert.equal(game.getState().width, 100_000);
  assert.equal(game.getState().height, 1_000);
  assert.equal(environment.canvas.style.width, '100000px');
  assert.equal(environment.canvas.style.height, '1000px');
  assert.equal(environment.canvas.width, MAX_BACKING_STORE_SIDE);
  assert.equal(environment.canvas.height, 81);
  assert.ok(
    environment.canvas.width * environment.canvas.height <=
      MAX_BACKING_STORE_PIXELS,
  );
  assert.deepEqual(lastContextCall(environment.context, 'setTransform'), [
    'setTransform',
    environment.canvas.width / 100_000,
    0,
    0,
    environment.canvas.height / 1_000,
    0,
    0,
  ]);
});

test('常规视口保持请求的 DPR backing store', () => {
  for (const [width, height] of [
    [800, 600],
    [1_280, 720],
  ]) {
    const environment = createEnvironment();
    environment.windowObject.innerWidth = width;
    environment.windowObject.innerHeight = height;
    environment.windowObject.devicePixelRatio = 2;

    createBrowserGame({
      windowObject: environment.windowObject,
      documentObject: environment.documentObject,
    });

    assert.equal(environment.canvas.width, width * 2);
    assert.equal(environment.canvas.height, height * 2);
    assert.deepEqual(lastContextCall(environment.context, 'setTransform'), [
      'setTransform',
      2,
      0,
      0,
      2,
      0,
      0,
    ]);
  }
});

test('仅主触摸控制目标且 blur 清理全部瞬时输入', async () => {
  const environment = createEnvironment();
  const game = createBrowserGame({
    windowObject: environment.windowObject,
    documentObject: environment.documentObject,
  });
  const primaryDown = pointerEvent({
    pointerType: 'touch',
    pointerId: 1,
    clientX: 100,
    clientY: 120,
  });

  environment.canvas.dispatch('pointerdown', primaryDown);
  assert.equal(game.input.pointerActive, true);
  assert.equal(game.input.pointerX, 100);
  assert.equal(game.input.pointerY, 120);

  for (const type of ['pointerdown', 'pointermove', 'pointerup']) {
    environment.canvas.dispatch(
      type,
      pointerEvent({
        pointerType: 'touch',
        pointerId: 2,
        isPrimary: false,
        clientX: 700,
        clientY: 500,
      }),
    );
  }
  assert.equal(game.input.pointerActive, true);
  assert.equal(game.input.pointerX, 100);
  assert.equal(game.input.pointerY, 120);

  environment.canvas.dispatch(
    'pointermove',
    pointerEvent({
      pointerType: 'touch',
      pointerId: 1,
      clientX: 150,
      clientY: 180,
    }),
  );
  assert.equal(game.input.pointerX, 150);
  assert.equal(game.input.pointerY, 180);

  environment.canvas.dispatch(
    'pointerup',
    pointerEvent({ pointerType: 'touch', pointerId: 1 }),
  );
  assert.equal(game.input.pointerActive, false);

  environment.canvas.dispatch('pointerdown', primaryDown);
  environment.canvas.dispatch(
    'pointercancel',
    pointerEvent({ pointerType: 'touch', pointerId: 1 }),
  );
  assert.equal(game.input.pointerActive, false);

  environment.canvas.dispatch('pointerdown', primaryDown);
  environment.windowObject.dispatch('keydown', { code: 'ArrowLeft' });
  assert.equal(game.input.left, true);
  environment.windowObject.dispatch('blur');
  assert.equal(game.input.left, false);
  assert.equal(game.input.pointerActive, false);

  environment.canvas.dispatch(
    'pointerdown',
    pointerEvent({
      pointerType: 'touch',
      pointerId: 3,
      clientX: 250,
      clientY: 260,
    }),
  );
  assert.equal(game.input.pointerActive, true);
  assert.equal(game.input.pointerX, 250);
  assert.equal(game.input.pointerY, 260);

  environment.canvas.dispatch(
    'pointerup',
    pointerEvent({ pointerType: 'touch', pointerId: 3 }),
  );
  environment.canvas.dispatch(
    'pointermove',
    pointerEvent({ pointerType: 'mouse', clientX: 300, clientY: 310 }),
  );
  assert.equal(game.input.pointerActive, true);
  environment.canvas.dispatch(
    'pointercancel',
    pointerEvent({ pointerType: 'mouse' }),
  );
  assert.equal(game.input.pointerActive, false);
});

test('鼠标 pointerup 后继续向最后目标缓动', () => {
  const environment = createEnvironment();
  const game = createBrowserGame({
    windowObject: environment.windowObject,
    documentObject: environment.documentObject,
  });

  environment.canvas.dispatch(
    'pointerdown',
    pointerEvent({ pointerType: 'mouse', clientX: 700, clientY: 300 }),
  );
  environment.canvas.dispatch(
    'pointerup',
    pointerEvent({ pointerType: 'mouse', clientX: 700, clientY: 300 }),
  );

  const initialX = game.getState().player.x;
  environment.runNextFrame(1_000);
  environment.runNextFrame(1_017);

  assert.equal(game.input.pointerActive, true);
  assert.equal(game.input.pointerX, 700);
  assert.ok(game.getState().player.x > initialX);
});

test('点击或键盘重开后首个动画帧不累计暂停时间', async () => {
  for (const restart of ['pointer', 'keyboard']) {
    const environment = createEnvironment();
    const game = createBrowserGame({
      windowObject: environment.windowObject,
      documentObject: environment.documentObject,
    });

    game.beginGame();
    environment.runNextFrame(1_000);
    environment.runNextFrame(1_017);
    game.getState().phase = 'gameover';

    if (restart === 'pointer') {
      environment.canvas.dispatch(
        'pointerdown',
        pointerEvent({ clientX: 0, clientY: 0 }),
      );
    } else {
      environment.windowObject.dispatch('keydown', { code: 'Enter' });
    }

    environment.runNextFrame(60_000);
    assert.equal(game.getState().elapsed, 0);
    assert.equal(game.getState().player.x, 400);
    assert.equal(game.getState().player.y, 300);
  }
});

test('新纪录只写入一次并在后续动画帧保持稳定', async () => {
  const environment = createEnvironment();
  const game = createBrowserGame({
    windowObject: environment.windowObject,
    documentObject: environment.documentObject,
  });

  game.beginGame();
  environment.runNextFrame(1_000);
  const state = game.getState();
  state.elapsed = 5;
  state.enemies.push({
    x: state.player.x,
    y: state.player.y,
    vx: 0,
    vy: 0,
    size: 10,
    color: '#fff',
  });

  environment.runNextFrame(1_017);
  environment.runNextFrame(1_034);
  environment.runNextFrame(1_051);

  assert.equal(state.phase, 'gameover');
  assert.deepEqual(environment.storage.setCalls, [
    ['dodgeBestScoreV2', String(state.bestScore)],
  ]);
});

test('localStorage 读写抛错时初始化和游戏循环继续运行', async () => {
  const environment = createEnvironment({
    storage: createStorage({ throwOnGet: true, throwOnSet: true }),
  });
  let game;

  assert.doesNotThrow(() => {
    game = createBrowserGame({
      windowObject: environment.windowObject,
      documentObject: environment.documentObject,
    });
  });
  assert.equal(game.getState().bestScore, 0);

  game.beginGame();
  assert.doesNotThrow(() => environment.runNextFrame(1_000));
  const state = game.getState();
  state.elapsed = 3;
  state.enemies.push({
    x: state.player.x,
    y: state.player.y,
    vx: 0,
    vy: 0,
    size: 10,
    color: '#fff',
  });
  assert.doesNotThrow(() => environment.runNextFrame(1_017));
  assert.equal(state.phase, 'gameover');
});

test('保护期绘制倒计时和额外光环并在三秒后消失', () => {
  const environment = createEnvironment();
  const game = createBrowserGame({
    windowObject: environment.windowObject,
    documentObject: environment.documentObject,
  });

  game.beginGame();
  environment.runNextFrame(0);
  let texts = environment.context.calls
    .filter(([method]) => method === 'fillText')
    .map(([, text]) => text);
  let arcs = environment.context.calls.filter(
    ([method]) => method === 'arc',
  );
  assert.ok(texts.includes('准备 3'));
  assert.equal(arcs.length, 2);

  environment.context.calls.length = 0;
  game.getState().elapsed = 1.1;
  environment.runNextFrame(16);
  texts = environment.context.calls
    .filter(([method]) => method === 'fillText')
    .map(([, text]) => text);
  assert.ok(texts.includes('准备 2'));

  environment.context.calls.length = 0;
  game.getState().elapsed = 2.1;
  environment.runNextFrame(32);
  texts = environment.context.calls
    .filter(([method]) => method === 'fillText')
    .map(([, text]) => text);
  assert.ok(texts.includes('准备 1'));

  environment.context.calls.length = 0;
  game.getState().elapsed = 3;
  environment.runNextFrame(48);
  texts = environment.context.calls
    .filter(([method]) => method === 'fillText')
    .map(([, text]) => text);
  arcs = environment.context.calls.filter(([method]) => method === 'arc');
  assert.equal(
    texts.some((text) => text.startsWith('准备 ')),
    false,
  );
  assert.equal(arcs.length, 1);
});

test('正常 Canvas 桩可执行空闲、运行与结束渲染路径', async () => {
  const environment = createEnvironment();
  const game = createBrowserGame({
    windowObject: environment.windowObject,
    documentObject: environment.documentObject,
  });

  assert.doesNotThrow(() => environment.runNextFrame(0));
  environment.canvas.dispatch('pointerdown', pointerEvent());
  assert.doesNotThrow(() => environment.runNextFrame(17));
  game.getState().phase = 'gameover';
  game.getState().finalScore = 1;
  assert.doesNotThrow(() => environment.runNextFrame(34));
  assert.ok(environment.context.calls.length > 0);
});
