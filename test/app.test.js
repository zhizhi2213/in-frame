import test from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { scenes, modes } from '../public/data.js';
import { selectScenes, parseSaved, toggleSaved } from '../public/model.js';
import { createAppServer } from '../server.js';

const ids = scenes.map(scene => scene.id);

test('six distinct scenes provide all eighteen complete shooting guides', () => {
  assert.deepEqual(ids, ['park', 'coast', 'street', 'mountain', 'architecture', 'cafe']);
  assert.equal(new Set(ids).size, 6);
  assert.deepEqual(modes.map(mode => mode.id), ['landscape', 'portrait', 'interaction']);
  for (const scene of scenes) {
    assert.equal(scene.tags.length, 2);
    assert.equal(new Set(Object.values(scene.variants).map(variant => variant.title)).size, 3);
    for (const mode of modes) {
      const variant = scene.variants[mode.id];
      for (const key of ['title', 'summary', 'lens', 'distance', 'height', 'composition', 'position', 'direction', 'avoid', 'safety']) {
        assert.ok(typeof variant[key] === 'string' && variant[key].length > 0, `${scene.id}/${mode.id}/${key}`);
      }
      assert.equal(variant.pose.length, 3);
      assert.equal(new Set(variant.pose).size, 3);
      assert.match(variant.lens, /1×/);
    }
  }
});

test('all local reference images exist and are compressed', async () => {
  for (const scene of scenes) {
    const info = await stat(new URL(`../public/${scene.image}`, import.meta.url));
    assert.ok(info.size > 10000 && info.size < 1000000, scene.image);
  }
});

test('scene selection defaults to all, supports filters, search, and their intersection', () => {
  assert.equal(selectScenes(scenes).length, 6);
  assert.deepEqual(selectScenes(scenes, { category: 'coast' }).map(scene => scene.id), ['coast']);
  assert.deepEqual(selectScenes(scenes, { query: '  咖啡  ' }).map(scene => scene.id), ['cafe']);
  assert.equal(selectScenes(scenes, { category: 'coast', query: '咖啡' }).length, 0);
  assert.equal(selectScenes(scenes, { query: '完全不存在的场景' }).length, 0);
  assert.ok(selectScenes(scenes, { query: '包带' }).length > 0);
  assert.equal(selectScenes(scenes, { query: '   ' }).length, 6);
});

test('saved view only includes saved scenes and respects filters', () => {
  assert.deepEqual(selectScenes(scenes, { view: 'saved', saved: ['coast', 'park'] }).map(scene => scene.id), ['park', 'coast']);
  assert.equal(selectScenes(scenes, { view: 'saved', saved: [] }).length, 0);
  assert.equal(selectScenes(scenes, { view: 'saved', saved: ['coast'], category: 'park' }).length, 0);
  assert.deepEqual(selectScenes(scenes, { view: 'saved', saved: ['coast'], query: '海边' }).map(scene => scene.id), ['coast']);
});

test('favorite parsing tolerates corrupt storage and rejects unknown values', () => {
  for (const raw of [null, 'not json', '{}', 'null', '42', '"park"']) assert.deepEqual(parseSaved(raw, ids), []);
  assert.deepEqual(parseSaved('["park","park","coast","unknown",null,{},3,"<img onerror=alert(1)>"]', ids), ['park', 'coast']);
});

test('toggling favorites is reversible and does not mutate its input', () => {
  const saved = ['park'];
  assert.deepEqual(toggleSaved(saved, 'coast'), ['park', 'coast']);
  assert.deepEqual(toggleSaved(saved, 'park'), []);
  assert.deepEqual(saved, ['park']);
  assert.deepEqual(toggleSaved(toggleSaved(saved, 'coast'), 'coast'), saved);
});

test('static server delivers the app without exposing files outside public', async t => {
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [path, contentType] of [['/', 'text/html'], ['/app.js', 'text/javascript'], ['/data.js', 'text/javascript'], ['/style.css', 'text/css'], ['/favicon.svg', 'image/svg+xml'], ['/images/coast.jpg', 'image/jpeg']]) {
    await t.test(`serves ${path}`, async () => {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 200);
      assert.ok(response.headers.get('content-type').startsWith(contentType));
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.ok(response.headers.get('content-security-policy').includes("script-src 'self'"));
      assert.ok((await response.arrayBuffer()).byteLength > 0);
    });
  }
  await t.test('HEAD returns headers without a response body', async () => {
    const response = await fetch(base, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.ok(Number(response.headers.get('content-length')) > 0);
    assert.equal(await response.text(), '');
  });
  await t.test('rejects unsupported methods', async () => {
    const response = await fetch(base, { method: 'POST' });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
  });
  for (const path of ['/missing', '/package.json', '/images/', '/%2e%2e%2fserver.js', '/.env']) {
    await t.test(`does not expose ${path}`, async () => {
      const response = await fetch(`${base}${path}`);
      assert.ok([403, 404].includes(response.status));
    });
  }
  await t.test('rejects malformed URL encoding', async () => {
    const response = await fetch(`${base}/%E0%A4%A`);
    assert.equal(response.status, 400);
  });
});
