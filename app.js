import { scenes, modes } from './data.js';
import { selectScenes, parseSaved, toggleSaved } from './model.js';

const $ = selector => document.querySelector(selector);
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const sceneIcons = { park: 'tree', coast: 'wave', street: 'street', mountain: 'mountain', architecture: 'arch', cafe: 'cup' };
const modeIcons = { landscape: 'grid', portrait: 'person', interaction: 'camera' };
const storageKey = 'in-frame:saved-scenes:v1';
const validIds = scenes.map(scene => scene.id);
let storageAvailable = true;
let saved = [];
try {
  saved = parseSaved(localStorage.getItem(storageKey), validIds);
} catch {
  storageAvailable = false;
}
const state = { view: 'explore', category: 'all', query: '', saved, scene: null, mode: 'landscape', step: null };
const shotDialog = $('#shot-dialog');
const guideDialog = $('#guide-dialog');
let toastTimer;
let opener;

function renderFilters() {
  $('#scene-filters').innerHTML = [{ id: 'all', category: '全部场景' }, ...scenes].map(scene => `<button class="filter${state.category === scene.id ? ' active' : ''}" data-category="${scene.id}" aria-pressed="${state.category === scene.id}">${icon(sceneIcons[scene.id] || 'grid')}${scene.category}</button>`).join('');
}

function renderCards() {
  const visible = selectScenes(scenes, state);
  $('#scene-grid').innerHTML = visible.map(scene => {
    const isSaved = state.saved.includes(scene.id);
    return `<article class="scene-card" data-scene="${scene.id}">
      <div class="card-photo"><button class="photo-open" data-open="${scene.id}" aria-label="查看${scene.category}拍摄指导"><img src="${scene.image}" alt="${escape(scene.alt)}" width="1400" height="933" loading="lazy" decoding="async"></button>
        <span class="card-category">${icon(sceneIcons[scene.id])}${scene.category}</span>
        <button class="save-button${isSaved ? ' saved' : ''}" data-save="${scene.id}" aria-label="${isSaved ? '取消收藏' : '收藏'}${scene.category}" aria-pressed="${isSaved}">${icon('bookmark')}</button><span class="image-disclosure">AI 生成参考</span>
      </div>
      <div class="card-body"><button class="card-heading" data-open="${scene.id}"><h3>${escape(scene.title)}</h3>${icon('arrow')}</button><p class="card-subtitle">${escape(scene.subtitle)}</p>
        <div class="card-tags"><div>${scene.tags.map(tag => `<span class="tag">${escape(tag)}</span>`).join('')}</div><button class="card-more" data-open="${scene.id}" aria-label="查看${scene.category}的三种拍法">3 种拍法 ${icon('chevron')}</button></div>
      </div></article>`;
  }).join('');
  $('#result-count').textContent = `${visible.length} 个场景 · ${visible.length * 3} 种拍法`;
  const count = $('#saved-count');
  count.textContent = state.saved.length;
  count.hidden = state.saved.length === 0;
  $('#empty-state').hidden = visible.length > 0;
  $('#scene-grid').hidden = visible.length === 0;
  const noFavorites = state.view === 'saved' && state.saved.length === 0;
  $('#empty-title').textContent = noFavorites ? '把下一次想拍的，先收藏起来' : '还没找到这个场景';
  $('#empty-description').textContent = noFavorites ? '点击照片右上角的收藏按钮，喜欢的拍法就在这里等你。' : '试试“海边”“窗边”或“散步”，也可以清除筛选重新看看。';
  $('#empty-reset').textContent = state.view === 'saved' ? '去发现拍摄灵感' : '清除筛选，看看全部';
}

function setView(view, shouldScroll = true) {
  state.view = view;
  state.category = 'all';
  state.query = '';
  $('#scene-search').value = '';
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active);
  });
  $('#section-eyebrow').textContent = view === 'saved' ? 'KEEP A LITTLE INSPIRATION' : 'FIND YOUR NEXT FRAME';
  $('#section-title').textContent = view === 'saved' ? '喜欢的拍法，下次照着拍。' : '下一张，想在哪里拍？';
  $('#section-description').textContent = view === 'saved' ? '给下一次出门，存一点拍照的灵感。收藏仅保存在当前浏览器。' : '选一个眼前的场景，把普通的一刻拍得不普通。';
  renderFilters();
  renderCards();
  if (shouldScroll) scrollToScenes();
}

function scrollToScenes() {
  $('#inspiration').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  $('#inspiration').focus({ preventScroll: true });
}

