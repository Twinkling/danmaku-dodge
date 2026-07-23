import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const rootUrl = new URL('../', import.meta.url);
const htmlUrl = new URL('index.html', rootUrl);
const gameUrl = new URL('src/game.js', rootUrl);

test('HTML 外壳提供元信息、无障碍入口与模块脚本', async () => {
  const html = await readFile(htmlUrl, 'utf8');

  assert.match(
    html,
    /<meta\s+name="description"\s+content="使用鼠标、触摸或键盘躲避彩色弹幕球。"\s*\/?>/,
  );
  assert.match(
    html,
    /<meta\s+name="theme-color"\s+content="#0a0a0a"\s*\/?>/,
  );
  assert.match(
    html,
    /<link\s+rel="icon"\s+href="data:image\/svg\+xml,[^"]+"\s*\/?>/,
  );
  assert.match(
    html,
    /<canvas\s+id="game"\s+tabindex="0"\s+role="application"\s+aria-label="弹幕躲避游戏"\s+aria-describedby="game-instructions game-status"><\/canvas>/,
  );
  assert.match(html, /id="game-instructions"/);
  assert.match(
    html,
    /id="game-status"[^>]*aria-live="polite"[^>]*>等待开始游戏</,
  );
  assert.match(
    html,
    /<script\s+type="module"\s+src="\.\/src\/game\.js"><\/script>/,
  );
  assert.match(html, /:focus-visible/);
  assert.match(html, /\.visually-hidden/);
  assert.doesNotMatch(html, /function\s+gameLoop/);
  assert.doesNotMatch(html, /let\s+enemies/);
});

test('浏览器入口连接核心模块、输入事件、存储与动画循环', async () => {
  assert.equal(
    existsSync(gameUrl),
    true,
    'src/game.js 应作为浏览器 module 入口存在',
  );

  const source = await readFile(gameUrl, 'utf8');

  for (const importedName of [
    'advanceGame',
    'createGameState',
    'resizeGame',
    'sanitizeBestScore',
    'startGame',
  ]) {
    assert.match(source, new RegExp(`\\b${importedName}\\b`));
  }
  assert.match(source, /from\s+['"]\.\/game-core\.js['"]/);
  assert.match(source, /dodgeBestScoreV2/);

  for (const eventName of [
    'pointerdown',
    'pointermove',
    'keydown',
    'keyup',
    'blur',
    'resize',
    'orientationchange',
  ]) {
    assert.match(source, new RegExp(`['"]${eventName}['"]`));
  }

  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /当前浏览器不支持 Canvas 2D，无法启动游戏/);
});
