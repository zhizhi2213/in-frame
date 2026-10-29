import test from 'node:test';
import assert from 'node:assert/strict';
import { stat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { scenes, modes } from '../public/data.js';
import { photos } from '../public/photos.js';
import { albums, imageSources, sourceRights, rightsNote, imagePresentation, practiceDisclosure } from '../public/image-sources.js';
import { selectScenes, selectPhotos, parseSaved, toggleSaved } from '../public/model.js';
import { createAppServer } from '../server.js';

const ids = scenes.map(scene => scene.id);
const photoIds = photos.map(photo => photo.id);

function assertText(value, label) {
  assert.ok(typeof value === 'string' && value.trim().length > 0, label);
}

function assertSourceUrl(value, hosts) {
  const url = new URL(value);
  assert.ok(['http:', 'https:'].includes(url.protocol), value);
  assert.ok(hosts.includes(url.hostname), value);
  assert.equal(url.username + url.password + url.port + url.hash, '', value);
  return url;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

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

test('sixteen photos have independent close readings instead of scene references', () => {
  assert.equal(photos.length, 16);
  assert.equal(new Set(photoIds).size, 16);
  assert.deepEqual(Object.keys(imageSources).sort(), [...photoIds].sort());
  for (const scene of scenes) {
    assert.equal(Object.hasOwn(scene, 'image'), false, scene.id);
    assert.equal(Object.hasOwn(scene, 'reference'), false, scene.id);
  }
  for (const photo of photos) {
    assert.match(photo.id, /^study-[a-z0-9-]+$/);
    assert.ok(!ids.includes(photo.id), photo.id);
    assert.ok(ids.includes(photo.sceneId), photo.id);
    for (const key of ['title', 'takeaway', 'level', 'alt', 'observation', 'composition', 'light', 'pose']) {
      assertText(photo[key], `${photo.id}/${key}`);
    }
    assert.ok(Array.isArray(photo.tags) && photo.tags.length > 0, photo.id);
    for (const tag of photo.tags) assertText(tag, `${photo.id}/tag`);
    assert.equal(new Set(photo.tags).size, photo.tags.length, photo.id);
    assert.equal(new Set([photo.observation, photo.composition, photo.light, photo.pose]).size, 4, photo.id);
  }
  for (const key of ['title', 'takeaway', 'alt', 'observation', 'composition', 'light', 'pose']) {
    assert.equal(new Set(photos.map(photo => photo[key])).size, 16, `${key} must be image-specific`);
  }
});

test('each photo has its own complete three-step shooting exercise', () => {
  assert.equal(new Set(photos.map(photo => photo.exercise)).size, 16);
  assert.equal(new Set(photos.map(photo => photo.exercise.steps)).size, 16);
  for (const photo of photos) {
    for (const key of ['position', 'camera', 'direction', 'check', 'avoid']) {
      assertText(photo.exercise[key], `${photo.id}/exercise/${key}`);
    }
    assert.match(photo.exercise.camera, /1×/, photo.id);
    assert.ok(Array.isArray(photo.exercise.steps), photo.id);
    assert.equal(photo.exercise.steps.length, 3, photo.id);
    assert.equal(new Set(photo.exercise.steps).size, 3, photo.id);
    for (const step of photo.exercise.steps) assertText(step, `${photo.id}/exercise/step`);
  }
  for (const key of ['position', 'camera', 'steps', 'direction', 'check', 'avoid']) {
    assert.equal(new Set(photos.map(photo => JSON.stringify(photo.exercise[key]))).size, 16, `${key} must be image-specific`);
  }
});

test('sixteen distinct sources credit five authors with safe CNU URLs and original sequence numbers', () => {
  const albumEntries = Object.entries(albums);
  assert.equal(albumEntries.length, 5);
  assert.equal(new Set(albumEntries.map(([, album]) => album.author)).size, 5);
  assert.equal(new Set(albumEntries.map(([, album]) => album.sourceUrl)).size, 5);
  assert.equal(new Set(albumEntries.map(([, album]) => album.authorUrl)).size, 5);
  assert.deepEqual([...new Set(photos.map(photo => photo.source.album))].sort(), Object.keys(albums).sort());
  for (const [id, album] of albumEntries) {
    for (const key of ['title', 'author']) assertText(album[key], `${id}/${key}`);
    for (const [key, route] of [['sourceUrl', 'works'], ['authorUrl', 'users']]) {
      const url = assertSourceUrl(album[key], ['www.cnu.cc', 'cnu.cc']);
      assert.match(url.pathname, new RegExp(`^/${route}/[1-9]\\d*$`), `${id}/${key}`);
      assert.equal(url.search, '', `${id}/${key}`);
    }
  }
  for (const photo of photos) {
    const source = photo.source;
    assert.equal(source, imageSources[photo.id], photo.id);
    assert.ok(Object.hasOwn(albums, source.album), photo.id);
    assert.equal(photo.album, albums[source.album], photo.id);
    assert.ok(Number.isInteger(source.index) && source.index > 0, photo.id);
    assert.match(source.image, /^images\/study-[a-z0-9-]+\.jpg$/, photo.id);
    const preview = assertSourceUrl(source.previewUrl, ['imgoss.cnu.cc']);
    assert.match(preview.pathname, /^\/\d{4}\/\d{2}\/[a-z0-9]+\.jpg$/i, photo.id);
    assert.deepEqual([...preview.searchParams], [['x-oss-process', 'style/content']], photo.id);
    for (const key of ['width', 'height', 'sourceWidth', 'sourceHeight']) {
      assert.ok(Number.isInteger(source[key]) && source[key] > 0, `${photo.id}/${key}`);
    }
  }
  assert.equal(new Set(photos.map(photo => `${photo.album.sourceUrl}#${photo.source.index}`)).size, 16);
  for (const key of ['image', 'previewUrl']) {
    assert.equal(new Set(photos.map(photo => photo.source[key])).size, 16, key);
  }
});

test('rights retain attribution without claiming CC0, a license version, or verified camera settings', () => {
  for (const [key, value] of Object.entries({ sourceRights, rightsNote, imagePresentation, practiceDisclosure })) {
    assertText(value, key);
  }
  assert.match(sourceRights, /署名/);
  assert.match(sourceRights, /CC/);
  assert.doesNotMatch(sourceRights, /CC\s*0|\d+(?:\.\d+)?|公有领域|公共领域/i);
  assert.match(rightsNote, /未注明具体\s*CC\s*版本/i);
  assert.match(rightsNote, /不等同于\s*CC\s*0/i);
  assert.match(rightsNote, /署名和原作链接/);
  assert.match(rightsNote, /不代表.*额外授权/);
  const licenseClaims = `${sourceRights} ${rightsNote.replace(/不等同于\s*CC\s*0/gi, '')}`;
  assert.doesNotMatch(licenseClaims, /CC\s*0|\bCC(?:[\s-]+BY)?(?:[\s-]+(?:NC|ND|SA))*[\s-]*[1-9](?:\.\d+)?|creativecommons\.org\/(?:licenses|publicdomain)\//i);
  assert.match(imagePresentation, /保留完整画幅与原有色彩/);
  assert.match(imagePresentation, /不做.*AI.*裁切/);
  assert.match(practiceDisclosure, /练习步骤为本站建议/);
  assert.match(practiceDisclosure, /未核实原作\s*EXIF/i);
  assert.match(practiceDisclosure, /不推断实际焦距/);
});

test('all sixteen local JPEGs are distinct, under 1.5 MB, and match metadata within one-pixel scaling', async () => {
  const hashes = new Set();
  for (const photo of photos) {
    const source = photo.source;
    const file = new URL(`../public/${source.image}`, import.meta.url);
    const info = await stat(file);
    assert.ok(info.isFile(), photo.id);
    assert.ok(info.size > 0 && info.size < 1_500_000, `${photo.id}: ${info.size} bytes`);
    const bytes = await readFile(file);
    assert.equal(bytes.length, info.size, photo.id);
    assert.equal(bytes.readUInt16BE(0), 0xffd8, photo.id);
    assert.equal(bytes.readUInt16BE(bytes.length - 2), 0xffd9, photo.id);
    hashes.add(createHash('sha256').update(bytes).digest('hex'));
    let dimensions;
    for (let offset = 2; offset + 8 < bytes.length;) {
      assert.equal(bytes[offset], 0xff, photo.id);
      const marker = bytes[offset + 1];
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        dimensions = { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
        break;
      }
      if (marker === 0xda || marker === 0xd9) break;
      const length = bytes.readUInt16BE(offset + 2);
      assert.ok(length >= 2 && offset + 2 + length <= bytes.length, photo.id);
      offset += 2 + length;
    }
    assert.deepEqual(dimensions, { width: source.width, height: source.height }, photo.id);
    const scale = Math.max(source.width, source.height) / Math.max(source.sourceWidth, source.sourceHeight);
    assert.ok(Math.abs(source.width - source.sourceWidth * scale) <= 1, `${photo.id}: uncropped width`);
    assert.ok(Math.abs(source.height - source.sourceHeight * scale) <= 1, `${photo.id}: uncropped height`);
  }
  assert.equal(hashes.size, 16, 'each study uses a different JPEG');
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

test('photo selection handles defaults, empty inputs, unknown filters, and all scene categories', () => {
  assert.deepEqual(selectPhotos(photos), photos);
  assert.deepEqual(selectPhotos(photos, {}), photos);
  assert.deepEqual(selectPhotos(photos, { category: 'all', query: ' \t\n ', view: 'explore', saved: [] }), photos);
  assert.deepEqual(selectPhotos([], { category: 'park', query: '树', view: 'saved', saved: photoIds }), []);
  assert.deepEqual(selectPhotos([]), []);
  assert.deepEqual(selectPhotos(photos, { category: 'unknown' }), []);
  assert.deepEqual(selectPhotos(photos, { query: '完全不存在的精读内容' }), []);
  assert.deepEqual(selectPhotos(photos, { view: 'saved' }), []);
  assert.deepEqual(selectPhotos(photos, { view: 'saved', saved: [] }), []);
  assert.deepEqual(selectPhotos(photos, { view: 'saved', saved: [...ids, 'unknown', null, {}, 3] }), []);
  assert.deepEqual(selectPhotos(photos, { view: 'explore', saved: ['study-hands'] }), photos);
  for (const category of ids) {
    assert.deepEqual(selectPhotos(photos, { category }), photos.filter(photo => photo.sceneId === category), category);
  }
});

test('photo search finds authors, albums, techniques, close readings, tags, and exercise instructions', () => {
  for (const [query, expected] of [
    ['  KuNaL  ', ['study-mountain-scale', 'study-newspaper', 'study-forest-pair', 'study-seated-pair', 'study-slope']],
    ['lansh蓝', ['study-tree-standing', 'study-tree-seated', 'study-leaves']],
    ['清寂之年', ['study-corridor', 'study-orange', 'study-hands']],
    ['引导线', ['study-corridor']],
    ['低机位', ['study-newspaper']],
    ['鼻梁', ['study-leaves']],
    ['明暗聚焦', ['study-hands']],
    ['慢慢剥一瓣橘子', ['study-orange']]
  ]) {
    assert.deepEqual(selectPhotos(photos, { query }).map(photo => photo.id), expected, query);
  }
});

test('photo search indexes every reading and exercise field independently', () => {
  const paths = [
    ['title'], ['takeaway'], ['alt'], ['observation'], ['composition'], ['light'], ['pose'],
    ['tags', 0], ['album', 'author'], ['album', 'title'],
    ['exercise', 'position'], ['exercise', 'camera'], ['exercise', 'direction'],
    ['exercise', 'check'], ['exercise', 'avoid'],
    ['exercise', 'steps', 0], ['exercise', 'steps', 1], ['exercise', 'steps', 2]
  ];
  for (const path of paths) {
    const target = structuredClone(photos[0]);
    const other = structuredClone(photos[1]);
    let parent = target;
    for (const key of path.slice(0, -1)) parent = parent[key];
    parent[path.at(-1)] = 'UniqueSearchToken';
    assert.deepEqual(
      selectPhotos([target, other], { query: '  uNIQUEsEARCHtOKEN  ' }).map(photo => photo.id),
      [target.id],
      path.join('.')
    );
  }
});

test('photo filters intersect scene, search, and saved photo IDs while retaining gallery order', () => {
  const saved = ['study-hands', 'study-corridor', 'study-orange', 'study-hands', 'park', 'unknown'];
  assert.deepEqual(selectPhotos(photos, { view: 'saved', saved }).map(photo => photo.id), ['study-corridor', 'study-orange', 'study-hands']);
  assert.deepEqual(selectPhotos(photos, { category: 'park', query: '微醺十月' }).map(photo => photo.id), ['study-orange', 'study-hands']);
  assert.deepEqual(selectPhotos(photos, { category: 'park', view: 'saved', saved }).map(photo => photo.id), ['study-orange', 'study-hands']);
  assert.deepEqual(selectPhotos(photos, { query: '手部细节', view: 'saved', saved }).map(photo => photo.id), ['study-hands']);
  assert.deepEqual(selectPhotos(photos, { category: 'park', query: '微醺十月', view: 'saved', saved: ['study-hands', 'study-corridor'] }).map(photo => photo.id), ['study-hands']);
  assert.deepEqual(selectPhotos(photos, { category: 'park', query: '微醺十月', view: 'saved', saved: ['study-corridor'] }), []);
  assert.deepEqual(selectPhotos(photos, { category: 'architecture', query: '明暗聚焦', view: 'saved', saved }), []);
});

test('photo-only favorite parsing excludes scene IDs when only photo IDs are allowed', () => {
  const validIds = Object.freeze([...photoIds]);
  for (const raw of [null, '', 'not json', '{}', 'null', '42', 'true', '"study-corridor"', '["study-hands",']) {
    assert.deepEqual(parseSaved(raw, validIds), [], String(raw));
  }
  const raw = JSON.stringify([...ids, 'study-hands', 'study-hands', 'study-corridor', 'unknown', null, {}, 3, ['study-orange'], '<img onerror=alert(1)>']);
  assert.deepEqual(parseSaved(raw, validIds), ['study-hands', 'study-corridor']);
  assert.deepEqual(parseSaved(JSON.stringify(ids), validIds), []);
  assert.deepEqual(parseSaved(JSON.stringify(photoIds), validIds), photoIds);
  assert.deepEqual(parseSaved(raw, []), []);
  assert.deepEqual(validIds, photoIds);
  assert.deepEqual(selectPhotos(photos, { view: 'saved', saved: parseSaved(raw, validIds) }).map(photo => photo.id), ['study-corridor', 'study-hands']);
});

test('combined favorites preserve existing scene IDs alongside new photo IDs', () => {
  const saved = parseSaved('["park","study-hands","coast","study-corridor","study-hands","unknown"]', [...ids, ...photoIds]);
  assert.deepEqual(saved, ['park', 'study-hands', 'coast', 'study-corridor']);
  assert.deepEqual(selectPhotos(photos, { view: 'saved', saved }).map(photo => photo.id), ['study-corridor', 'study-hands']);
  assert.deepEqual(selectScenes(scenes, { view: 'saved', saved }).map(scene => scene.id), ['park', 'coast']);
  assert.deepEqual(selectPhotos(photos, { query: '日常咖啡' }).map(photo => photo.id), ['study-diner-table', 'study-window']);
});

test('photo selection and favorite toggling do not mutate photos, nested data, options, or saved IDs', () => {
  const input = deepFreeze(structuredClone(photos));
  const before = structuredClone(input);
  const saved = Object.freeze(['study-hands', 'study-corridor']);
  const options = Object.freeze({ category: 'park', query: '  微醺十月  ', view: 'saved', saved });
  selectPhotos(input);
  selectPhotos(input, { query: 'KUNAL' });
  assert.deepEqual(selectPhotos(input, options).map(photo => photo.id), ['study-hands']);
  assert.deepEqual(input, before);
  assert.deepEqual(options, { category: 'park', query: '  微醺十月  ', view: 'saved', saved: ['study-hands', 'study-corridor'] });
  assert.deepEqual(toggleSaved(saved, 'study-orange'), ['study-hands', 'study-corridor', 'study-orange']);
  assert.deepEqual(toggleSaved(saved, 'study-hands'), ['study-corridor']);
  assert.deepEqual(toggleSaved(toggleSaved(saved, 'study-orange'), 'study-orange'), saved);
  assert.deepEqual(saved, ['study-hands', 'study-corridor']);
});

test('static server delivers the app without exposing files outside public', async t => {
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [path, contentType] of [['/', 'text/html'], ['/app.js', 'text/javascript'], ['/data.js', 'text/javascript'], ['/photos.js', 'text/javascript'], ['/image-sources.js', 'text/javascript'], ['/style.css', 'text/css'], ['/favicon.svg', 'image/svg+xml'], [`/${photos[0].source.image}`, 'image/jpeg']]) {
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