function showToast(message) {
  clearTimeout(toastTimer);
  const toast = $('#toast');
  (document.querySelector('dialog[open]') || document.body).append(toast);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}

function saveScene(id) {
  state.saved = toggleSaved(state.saved, id);
  let persisted = false;
  if (storageAvailable) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state.saved));
      persisted = true;
    } catch {
      storageAvailable = false;
    }
  }
  const isSaved = state.saved.includes(id);
  const cardHadFocus = $('#scene-grid').contains(document.activeElement);
  renderCards();
  const detailSave = $('#detail-content [data-save]');
  if (detailSave) {
    detailSave.setAttribute('aria-pressed', isSaved);
    detailSave.innerHTML = `${icon('bookmark')}${isSaved ? '已收藏' : '收藏拍法'}`;
  }
  if (cardHadFocus) ($(`[data-scene="${id}"] [data-save]`) || $('#scene-grid [data-save]') || $('#empty-reset')).focus({ preventScroll: true });
  showToast(persisted ? (isSaved ? '已收藏，下次来这里找灵感' : '已取消收藏') : '浏览器无法保存收藏，本次页面内仍可使用');
}

function background(sceneId) {
  const art = {
    park: '<path d="M14 157Q120 126 240 157T406 150V224H14Z" fill="#c4d3ad"/><path d="m170 224 60-73h24l41 73" fill="#e5debd"/><path d="M65 170V52M329 162V48M370 170V82" stroke="#9ba884" stroke-width="9"/><g fill="#adbf98"><circle cx="57" cy="59" r="45"/><circle cx="102" cy="50" r="39"/><circle cx="326" cy="51" r="48"/><circle cx="385" cy="81" r="45"/></g>',
    coast: state.mode === 'portrait' ? '<path d="M14 138h392v86H14z" fill="#b5ced0"/><path d="m14 125 55-18 48 15 30 16H14z" fill="#b2bdab"/><path d="M14 212q89-15 172 0t220-4v16H14" fill="#e0d4b5"/><path d="M32 170h118m101 0h128M50 190h79m157 0h92" stroke="#e3ebdf" stroke-width="2" fill="none"/>' : '<path d="M14 98h392v126H14z" fill="#b5ced0"/><path d="m14 83 66-26 54 20 49 32H14z" fill="#b2bdab"/><path d="M14 182q89-30 172 8t220-9v43H14" fill="#e0d4b5"/><path d="M32 128h128m65 0h153M65 145h123m60 14h110" stroke="#e3ebdf" stroke-width="2" fill="none"/>',
    street: '<path d="M14 26h102v164L14 224z" fill="#d2baa2"/><path d="m320 26 86 0v198l-86-34z" fill="#dacbb1"/><path d="m116 190 94-56 110 56 86 34H14z" fill="#d2cdbd"/><g fill="#a99780"><path d="M34 52h23v36H34zm41 0h23v36H75zm-41 64h23v36H34zm41 0h23v36H75zM342 61h23v35h-23zm0 63h23v35h-23z"/></g><path d="M210 134v90m0-90L83 224m127-90 128 90" fill="none" stroke="#b8b5a4"/>',
    mountain: '<path d="m14 167 86-88 60 51 85-81 90 84 71-46v137H14z" fill="#b2c2b0"/><path d="m14 195 114-71 65 33 89-52 124 73v46H14" fill="#91a68d"/><path d="M14 204q133-64 249-19t143 14v25H14z" fill="#c4ccab"/><path d="m159 224 54-39 15 2-27 37" fill="#e2d7b9"/>',
    architecture: '<path d="M14 26h392v198H14z" fill="#dfd0b3"/><path d="M32 224V102a52 52 0 0 1 104 0v122m21 0V92a52 52 0 0 1 104 0v132m22 0V82a52 52 0 0 1 104 0v142" fill="#bcb699" stroke="#e9dfc7" stroke-width="12"/><path d="M14 208h392v16H14z" fill="#d4c5a4"/><path d="m66 224 71-56v56m109 0 24-35v35m78 0 41-58v58" fill="#e8ddc2"/>',
    cafe: '<path d="M14 26h392v198H14z" fill="#ded4b9"/><rect x="33" y="41" width="109" height="111" rx="3" fill="#b5c4af" stroke="#b8ab8d" stroke-width="6"/><path d="M87 42v109M34 97h106" stroke="#eae6cc" stroke-width="4"/><path d="M14 191h392v33H14" fill="#c6b593"/><path d="M332 183v-55m-15 25 15 14 21-25" stroke="#8a9c79" stroke-width="4"/><path d="M316 180h34l-7 26h-21z" fill="#a88c6d"/>'
  };
  return art[sceneId];
}

function compositionDiagram(scene, mode) {
  const portrait = mode === 'portrait';
  const seated = scene.id === 'cafe';
  const x = portrait ? 210 : mode === 'landscape' ? 144 : 276;
  const y = portrait ? 66 : mode === 'landscape' ? 151 : 126;
  const scale = portrait ? 2.7 : mode === 'landscape' ? (seated ? .85 : .62) : 1.05;
  const gesture = mode === 'interaction';
  const arms = seated ? 'M-10 22-24 43-41 42M8 22-6 43-29 42' : gesture && scene.id === 'coast' ? 'M-9 22-24 8-13-2M9 22 17 43 12 54' : gesture && scene.id === 'street' ? 'M-9 22-27 29-42 19M9 22 16 47' : scene.id === 'mountain' ? 'M-9 22-19 35-7 26M9 22 19 35 7 26' : gesture && scene.id === 'park' ? 'M-9 22-23 39-30 40M9 22 23 39' : portrait || scene.id === 'architecture' ? 'M-9 22-17 42 2 44M9 22 17 41-3 44' : scene.id === 'park' || scene.id === 'street' ? 'M-9 22-19 37-7 28M9 22 17 46 12 53' : 'M-9 22-17 46-12 53M9 22 17 46 12 53';
  const legs = seated ? 'M-5 48-28 54-27 81M6 48-13 57-7 83' : gesture && scene.id === 'park' ? 'M-5 48-25 80M6 48 24 74' : 'M-5 48-9 81M6 48 12 81';
  return `<svg class="composition-diagram" viewBox="0 0 420 286" role="img" aria-label="${scene.category}，${modes.find(item => item.id === mode).label}构图示意：人物${portrait ? '靠近中央，半身入镜' : mode === 'landscape' ? '位于左侧三分线，远景入镜' : '位于右侧三分线，向左留出空间'}"><defs><clipPath id="frame-clip"><rect x="14" y="26" width="392" height="198" rx="5"/></clipPath></defs>
    <g clip-path="url(#frame-clip)"><rect x="14" y="26" width="392" height="198" fill="#dde5d6"/>${background(scene.id)}<path d="M144.7 26v198M275.3 26v198M14 92h392M14 158h392" fill="none" stroke="#fff" stroke-opacity=".65" stroke-width="1" stroke-dasharray="4 4"/>
    <g transform="translate(${x} ${y}) scale(${scale})">${seated ? '<path d="M14 19v38h-39m0 0v28m36-28v28" stroke="#8b795f" stroke-width="5" fill="none"/><path d="M-76 49h52m-36 0v39" stroke="#a68e6b" stroke-width="5"/><path d="M-45 35h10v10h-10" fill="#f5f1dd"/>' : ''}<ellipse cx="-1" cy="85" rx="24" ry="4" fill="#556548" opacity=".15"/><path d="${legs}" fill="none" stroke="#5a6253" stroke-width="8" stroke-linecap="round"/><path d="m-9 15 18 0 5 35h-28z" fill="#c67b55"/><path d="${arms}" fill="none" stroke="#c67b55" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M0 8v10" stroke="#d6a478" stroke-width="7"/><circle cy="0" r="10" fill="#dfb288"/><path d="M-10 0a10 10 0 0 1 20 0L3-3-9-1" fill="#5b5847"/><path d="m-9-1-3 3 4 1" fill="#dfb288"/></g></g>
    <rect x="14" y="26" width="392" height="198" rx="5" fill="none" stroke="#b7c4aa"/>
    <g transform="translate(${portrait ? 290 : mode === 'landscape' ? 54 : 303} 41)"><rect width="62" height="23" rx="4" fill="#fffdf2"/><text x="31" y="15" text-anchor="middle" fill="#956144" font-size="10">${portrait ? '人物突出' : mode === 'landscape' ? '多留风景' : '自然动作'}</text></g>
    <g transform="translate(126 249)" fill="none" stroke="#6e805f" stroke-width="1.6"><rect width="23" height="17" rx="3"/><path d="M6 0 8-4h7l2 4"/><circle cx="11.5" cy="8.5" r="4"/></g><text x="161" y="261" fill="#68785b" font-size="11">你的镜头 · ${escape(scene.variants[mode].height)}</text>
  </svg>`;
}

function diagramPanel(scene, variant) {
  return `<div><div class="diagram-wrap"><div class="diagram-label">${icon('focus')} 构图 & 站位图解<span>非实景测量</span></div>${compositionDiagram(scene, state.mode)}<p class="diagram-caption"><strong>画面这样留：</strong>${escape(variant.composition)}</p></div><p class="light-note">${icon('sun')}${escape(scene.light)}</p><p class="safety-note">安全小提醒 · ${escape(variant.safety)}</p></div>`;
}

function stats(variant) {
  return `<div class="shot-stats"><div class="shot-stat"><span>手机镜头</span><b>${escape(variant.lens)}</b></div><div class="shot-stat"><span>拍摄距离参考</span><b>${escape(variant.distance)}</b></div><div class="shot-stat"><span>镜头举多高</span><b>${escape(variant.height)}</b></div></div>`;
}

function poseList(variant) {
  return `<ol class="pose-list">${variant.pose.map((pose, index) => `<li><span>0${index + 1}</span>${escape(pose)}</li>`).join('')}</ol>`;
}

function direction(variant) {
  return `<blockquote class="direction"><small>不知道怎么引导？直接照着说</small>“${escape(variant.direction)}”</blockquote>`;
}

function renderDetail() {
  const scene = scenes.find(item => item.id === state.scene);
  const variant = scene.variants[state.mode];
  if (state.step !== null) {
    renderWalkthrough(scene, variant);
    return;
  }
  const isSaved = state.saved.includes(scene.id);
  $('#detail-content').innerHTML = `<div class="detail-intro"><div><span class="section-eyebrow">${escape(scene.category)} / 3 WAYS TO FRAME</span><h2 id="detail-title">${escape(scene.title)}</h2><p>同一处风景，换一种拍法，就有新的故事。</p></div><button class="detail-save" data-save="${scene.id}" aria-pressed="${isSaved}">${icon('bookmark')}${isSaved ? '已收藏' : '收藏拍法'}</button></div>
    <div class="mode-tabs" role="tablist" aria-label="选择拍摄方式">${modes.map(mode => `<button class="mode-tab${state.mode === mode.id ? ' active' : ''}" id="mode-${mode.id}" role="tab" aria-controls="mode-panel" aria-selected="${state.mode === mode.id}" tabindex="${state.mode === mode.id ? 0 : -1}" data-mode="${mode.id}">${icon(modeIcons[mode.id])}<span><b>${mode.label}</b><small>${mode.description}</small></span></button>`).join('')}</div>
    <div class="detail-columns" id="mode-panel" role="tabpanel" aria-labelledby="mode-${state.mode}">${diagramPanel(scene, variant)}<div class="detail-instructions"><h3>${escape(variant.title)}</h3><p class="variant-summary">${escape(variant.summary)}</p>${stats(variant)}<h4 class="instruction-label">${icon('person')} 人物这样站、这样动</h4><p class="variant-summary">${escape(variant.position)}</p>${poseList(variant)}${direction(variant)}<p class="avoid">少踩一个坑 · ${escape(variant.avoid)}</p></div></div>
    <div class="detail-bottom"><span>距离只是起点，请根据实际画面调整。<br>不用一次记住，跟着步骤慢慢拍。</span><button class="button primary" data-action="start-walk">开始跟拍 ${icon('arrow')}</button></div>`;
}

function renderWalkthrough(scene, variant) {
  if (state.step === 4) {
    $('#detail-content').innerHTML = `<div class="complete-state"><span class="complete-mark">${icon('check')}</span><span class="section-eyebrow">ONE FRAME, ONE LITTLE STORY</span><h2 id="detail-title">这一组，拍好了。</h2><p>放大照片检查一下：眼睛清晰吗？画面歪了吗？<br>喜欢这一张，就再试试另一种拍法。<br>慢慢来，每按一次快门都是进步。</p><div class="complete-actions"><button class="button secondary" data-action="back-detail">换一种拍法</button><button class="button primary" data-action="close-shot">继续找灵感 ${icon('arrow')}</button></div></div>`;
    return;
  }
  const steps = [
    { name: '先把位置站对', body: `<p>${escape(variant.position)}</p><p class="avoid">${escape(variant.composition)}</p>${stats(variant)}` },
    { name: '给身体一个小动作', body: `${poseList(variant)}${direction(variant)}` },
    { name: '摄影师，准备好镜头', body: `<p>举到${escape(variant.height)}，先用${escape(variant.lens)}。打开网格线，按图解调整画面，再点一下人物的脸对焦。</p>${stats(variant)}<p class="avoid">${escape(variant.avoid)}</p>` },
    { name: '现在，留住这一刻', body: `<p>${state.mode === 'interaction' ? '让对方慢慢完成动作；手机支持连拍时，可以连续抓几张。保持机位稳定，不要一边拍一边倒退。' : '检查头顶和脚下的留白，稳住手机，等对方放松下来再按快门。多拍几张，捕捉自然的表情。'}</p>${direction(variant)}<p class="avoid">照片由你在手机相机中拍摄；本页面不会访问相机或上传照片。</p>` }
  ];
  const step = steps[state.step];
  $('#detail-content').innerHTML = `<div class="walkthrough"><div class="walkthrough-heading"><div><span class="section-eyebrow">${scene.category} · ${modes.find(mode => mode.id === state.mode).label}</span><h2 id="detail-title">一步一步，拍出这一张。</h2></div><button class="button text-button" data-action="back-detail">退出跟拍</button></div><div class="step-progress" aria-label="第 ${state.step + 1} 步，共 4 步">${steps.map((_, index) => `<span class="${index <= state.step ? 'done' : ''}"></span>`).join('')}</div><div class="walk-columns">${diagramPanel(scene, variant)}<section class="walk-step" aria-live="polite"><span class="section-eyebrow">STEP 0${state.step + 1} / 04</span><h3>${step.name}</h3>${step.body}</section></div></div><div class="detail-bottom"><button class="button secondary" data-action="previous-step" ${state.step === 0 ? 'disabled' : ''}>上一步</button><span>${state.step + 1} / 4</span><button class="button primary" data-action="next-step">${state.step === 3 ? '拍好了，完成' : '准备好了，下一步'} ${icon(state.step === 3 ? 'check' : 'arrow')}</button></div>`;
}

function openScene(id, trigger) {
  opener = trigger;
  state.scene = id;
  state.mode = 'landscape';
  state.step = null;
  renderDetail();
  shotDialog.showModal();
  document.body.classList.add('modal-open');
  shotDialog.scrollTop = 0;
}

function updateStep(next) {
  state.step = next;
  renderDetail();
  shotDialog.scrollTop = 0;
  const title = $('#detail-title');
  title.setAttribute('tabindex', '-1');
  title.focus({ preventScroll: true });
}

function closeDialog(dialog) {
  dialog.close();
}

for (const dialog of [shotDialog, guideDialog]) {
  dialog.addEventListener('close', () => {
    document.body.classList.remove('modal-open');
    const toast = $('#toast');
    toast.hidden = true;
    document.body.append(toast);
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    else if (dialog === shotDialog) ($(`[data-open="${state.scene}"]`) || $('[data-view="explore"]')).focus({ preventScroll: true });
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog);
  });
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.view) return setView(button.dataset.view);
  if (button.dataset.category) {
    state.category = button.dataset.category;
    renderFilters();
    renderCards();
    $(`[data-category="${state.category}"]`).focus({ preventScroll: true });
    return;
  }
  if (button.dataset.save) return saveScene(button.dataset.save);
  if (button.dataset.open) return openScene(button.dataset.open, button);
  if (button.dataset.mode) {
    state.mode = button.dataset.mode;
    renderDetail();
    $(`[data-mode="${state.mode}"]`).focus({ preventScroll: true });
    return;
  }
  switch (button.dataset.action) {
    case 'explore': setView('explore'); break;
    case 'guide': opener = button; guideDialog.showModal(); document.body.classList.add('modal-open'); break;
    case 'close-guide': closeDialog(guideDialog); break;
    case 'guide-start': closeDialog(guideDialog); setView('explore'); break;
    case 'close-shot': closeDialog(shotDialog); break;
    case 'start-walk': updateStep(0); break;
    case 'back-detail': state.step = null; renderDetail(); shotDialog.scrollTop = 0; $(`[data-mode="${state.mode}"]`).focus({ preventScroll: true }); break;
    case 'next-step': updateStep(Math.min(4, state.step + 1)); break;
    case 'previous-step': updateStep(Math.max(0, state.step - 1)); break;
  }
});

$('#empty-reset').addEventListener('click', () => setView('explore'));
$('#scene-search').addEventListener('input', event => { state.query = event.target.value; renderCards(); });
shotDialog.addEventListener('keydown', event => {
  if (!event.target.matches('[data-mode]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const index = modes.findIndex(mode => mode.id === state.mode);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
  state.mode = modes[next].id;
  renderDetail();
  $(`[data-mode="${state.mode}"]`).focus();
});
window.addEventListener('storage', event => {
  if (event.key !== storageKey && event.key !== null) return;
  state.saved = parseSaved(event.newValue, validIds);
  renderCards();
  if (shotDialog.open && state.step === null) renderDetail();
});
renderFilters();
renderCards();
