const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const loginPanel = $('#loginPanel');
const adminPanel = $('#adminPanel');
const postForm = $('#postForm');
const pageForm = $('#pageForm');
const settingsForm = $('#settingsForm');
let settingsHomePreviewFast = () => {};

let posts = [];
let pages = [];
let comments = [];
let homeCards = [];
let islandTimer = null;
const listState = { header_nav_links: [], nav_links: [], project_cards: [], friend_links: [], music_playlist: [] };
const taxonomyState = { categories: [], tags: [] };

const DEFAULT_MODULE_VISIBILITY = {
  header_nav: true,
  theme_switcher: true,
  hero: true,
  hero_cards: true,
  feature_cards: true,
  project_showcase: true,
  friend_links: true,
  profile_card: true,
  categories: true,
  tags: true,
  quick_nav: true,
  music_player: true,
  site_notice: true,
  footer: true,
  comments: true,
  license: true,
  post_nav: true
};
let moduleVisibilityState = { ...DEFAULT_MODULE_VISIBILITY };
function parseModuleVisibility(value) {
  if (!value) return { ...DEFAULT_MODULE_VISIBILITY };
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return { ...DEFAULT_MODULE_VISIBILITY, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return { ...DEFAULT_MODULE_VISIBILITY };
  }
}
function syncModuleVisibilityInput() {
  if (!settingsForm?.elements?.module_visibility) return;
  settingsForm.elements.module_visibility.value = JSON.stringify(moduleVisibilityState);
}
function renderVisibilityToggles() {
  $$('[data-visible-module]').forEach(input => {
    input.checked = moduleVisibilityState[input.dataset.visibleModule] !== false;
  });
  syncModuleVisibilityInput();
}
function bindVisibilityToggles() {
  $$('[data-visible-module]').forEach(input => input.addEventListener('change', () => {
    moduleVisibilityState[input.dataset.visibleModule] = input.checked;
    syncModuleVisibilityInput();
    markDirty();
    settingsHomePreviewFast();
  }));
}
function isPreviewModuleVisible(key) { return moduleVisibilityState[key] !== false; }

function escapeHtml(str = '') { return String(str).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch])); }
function fmtDate(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value || '').slice(0, 10) : d.toLocaleDateString('zh-CN'); }
function showIsland(text = '已完成') { const island = $('#quickIsland'); const islandText = $('#islandText'); if (!island || !islandText) return; islandText.textContent = text; island.classList.add('show'); clearTimeout(islandTimer); islandTimer = setTimeout(() => island.classList.remove('show'), 2200); }
function normalizeSlug(value = '') { return String(value || '').trim().replace(/^\/+/, '').replace(/\/+$/, '').replace(/\s+/g, '-'); }
function cleanPath(value = '') { const slug = normalizeSlug(value); return slug ? `/${slug}` : '/'; }
function normalizeLink(link = '') { const raw = String(link || '').trim(); if (!raw) return '#'; if (/^(https?:|mailto:|tel:|#)/i.test(raw)) return raw; return raw.startsWith('/') ? raw : `/${raw}`; }
function formDataToObject(form) { return Object.fromEntries(new FormData(form).entries()); }
function settingsDataToObject() {
  const data = formDataToObject(settingsForm);
  data.comment_moderation_enabled = settingsForm?.elements?.comment_moderation_enabled?.checked ? 'true' : 'false';
  return data;
}
async function api(path, options = {}) { const res = await fetch(path, { cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || '请求失败'); return data; }

function debounce(fn, delay = 120) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
let hasUnsavedChanges = false;
function markDirty() { hasUnsavedChanges = true; }
function markSaved() { hasUnsavedChanges = false; }
window.addEventListener('beforeunload', e => {
  if (!hasUnsavedChanges) return;
  e.preventDefault();
  e.returnValue = '';
});


function updateScrollProgress() { const progress = $('#scrollProgress'); const max = document.documentElement.scrollHeight - window.innerHeight; const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (window.scrollY / max) * 100)); if (progress) progress.style.width = `${pct}%`; }
function bindMouseAura() { const aura = $('#mouseAura'); if (!aura) return; window.addEventListener('pointermove', e => { document.body.classList.add('motion-ready'); aura.style.transform = `translate3d(${e.clientX - 180}px, ${e.clientY - 180}px, 0) scale(1)`; }, { passive: true }); window.addEventListener('scroll', updateScrollProgress, { passive: true }); updateScrollProgress(); }
function observeReveal() { if (!('IntersectionObserver' in window)) { $$('.reveal-up').forEach(el => el.classList.add('in-view')); return; } const io = new IntersectionObserver(entries => { entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('in-view'); io.unobserve(entry.target); } }); }, { threshold: 0.12 }); $$('.reveal-up').forEach(el => { if (!el.classList.contains('in-view')) io.observe(el); }); }
function initTheme() { const saved = localStorage.getItem('theme') || 'light'; document.documentElement.classList.toggle('dark', saved === 'dark'); $('#themeBtn').textContent = saved === 'dark' ? '☀️' : '🌙'; $('#themeBtn').addEventListener('click', () => { const dark = !document.documentElement.classList.contains('dark'); document.documentElement.classList.toggle('dark', dark); localStorage.setItem('theme', dark ? 'dark' : 'light'); $('#themeBtn').textContent = dark ? '☀️' : '🌙'; }); }
function switchTab(name) { $$('[data-admin-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.adminTab === name)); $$('[data-admin-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.adminPanel === name)); if (name === 'comments') loadComments(); if (name === 'system') loadSystemCheck(); showIsland(name === 'posts' ? '文章管理' : name === 'pages' ? '页面管理' : name === 'comments' ? '评论管理' : name === 'system' ? '系统检查' : '站点设置'); }
function showAdmin() { loginPanel.classList.add('hidden'); adminPanel.classList.remove('hidden'); $('#logoutBtn').classList.remove('hidden'); }
function showLogin() { loginPanel.classList.remove('hidden'); adminPanel.classList.add('hidden'); $('#logoutBtn').classList.add('hidden'); }


function parseEmbedAttrs(input = '') { const attrs = {}; String(input).replace(/(\w+)=("[^"]*"|'[^']*'|[^\s\]]+)/g, (_, key, value) => { attrs[key] = String(value || '').replace(/^['"]|['"]$/g, '').trim(); return ''; }); return attrs; }
function safeEmbedUrl(url = '') { let raw = String(url || '').trim(); if (!raw) return ''; if (/^\/\//.test(raw)) raw = `https:${raw}`; if (!/^https?:\/\//i.test(raw)) return ''; try { const parsed = new URL(raw); ['autoplay', 'autoPlay', 'auto_play', 'muted'].forEach(key => parsed.searchParams.delete(key)); if (/youtube\.com|youtu\.be|bilibili\.com/i.test(parsed.hostname)) parsed.searchParams.set('autoplay', '0'); return parsed.toString(); } catch { return raw.replace(/([?&])autoplay=1/ig, '$1autoplay=0').replace(/([?&])auto_?play=1/ig, '$1autoplay=0'); } }
function ratioToPadding(ratio = '16:9') { const [w, h] = String(ratio || '16:9').split(':').map(Number); if (!w || !h) return '56.25%'; return `${Math.min(160, Math.max(20, (h / w) * 100)).toFixed(4)}%`; }
function videoEmbedHtml(src = '', title = '外部视频', ratio = '16:9', className = '') { const safe = safeEmbedUrl(src); if (!safe) return ''; const extraClass = String(className || '').trim().replace(/[^a-zA-Z0-9_\- ]/g, ''); return `<figure class="video-embed card ${escapeHtml(extraClass)}" style="--video-ratio:${ratioToPadding(ratio)}"><div class="video-frame"><iframe src="${escapeHtml(safe)}" title="${escapeHtml(title || '外部视频')}" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>${title ? `<figcaption>${escapeHtml(title)}</figcaption>` : ''}</figure>`; }
function renderVideoLine(line = '') { const trimmed = line.trim(); if (!trimmed) return ''; if (trimmed.startsWith('::video ')) { const body = trimmed.replace(/^::video\s+/, ''); const parts = body.split(/\s+/); const src = parts.shift(); const attrs = parseEmbedAttrs(body); return videoEmbedHtml(attrs.src || src, attrs.title || '外部视频', attrs.ratio || '16:9', attrs.class || attrs.className || ''); } const shortMatch = trimmed.match(/^\[(?:video|iframe)\s+([^\]]+)\]$/i); if (shortMatch) { const attrs = parseEmbedAttrs(shortMatch[1]); return videoEmbedHtml(attrs.src || attrs.url, attrs.title || '外部视频', attrs.ratio || '16:9', attrs.class || attrs.className || ''); } const iframeSrc = trimmed.match(/^<iframe\b[^>]*\bsrc=["']([^"']+)["'][\s\S]*<\/iframe>$/i); if (iframeSrc) return videoEmbedHtml(iframeSrc[1], '外部视频', '16:9'); return ''; }

function readAttr(attrs = {}, key = '', fallback = '') { const value = attrs[key]; return value == null ? fallback : String(value); }
function moduleEmbedHtml(type = '', attrs = {}) {
  if (type === 'callout') { const tone = readAttr(attrs, 'tone', readAttr(attrs, 'type', 'tip')).replace(/[^a-zA-Z0-9_-]/g, '') || 'tip'; const title = readAttr(attrs, 'title', tone === 'warn' ? '注意' : '提示'); const text = readAttr(attrs, 'text', ''); return `<aside class="content-module module-callout module-${escapeHtml(tone)} card"><b>${escapeHtml(title)}</b><p>${inlineMd(text)}</p></aside>`; }
  if (type === 'quote') { const text = readAttr(attrs, 'text', ''); const author = readAttr(attrs, 'author', ''); return `<figure class="content-module module-quote"><blockquote>${inlineMd(text)}</blockquote>${author ? `<figcaption>— ${escapeHtml(author)}</figcaption>` : ''}</figure>`; }
  if (type === 'button') { const text = readAttr(attrs, 'text', '查看详情'); const url = normalizeLink(readAttr(attrs, 'url', '#')); const style = readAttr(attrs, 'style', 'primary').replace(/[^a-zA-Z0-9_-]/g, '') || 'primary'; return `<p class="content-module module-button-wrap"><a class="module-button module-button-${escapeHtml(style)}" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(text)}</a></p>`; }
  if (type === 'divider') return '<div class="content-module module-divider"><span></span></div>';
  if (type === 'gallery') { const images = readAttr(attrs, 'images', '').split('|').map(v => v.trim()).filter(Boolean); const caption = readAttr(attrs, 'caption', ''); if (!images.length) return ''; return `<figure class="content-module module-gallery card"><div class="gallery-grid">${images.map((src, i) => `<img src="${escapeHtml(src)}" alt="图片 ${i + 1}" loading="lazy">`).join('')}</div>${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`; }
  return '';
}
function renderSpecialLine(line = '') { const video = renderVideoLine(line); if (video) return video; const match = line.trim().match(/^\[(callout|quote|button|divider|gallery)\s*([^\]]*)\]$/i); if (!match) return ''; return moduleEmbedHtml(match[1].toLowerCase(), parseEmbedAttrs(match[2] || '')); }
function quoteAttr(value = '') { return String(value || '').replace(/&quot;/g, '"').replace(/"/g, '&quot;').replace(/\n/g, ' '); }

function applyPreviewCustomStyles() { const css = `${settingsForm?.elements?.video_embed_css?.value || ''}\n${settingsForm?.elements?.custom_css?.value || ''}`; let style = document.getElementById('adminCustomPreviewStyle'); if (!style) { style = document.createElement('style'); style.id = 'adminCustomPreviewStyle'; document.head.appendChild(style); } style.textContent = css; }
function initTiltCards(root = document) { /* 后台以编辑稳定性为主，不启用卡片倾斜。 */ }
function insertVideoTemplate(textarea, cb) { const code = '[video src="https://player.bilibili.com/player.html?bvid=BVxxxx" title="视频标题" ratio="16:9"]'; insertAtEnd(textarea, code, cb); showIsland('已插入外部视频模板'); }

function inlineMd(text = '') { return escapeHtml(text).replace(/!\[([^\]]*)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g, '<img alt="$1" src="$2">').replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/|#)[^\s)]*)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>'); }
function renderMarkdown(md = '') { const lines = String(md).replace(/\r\n/g, '\n').split('\n'); let html = ''; let inCode = false; let code = []; let inList = false; const closeList = () => { if (inList) { html += '</ul>'; inList = false; } }; for (const raw of lines) { const line = raw.trimEnd(); if (line.startsWith('```')) { if (!inCode) { closeList(); inCode = true; code = []; } else { html += `<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`; inCode = false; } continue; } if (inCode) { code.push(raw); continue; } if (!line.trim()) { closeList(); continue; } const specialBlock = renderSpecialLine(line); if (specialBlock) { closeList(); html += specialBlock; continue; } if (/^###\s+/.test(line)) { closeList(); html += `<h3>${inlineMd(line.replace(/^###\s+/, ''))}</h3>`; continue; } if (/^##\s+/.test(line)) { closeList(); html += `<h2>${inlineMd(line.replace(/^##\s+/, ''))}</h2>`; continue; } if (/^#\s+/.test(line)) { closeList(); html += `<h1>${inlineMd(line.replace(/^#\s+/, ''))}</h1>`; continue; } if (/^>\s?/.test(line)) { closeList(); html += `<blockquote>${inlineMd(line.replace(/^>\s?/, ''))}</blockquote>`; continue; } if (/^[-*]\s+/.test(line)) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inlineMd(line.replace(/^[-*]\s+/, ''))}</li>`; continue; } closeList(); html += `<p>${inlineMd(line)}</p>`; } closeList(); if (inCode) html += `<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`; return html; }

function defaultHomeCards() { return [{ label: 'Markdown', title: '实时预览', text: '后台写作时边写边看，适合快速发布文章。', icon: '✍️', link: '' }, { label: '页面系统', title: '文章 / 页面分离', text: '文章进博客流，页面做关于我、联系页或专题页。', icon: '📄', link: '/about' }, { label: '图片上传', title: '封面 / Logo / 头像', text: '支持上传封面图、正文图、网站 Logo 和头像。', icon: '🖼️', link: '' }]; }
function defaultHeaderNav() { return [{ title: '首页', link: '/' }, { title: '归档', link: '/archive' }, { title: '关于我', link: '/about' }]; }
function defaultNavLinks() { return [{ title: '关于我', desc: '独立页面示例', icon: '👋', link: '/about' }, { title: '作品集', desc: '鞋类设计、建模和视觉作品', icon: '👟', link: '/category/设计' }]; }
function defaultProjects() { return [{ title: '校园鞋店 Vlog', desc: '记录从收拾店铺到正式营业的过程。', image: '', tags: 'Vlog,校园,鞋店', link: '#' }]; }
function defaultFriends() { return [{ name: 'RyuChan', desc: '配置、写作和卡片化体验参考', avatar: '', link: 'https://github.com/kobaridev/RyuChan' }]; }
function defaultMusic() { return [{ title: '示例音乐', artist: '请填写音频 URL', url: '', cover: '' }]; }
function parseList(value, fallback = []) { try { const arr = JSON.parse(value || '[]'); return Array.isArray(arr) && arr.length ? arr : fallback; } catch { return fallback; } }
function parseArraySetting(value, fallback = []) { try { const arr = JSON.parse(value || '[]'); return Array.isArray(arr) ? arr : fallback; } catch { return String(value || '').split(/[，,\n]/); } }
function uniqueItems(items = []) { const seen = new Set(); const out = []; for (const item of items) { const value = String(item || '').trim(); if (!value || seen.has(value)) continue; seen.add(value); out.push(value); } return out; }
function normalizeCategoryInput(value = '') { return String(value || '').trim().replace(/^@+/, '').trim(); }
function normalizeTagInput(value = '') { const body = String(value || '').trim().replace(/^#+/, '').trim(); return body ? `#${body}` : ''; }
function tagLabel(value = '') { return String(value || '').startsWith('#') ? String(value || '') : `#${value}`; }
function categoryListFromValue(value) { return uniqueItems(parseArraySetting(value).map(normalizeCategoryInput).filter(Boolean)); }
function tagListFromValue(value) { return uniqueItems(parseArraySetting(value).map(normalizeTagInput).filter(Boolean)); }
function syncTaxonomyInputs() { if (settingsForm?.elements?.taxonomy_categories) settingsForm.elements.taxonomy_categories.value = JSON.stringify(uniqueItems(taxonomyState.categories.map(normalizeCategoryInput).filter(Boolean))); if (settingsForm?.elements?.taxonomy_tags) settingsForm.elements.taxonomy_tags.value = JSON.stringify(uniqueItems(taxonomyState.tags.map(normalizeTagInput).filter(Boolean))); }
function ensureTaxonomy(category, tags = []) { const cat = normalizeCategoryInput(category); if (cat && !taxonomyState.categories.includes(cat)) taxonomyState.categories.push(cat); for (const raw of Array.isArray(tags) ? tags : String(tags || '').split(/[，,]/)) { const tag = normalizeTagInput(raw); if (tag && !taxonomyState.tags.includes(tag)) taxonomyState.tags.push(tag); } syncTaxonomyInputs(); renderTaxonomyEditors(); }
function currentPostTags() { return uniqueItems(String(postForm?.tags?.value || '').split(/[，,]/).map(normalizeTagInput).filter(Boolean)); }
function setCurrentPostTags(tags) { if (!postForm?.tags) return; postForm.tags.value = uniqueItems(tags.map(normalizeTagInput).filter(Boolean)).join(','); }
function renderArticleTaxonomyOptions() {
  if (!postForm) return;
  const currentCategory = normalizeCategoryInput(postForm.category?.value || '');
  const currentTags = currentPostTags();
  const catWrap = $('#postCategoryOptions');
  if (catWrap) {
    const categories = uniqueItems((taxonomyState.categories || []).map(normalizeCategoryInput).filter(Boolean));
    catWrap.innerHTML = categories.length
      ? categories.map(cat => `<button type="button" class="taxonomy-option-btn ${cat === currentCategory ? 'active' : ''}" data-pick-post-category="${escapeHtml(cat)}">@${escapeHtml(cat)}</button>`).join('')
      : '<span class="taxonomy-option-empty">暂无分类选项；可在站点设置新增，也可输入 @分类 回车。</span>';
    $$('[data-pick-post-category]', catWrap).forEach(btn => btn.addEventListener('click', () => {
      postForm.category.value = btn.dataset.pickPostCategory || '';
      ensureTaxonomy(postForm.category.value, []);
      updateArticleTaxonomyUI();
      renderPostPreview();
      markDirty();
    }));
  }
  const tagWrap = $('#postTagOptions');
  if (tagWrap) {
    const tags = uniqueItems((taxonomyState.tags || []).map(normalizeTagInput).filter(Boolean));
    tagWrap.innerHTML = tags.length
      ? tags.map(tag => `<button type="button" class="taxonomy-option-btn ${currentTags.includes(tag) ? 'active' : ''}" data-pick-post-tag="${escapeHtml(tag)}">${escapeHtml(tagLabel(tag))}</button>`).join('')
      : '<span class="taxonomy-option-empty">暂无标签选项；可在站点设置新增，也可输入 #标签 回车。</span>';
    $$('[data-pick-post-tag]', tagWrap).forEach(btn => btn.addEventListener('click', () => {
      const tag = normalizeTagInput(btn.dataset.pickPostTag || '');
      if (!tag) return;
      const next = currentPostTags();
      setCurrentPostTags(next.includes(tag) ? next.filter(t => t !== tag) : [...next, tag]);
      ensureTaxonomy('', [tag]);
      updateArticleTaxonomyUI();
      renderPostPreview();
      markDirty();
    }));
  }
}
function updateArticleTaxonomyUI() {
  if (!postForm) return;
  const cat = normalizeCategoryInput(postForm.category.value);
  if (postForm.category.value !== cat) postForm.category.value = cat;
  const catBox = $('#postCategoryChip');
  if (catBox) catBox.innerHTML = cat ? `<span class="taxonomy-token">@${escapeHtml(cat)} <button type="button" data-clear-post-category>×</button></span>` : '未选择分类';
  const tags = currentPostTags();
  const tagBox = $('#postTagChips');
  if (tagBox) tagBox.innerHTML = tags.length ? tags.map(t => `<span class="taxonomy-token">${escapeHtml(tagLabel(t))} <button type="button" data-remove-post-tag="${escapeHtml(t)}">×</button></span>`).join('') : '未添加标签';
  $('#postCategoryChip')?.querySelector('[data-clear-post-category]')?.addEventListener('click', () => { postForm.category.value = ''; updateArticleTaxonomyUI(); renderPostPreview(); markDirty(); });
  $$('[data-remove-post-tag]', tagBox || document).forEach(btn => btn.addEventListener('click', () => { setCurrentPostTags(currentPostTags().filter(t => t !== btn.dataset.removePostTag)); updateArticleTaxonomyUI(); renderPostPreview(); markDirty(); }));
  renderArticleTaxonomyOptions();
}
function renderTaxonomyEditors() { syncTaxonomyInputs(); const catWrap = $('#categoryEditorList'); if (catWrap) catWrap.innerHTML = taxonomyState.categories.length ? taxonomyState.categories.map((name, index) => `<div class="taxonomy-editor-row card-lite"><input data-tax-edit="category" data-tax-index="${index}" value="${escapeHtml(name)}"><div class="row-actions"><button type="button" data-tax-up="category" data-tax-index="${index}" ${index === 0 ? 'disabled' : ''}>上移</button><button type="button" data-tax-down="category" data-tax-index="${index}" ${index === taxonomyState.categories.length - 1 ? 'disabled' : ''}>下移</button><button type="button" class="danger" data-tax-delete="category" data-tax-index="${index}">删除</button></div></div>`).join('') : '<p class="muted">暂无分类。</p>'; const tagWrap = $('#tagEditorList'); if (tagWrap) tagWrap.innerHTML = taxonomyState.tags.length ? taxonomyState.tags.map((name, index) => `<div class="taxonomy-editor-row card-lite"><input data-tax-edit="tag" data-tax-index="${index}" value="${escapeHtml(name)}"><div class="row-actions"><button type="button" data-tax-up="tag" data-tax-index="${index}" ${index === 0 ? 'disabled' : ''}>上移</button><button type="button" data-tax-down="tag" data-tax-index="${index}" ${index === taxonomyState.tags.length - 1 ? 'disabled' : ''}>下移</button><button type="button" class="danger" data-tax-delete="tag" data-tax-index="${index}">删除</button></div></div>`).join('') : '<p class="muted">暂无标签。</p>'; $$('[data-tax-edit]').forEach(input => input.addEventListener('change', () => { const key = input.dataset.taxEdit === 'category' ? 'categories' : 'tags'; const norm = input.dataset.taxEdit === 'category' ? normalizeCategoryInput(input.value) : normalizeTagInput(input.value); taxonomyState[key][Number(input.dataset.taxIndex)] = norm; taxonomyState[key] = uniqueItems(taxonomyState[key].filter(Boolean)); syncTaxonomyInputs(); renderTaxonomyEditors(); settingsHomePreviewFast(); markDirty(); })); $$('[data-tax-delete]').forEach(btn => btn.addEventListener('click', () => { const key = btn.dataset.taxDelete === 'category' ? 'categories' : 'tags'; taxonomyState[key].splice(Number(btn.dataset.taxIndex), 1); renderTaxonomyEditors(); settingsHomePreviewFast(); markDirty(); })); $$('[data-tax-up]').forEach(btn => btn.addEventListener('click', () => { const key = btn.dataset.taxUp === 'category' ? 'categories' : 'tags'; const i = Number(btn.dataset.taxIndex); if (i > 0) [taxonomyState[key][i - 1], taxonomyState[key][i]] = [taxonomyState[key][i], taxonomyState[key][i - 1]]; renderTaxonomyEditors(); settingsHomePreviewFast(); markDirty(); })); $$('[data-tax-down]').forEach(btn => btn.addEventListener('click', () => { const key = btn.dataset.taxDown === 'category' ? 'categories' : 'tags'; const i = Number(btn.dataset.taxIndex); if (i < taxonomyState[key].length - 1) [taxonomyState[key][i + 1], taxonomyState[key][i]] = [taxonomyState[key][i], taxonomyState[key][i + 1]]; renderTaxonomyEditors(); settingsHomePreviewFast(); markDirty(); })); renderArticleTaxonomyOptions(); }
function addCategoryFromInput(value) { const cat = normalizeCategoryInput(value); if (!cat) return; if (!taxonomyState.categories.includes(cat)) taxonomyState.categories.push(cat); renderTaxonomyEditors(); settingsHomePreviewFast(); markDirty(); showIsland(`已新增分类 @${cat}`); }
function addTagFromInput(value) { const tag = normalizeTagInput(value); if (!tag) return; if (!taxonomyState.tags.includes(tag)) taxonomyState.tags.push(tag); renderTaxonomyEditors(); settingsHomePreviewFast(); markDirty(); showIsland(`已新增标签 ${tag}`); }
function bindTaxonomyUI() { $$('[data-tax-tab]').forEach(btn => btn.addEventListener('click', () => { $$('[data-tax-tab]').forEach(b => b.classList.toggle('active', b === btn)); $$('[data-tax-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.taxPanel === btn.dataset.taxTab)); })); $('#addCategoryBtn')?.addEventListener('click', () => { addCategoryFromInput($('#newCategoryInput')?.value); if ($('#newCategoryInput')) $('#newCategoryInput').value = ''; }); $('#addTagBtn')?.addEventListener('click', () => { addTagFromInput($('#newTagInput')?.value); if ($('#newTagInput')) $('#newTagInput').value = ''; }); $('#newCategoryInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#addCategoryBtn')?.click(); } }); $('#newTagInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#addTagBtn')?.click(); } }); $('#postCategoryCommand')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const cat = normalizeCategoryInput(e.target.value); if (!cat) return; postForm.category.value = cat; ensureTaxonomy(cat, []); e.target.value = ''; updateArticleTaxonomyUI(); renderPostPreview(); showIsland(`文章分类已设为 @${cat}`); } }); $('#postTagCommand')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const tag = normalizeTagInput(e.target.value); if (!tag) return; setCurrentPostTags([...currentPostTags(), tag]); ensureTaxonomy('', [tag]); e.target.value = ''; updateArticleTaxonomyUI(); renderPostPreview(); showIsland(`已加入标签 ${tag}`); } }); }


const LIST_CONFIG = {
  header_nav_links: { wrap: 'headerNavEditor', label: '页眉导航', picker: true, fallback: defaultHeaderNav, fields: [['title', '标题', 'input'], ['link', '链接', 'input']] },
  nav_links: { wrap: 'navLinkEditor', label: '快捷导航', picker: true, fallback: defaultNavLinks, fields: [['icon', '图标', 'input'], ['title', '标题', 'input'], ['link', '链接', 'input'], ['desc', '说明', 'textarea']] },
  project_cards: { wrap: 'projectCardEditor', label: '项目', fallback: defaultProjects, fields: [['title', '标题', 'input'], ['link', '链接', 'input'], ['image', '图片 URL', 'input'], ['tags', '标签，用逗号分隔', 'input'], ['desc', '说明', 'textarea']] },
  friend_links: { wrap: 'friendLinkEditor', label: '友链', fallback: defaultFriends, fields: [['name', '名称', 'input'], ['link', '链接', 'input'], ['avatar', '头像 URL', 'input'], ['desc', '说明', 'textarea']] },
  music_playlist: { wrap: 'musicEditor', label: '音乐', fallback: defaultMusic, fields: [['title', '歌名', 'input'], ['artist', '作者/来源', 'input'], ['url', '音频 URL', 'input'], ['cover', '封面 URL，可不填', 'input']] }
};

function contentOptions(selected = '') {
  const opts = [
    { value: '', label: '选择文章/页面后自动填链接' },
    { value: '/', label: '首页 /' },
    { value: '/archive', label: '归档 /archive' }
  ];
  pages.filter(p => p.status === 'published').forEach(p => opts.push({ value: cleanPath(p.slug), label: `页面：${p.title} (${cleanPath(p.slug)})` }));
  posts.filter(p => p.status === 'published').forEach(p => opts.push({ value: cleanPath(p.slug), label: `文章：${p.title} (${cleanPath(p.slug)})` }));
  return opts.map(o => `<option value="${escapeHtml(o.value)}" ${o.value === selected ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('');
}
function syncListInput(name) { const input = settingsForm?.elements?.[name]; if (!input) return; const config = LIST_CONFIG[name]; input.value = JSON.stringify((listState[name] || []).map(item => { const clean = {}; for (const [field] of config.fields) clean[field] = String(item[field] || '').trim(); return clean; })); }
function renderListEditor(name) {
  const config = LIST_CONFIG[name]; const wrap = document.getElementById(config.wrap); if (!wrap) return; syncListInput(name); const items = listState[name] || [];
  wrap.innerHTML = items.map((item, index) => `<div class="home-card-editor-row card-lite"><div class="card-row-head"><b>${config.label} ${index + 1}</b><div class="row-actions"><button type="button" data-list-up="${name}" data-index="${index}" ${index === 0 ? 'disabled' : ''}>上移</button><button type="button" data-list-down="${name}" data-index="${index}" ${index === items.length - 1 ? 'disabled' : ''}>下移</button><button type="button" class="danger" data-list-delete="${name}" data-index="${index}">删除</button></div></div>${config.picker ? `<label class="wide-field">从已有文章 / 页面选择<select data-link-picker="${name}" data-list-index="${index}">${contentOptions(item.link || '')}</select></label>` : ''}<div class="card-row-fields">${config.fields.map(([field, label, type]) => type === 'textarea' ? `<label>${label}<textarea rows="2" data-list-name="${name}" data-list-index="${index}" data-list-field="${field}">${escapeHtml(item[field] || '')}</textarea></label>` : `<label>${label}<input data-list-name="${name}" data-list-index="${index}" data-list-field="${field}" value="${escapeHtml(item[field] || '')}" /></label>`).join('')}</div></div>`).join('');
  $$(`[data-list-name="${name}"]`, wrap).forEach(input => input.addEventListener('input', () => { listState[name][Number(input.dataset.listIndex)][input.dataset.listField] = input.value; syncListInput(name); }));
  $$(`[data-link-picker="${name}"]`, wrap).forEach(sel => sel.addEventListener('change', () => { const idx = Number(sel.dataset.listIndex); if (!sel.value) return; listState[name][idx].link = sel.value; renderListEditor(name); showIsland('已填入链接'); }));
  $$(`[data-list-delete="${name}"]`, wrap).forEach(btn => btn.addEventListener('click', () => { listState[name].splice(Number(btn.dataset.index), 1); renderListEditor(name); }));
  $$(`[data-list-up="${name}"]`, wrap).forEach(btn => btn.addEventListener('click', () => { const i = Number(btn.dataset.index); if (i > 0) [listState[name][i - 1], listState[name][i]] = [listState[name][i], listState[name][i - 1]]; renderListEditor(name); }));
  $$(`[data-list-down="${name}"]`, wrap).forEach(btn => btn.addEventListener('click', () => { const i = Number(btn.dataset.index); if (i < listState[name].length - 1) [listState[name][i + 1], listState[name][i]] = [listState[name][i], listState[name][i + 1]]; renderListEditor(name); }));
}
function addListItem(name) { const config = LIST_CONFIG[name]; listState[name].push({ ...(config.fallback()[0] || {}) }); renderListEditor(name); showIsland(`已新增${config.label}`); }

function parseHomeCards(value) { try { const arr = JSON.parse(value || '[]'); return Array.isArray(arr) && arr.length ? arr : defaultHomeCards(); } catch { return defaultHomeCards(); } }
function syncHomeCardsInput() { if (!settingsForm?.elements?.home_cards) return; settingsForm.elements.home_cards.value = JSON.stringify(homeCards.map(card => ({ label: String(card.label || '').trim(), title: String(card.title || '').trim(), text: String(card.text || '').trim(), icon: String(card.icon || '').trim(), link: String(card.link || '').trim() }))); }
function renderHomeCardEditor() {
  const wrap = $('#homeCardEditor'); if (!wrap) return; syncHomeCardsInput();
  wrap.innerHTML = homeCards.map((card, index) => `<div class="home-card-editor-row card-lite"><div class="card-row-head"><b>卡片 ${index + 1}</b><div class="row-actions"><button type="button" data-card-up="${index}" ${index === 0 ? 'disabled' : ''}>上移</button><button type="button" data-card-down="${index}" ${index === homeCards.length - 1 ? 'disabled' : ''}>下移</button><button type="button" class="danger" data-card-delete="${index}">删除</button></div></div><label class="wide-field">从已有文章 / 页面选择链接<select data-card-link-picker="${index}">${contentOptions(card.link || '')}</select></label><div class="card-row-fields"><label>小标签<input data-card-field="label" data-card-index="${index}" value="${escapeHtml(card.label || '')}"></label><label>标题<input data-card-field="title" data-card-index="${index}" value="${escapeHtml(card.title || '')}"></label><label>图标<input data-card-field="icon" data-card-index="${index}" value="${escapeHtml(card.icon || '')}"></label><label>链接<input data-card-field="link" data-card-index="${index}" value="${escapeHtml(card.link || '')}"></label><label class="wide-field">说明<textarea rows="2" data-card-field="text" data-card-index="${index}">${escapeHtml(card.text || '')}</textarea></label></div></div>`).join('');
  $$('[data-card-field]', wrap).forEach(input => input.addEventListener('input', () => { homeCards[Number(input.dataset.cardIndex)][input.dataset.cardField] = input.value; syncHomeCardsInput(); }));
  $$('[data-card-link-picker]', wrap).forEach(sel => sel.addEventListener('change', () => { if (!sel.value) return; homeCards[Number(sel.dataset.cardLinkPicker)].link = sel.value; renderHomeCardEditor(); showIsland('已填入卡片链接'); }));
  $$('[data-card-delete]', wrap).forEach(btn => btn.addEventListener('click', () => { homeCards.splice(Number(btn.dataset.cardDelete), 1); if (!homeCards.length) homeCards = defaultHomeCards(); renderHomeCardEditor(); }));
  $$('[data-card-up]', wrap).forEach(btn => btn.addEventListener('click', () => { const i = Number(btn.dataset.cardUp); if (i > 0) [homeCards[i - 1], homeCards[i]] = [homeCards[i], homeCards[i - 1]]; renderHomeCardEditor(); }));
  $$('[data-card-down]', wrap).forEach(btn => btn.addEventListener('click', () => { const i = Number(btn.dataset.cardDown); if (i < homeCards.length - 1) [homeCards[i + 1], homeCards[i]] = [homeCards[i], homeCards[i + 1]]; renderHomeCardEditor(); }));
}
function addHomeCard() { homeCards.push({ label: '新卡片', title: '标题', text: '这里填写卡片说明。', icon: '✨', link: '' }); renderHomeCardEditor(); }



// 模块化内容编辑器：文章和页面共用，最终会同步为 Markdown 保存，前台仍按原方式渲染。
const blockEditors = {
  post: { list: '#postBlockList', form: () => postForm, activeIndex: 0, blocks: [] },
  page: { list: '#pageBlockList', form: () => pageForm, activeIndex: 0, blocks: [] }
};
function newBlock(type = 'text', data = {}) {
  const id = `blk-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  if (type === 'image') return { id, type, src: data.src || '', alt: data.alt || '图片', caption: data.caption || '' };
  if (type === 'video') return { id, type, src: data.src || '', title: data.title || '外部视频', ratio: data.ratio || '16:9', className: data.className || '' };
  if (type === 'quote') return { id, type, text: data.text || '这里写引用内容', author: data.author || '' };
  if (type === 'callout') return { id, type, title: data.title || '提示', text: data.text || '这里写提示内容', tone: data.tone || 'tip' };
  if (type === 'button') return { id, type, text: data.text || '查看详情', url: data.url || '#', style: data.style || 'primary' };
  if (type === 'divider') return { id, type };
  if (type === 'gallery') return { id, type, images: data.images || '', caption: data.caption || '' };
  return { id, type: 'text', text: data.text || '' };
}
function ensureBlocks(kind) {
  const editor = blockEditors[kind];
  if (!editor.blocks.length) editor.blocks = [newBlock('text', { text: '' })];
}
function blockToMarkdown(block) {
  if (!block) return '';
  if (block.type === 'image') {
    const src = String(block.src || '').trim();
    if (!src) return '';
    const alt = String(block.alt || '图片').replace(/[\[\]]/g, '');
    const cap = String(block.caption || '').trim();
    return `![${alt}](${src})${cap ? `\n\n*${cap}*` : ''}`;
  }
  if (block.type === 'video') {
    const src = String(block.src || '').trim();
    if (!src) return '';
    const title = String(block.title || '外部视频').replace(/"/g, '&quot;');
    const ratio = String(block.ratio || '16:9').replace(/"/g, '');
    const cls = String(block.className || '').trim().replace(/[^a-zA-Z0-9_\- ]/g, '');
    return `[video src="${src}" title="${title}" ratio="${ratio}"${cls ? ` class="${cls}"` : ''}]`;
  }
  if (block.type === 'quote') return `[quote text="${quoteAttr(block.text || '')}"${block.author ? ` author="${quoteAttr(block.author)}"` : ''}]`;
  if (block.type === 'callout') return `[callout title="${quoteAttr(block.title || '提示')}" text="${quoteAttr(block.text || '')}" tone="${quoteAttr(block.tone || 'tip')}"]`;
  if (block.type === 'button') return `[button text="${quoteAttr(block.text || '查看详情')}" url="${quoteAttr(block.url || '#')}" style="${quoteAttr(block.style || 'primary')}"]`;
  if (block.type === 'divider') return '[divider]';
  if (block.type === 'gallery') { const images = String(block.images || '').split(/[\n,，]/).map(v => v.trim()).filter(Boolean).join('|'); return images ? `[gallery images="${quoteAttr(images)}"${block.caption ? ` caption="${quoteAttr(block.caption)}"` : ''}]` : ''; }
  return String(block.text || '').trim();
}
function blocksToMarkdown(kind) {
  ensureBlocks(kind);
  return blockEditors[kind].blocks.map(blockToMarkdown).filter(Boolean).join('\n\n');
}
function syncBlocksToContent(kind) {
  const form = blockEditors[kind].form();
  if (form?.content) form.content.value = blocksToMarkdown(kind);
}
function parseMarkdownToBlocks(md = '') {
  const text = String(md || '').trim();
  if (!text) return [newBlock('text', { text: '' })];
  const parts = text.split(/\n{2,}/);
  const blocks = [];
  let textBuffer = [];
  const flushText = () => {
    const t = textBuffer.join('\n\n').trim();
    if (t) blocks.push(newBlock('text', { text: t }));
    textBuffer = [];
  };
  for (const partRaw of parts) {
    const part = partRaw.trim();
    const img = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    const vid = part.match(/^\[(?:video|iframe)\s+([^\]]+)\]$/i);
    const vid2 = part.match(/^::video\s+(.+)$/i);
    if (img) { flushText(); blocks.push(newBlock('image', { alt: img[1] || '图片', src: img[2] || '' })); continue; }
    if (vid || vid2) {
      flushText();
      const attrs = vid ? parseEmbedAttrs(vid[1]) : parseEmbedAttrs(vid2[1]);
      let src = attrs.src || attrs.url || '';
      if (!src && vid2) src = String(vid2[1]).split(/\s+/)[0];
      blocks.push(newBlock('video', { src, title: attrs.title || '外部视频', ratio: attrs.ratio || '16:9', className: attrs.class || attrs.className || '' }));
      continue;
    }
    const mod = part.match(/^\[(callout|quote|button|divider|gallery)\s*([^\]]*)\]$/i);
    if (mod) {
      flushText();
      const type = mod[1].toLowerCase();
      const attrs = parseEmbedAttrs(mod[2] || '');
      if (type === 'quote') blocks.push(newBlock('quote', { text: attrs.text || '', author: attrs.author || '' }));
      else if (type === 'callout') blocks.push(newBlock('callout', { title: attrs.title || '提示', text: attrs.text || '', tone: attrs.tone || attrs.type || 'tip' }));
      else if (type === 'button') blocks.push(newBlock('button', { text: attrs.text || '查看详情', url: attrs.url || '#', style: attrs.style || 'primary' }));
      else if (type === 'divider') blocks.push(newBlock('divider'));
      else if (type === 'gallery') blocks.push(newBlock('gallery', { images: String(attrs.images || '').split('|').join('\n'), caption: attrs.caption || '' }));
      continue;
    }
    textBuffer.push(part);
  }
  flushText();
  return blocks.length ? blocks : [newBlock('text', { text })];
}
function setBlocksFromMarkdown(kind, markdown = '') {
  blockEditors[kind].blocks = parseMarkdownToBlocks(markdown);
  blockEditors[kind].activeIndex = 0;
  renderBlockEditor(kind);
  syncBlocksToContent(kind);
}
const debouncedBlockPreview = {
  post: debounce(() => renderPostPreview(), 120),
  page: debounce(() => renderPagePreview(), 120)
};

function blockEditorChanged(kind, options = {}) {
  syncBlocksToContent(kind);
  markDirty();
  if (options.immediate) {
    kind === 'post' ? renderPostPreview() : renderPagePreview();
  } else {
    debouncedBlockPreview[kind]?.();
  }
}

function cloneBlock(block = {}) {
  const copied = JSON.parse(JSON.stringify(block));
  copied.id = `blk-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  copied.justAdded = true;
  return copied;
}

function safeBlockIndex(index, max) {
  const value = Number(index);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max - 1, value));
}

function bindBlockEditorEvents(kind, wrap) {
  if (!wrap || wrap.dataset.bound === '1') return;
  wrap.dataset.bound = '1';

  wrap.addEventListener('click', async e => {
    const editor = blockEditors[kind];
    const btn = e.target.closest('button');
    const item = e.target.closest('[data-block-select]');

    if (btn) {
      e.stopPropagation();
      const i = safeBlockIndex(btn.dataset.blockIndex, editor.blocks.length);

      if (btn.matches('[data-block-delete]')) {
        editor.blocks.splice(i, 1);
        if (!editor.blocks.length) editor.blocks.push(newBlock('text'));
        editor.activeIndex = Math.max(0, Math.min(editor.activeIndex, editor.blocks.length - 1));
        renderBlockEditor(kind);
        blockEditorChanged(kind, { immediate: true });
        showIsland('模块已删除');
        return;
      }

      if (btn.matches('[data-block-duplicate]')) {
        editor.blocks.splice(i + 1, 0, cloneBlock(editor.blocks[i]));
        editor.activeIndex = i + 1;
        renderBlockEditor(kind);
        blockEditorChanged(kind, { immediate: true });
        showIsland('模块已复制');
        return;
      }

      if (btn.matches('[data-block-collapse]')) {
        editor.blocks[i].collapsed = !editor.blocks[i].collapsed;
        editor.activeIndex = i;
        renderBlockEditor(kind);
        return;
      }

      if (btn.matches('[data-block-up]') && i > 0) {
        [editor.blocks[i - 1], editor.blocks[i]] = [editor.blocks[i], editor.blocks[i - 1]];
        editor.activeIndex = i - 1;
        renderBlockEditor(kind);
        blockEditorChanged(kind, { immediate: true });
        return;
      }

      if (btn.matches('[data-block-down]') && i < editor.blocks.length - 1) {
        [editor.blocks[i + 1], editor.blocks[i]] = [editor.blocks[i], editor.blocks[i + 1]];
        editor.activeIndex = i + 1;
        renderBlockEditor(kind);
        blockEditorChanged(kind, { immediate: true });
        return;
      }

      if (btn.matches('[data-block-upload]')) {
        const fileInput = wrap.querySelector(`[data-block-file="${i}"]`);
        const msg = wrap.querySelector(`[data-block-msg="${i}"]`);
        try {
          const url = await uploadImage(fileInput, msg, kind === 'post' ? 'posts' : 'pages');
          editor.blocks[i].src = url;
          renderBlockEditor(kind);
          blockEditorChanged(kind, { immediate: true });
        } catch (err) {
          if (msg) msg.textContent = err.message;
        }
        return;
      }

      if (btn.matches('[data-gallery-upload]')) {
        const fileInput = wrap.querySelector(`[data-gallery-file="${i}"]`);
        const msg = wrap.querySelector(`[data-gallery-msg="${i}"]`);
        try {
          const url = await uploadImage(fileInput, msg, kind === 'post' ? 'posts' : 'pages');
          const old = String(editor.blocks[i].images || '').trim();
          editor.blocks[i].images = old ? `${old}\n${url}` : url;
          renderBlockEditor(kind);
          blockEditorChanged(kind, { immediate: true });
        } catch (err) {
          if (msg) msg.textContent = err.message;
        }
        return;
      }
    }

    if (item && !e.target.closest('input, textarea, select, button')) {
      editor.activeIndex = Number(item.dataset.blockIndex);
      renderBlockEditor(kind);
    }
  });

  const onFieldChange = e => {
    const input = e.target.closest('[data-block-field]');
    if (!input) return;
    const editor = blockEditors[kind];
    const i = safeBlockIndex(input.dataset.blockIndex, editor.blocks.length);
    const field = input.dataset.blockField;
    if (!field || !editor.blocks[i]) return;
    editor.blocks[i][field] = input.value;
    editor.activeIndex = i;
    blockEditorChanged(kind);
  };
  wrap.addEventListener('input', onFieldChange);
  wrap.addEventListener('change', onFieldChange);
}

function renderBlockEditor(kind) {
  const editor = blockEditors[kind];
  ensureBlocks(kind);
  const wrap = $(editor.list);
  if (!wrap) return;
  wrap.innerHTML = editor.blocks.map((block, index) => renderBlockItem(kind, block, index)).join('');
  bindBlockEditorEvents(kind, wrap);
}

function renderBlockItem(kind, block, index) {
  const active = blockEditors[kind].activeIndex === index ? ' active' : '';
  const added = block.justAdded ? ' module-added' : '';
  const collapsed = block.collapsed ? ' collapsed' : '';
  const moduleNameMap = { image: '图片模块', video: '第三方视频模块', quote: '引用模块', callout: '提示卡片模块', button: '按钮链接模块', divider: '分割线模块', gallery: '图片画廊模块', text: '文字模块' };
  const badgeMap = { image: '图片', video: '视频', quote: '引用', callout: '提示', button: '按钮', divider: '分割', gallery: '画廊', text: '文字' };
  const title = moduleNameMap[block.type] || '文字模块';
  const badge = badgeMap[block.type] || '文字';
  const last = blockEditors[kind].blocks.length - 1;
  let fields = '';

  if (block.type === 'image') {
    fields = `<div class="block-fields"><label class="wide-field">图片链接 URL<input data-block-field="src" data-block-index="${index}" value="${escapeHtml(block.src || '')}" placeholder="https://..."></label><label>图片说明 Alt<input data-block-field="alt" data-block-index="${index}" value="${escapeHtml(block.alt || '')}" placeholder="图片说明"></label><label class="wide-field">图片标题 / 注释<textarea rows="2" data-block-field="caption" data-block-index="${index}" placeholder="可不填">${escapeHtml(block.caption || '')}</textarea></label></div><div class="module-inline-upload"><input data-block-file="${index}" type="file" accept="image/*"><button class="ghost" type="button" data-block-upload data-block-index="${index}">本地上传到此图片模块</button><p class="message" data-block-msg="${index}"></p></div>`;
  } else if (block.type === 'video') {
    fields = `<div class="block-fields"><label class="wide-field">第三方视频 iframe 链接<input data-block-field="src" data-block-index="${index}" value="${escapeHtml(block.src || '')}" placeholder="https://player.bilibili.com/player.html?bvid=BVxxxx"></label><label>视频标题<input data-block-field="title" data-block-index="${index}" value="${escapeHtml(block.title || '')}" placeholder="视频标题"></label><label>比例<select data-block-field="ratio" data-block-index="${index}"><option value="16:9" ${block.ratio === '16:9' ? 'selected' : ''}>16:9</option><option value="4:3" ${block.ratio === '4:3' ? 'selected' : ''}>4:3</option><option value="9:16" ${block.ratio === '9:16' ? 'selected' : ''}>9:16 竖屏</option><option value="1:1" ${block.ratio === '1:1' ? 'selected' : ''}>1:1</option></select></label><label>CSS 类名<input data-block-field="className" data-block-index="${index}" value="${escapeHtml(block.className || '')}" placeholder="例如 douyin-video"></label></div>`;
  } else if (block.type === 'quote') {
    fields = `<div class="block-fields"><label class="wide-field">引用内容<textarea rows="4" data-block-field="text" data-block-index="${index}">${escapeHtml(block.text || '')}</textarea></label><label>作者 / 来源<input data-block-field="author" data-block-index="${index}" value="${escapeHtml(block.author || '')}" placeholder="可不填"></label></div>`;
  } else if (block.type === 'callout') {
    fields = `<div class="block-fields"><label>标题<input data-block-field="title" data-block-index="${index}" value="${escapeHtml(block.title || '')}" placeholder="提示"></label><label>类型<select data-block-field="tone" data-block-index="${index}"><option value="tip" ${block.tone === 'tip' ? 'selected' : ''}>提示</option><option value="info" ${block.tone === 'info' ? 'selected' : ''}>信息</option><option value="warn" ${block.tone === 'warn' ? 'selected' : ''}>警告</option><option value="success" ${block.tone === 'success' ? 'selected' : ''}>成功</option></select></label><label class="wide-field">内容<textarea rows="3" data-block-field="text" data-block-index="${index}">${escapeHtml(block.text || '')}</textarea></label></div>`;
  } else if (block.type === 'button') {
    fields = `<div class="block-fields"><label>按钮文字<input data-block-field="text" data-block-index="${index}" value="${escapeHtml(block.text || '')}" placeholder="查看详情"></label><label class="wide-field">链接<input data-block-field="url" data-block-index="${index}" value="${escapeHtml(block.url || '')}" placeholder="/about 或 https://..."></label><label>样式<select data-block-field="style" data-block-index="${index}"><option value="primary" ${block.style === 'primary' ? 'selected' : ''}>主按钮</option><option value="ghost" ${block.style === 'ghost' ? 'selected' : ''}>透明按钮</option></select></label></div>`;
  } else if (block.type === 'divider') {
    fields = `<p class="muted">分割线模块不需要填写内容，右侧预览会显示一条柔和分割线。</p>`;
  } else if (block.type === 'gallery') {
    fields = `<div class="block-fields"><label class="wide-field">图片地址列表<textarea rows="5" data-block-field="images" data-block-index="${index}" placeholder="一行一张图片 URL">${escapeHtml(block.images || '')}</textarea></label><label class="wide-field">画廊说明<input data-block-field="caption" data-block-index="${index}" value="${escapeHtml(block.caption || '')}" placeholder="可不填"></label></div><div class="module-inline-upload"><input data-gallery-file="${index}" type="file" accept="image/*"><button class="ghost" type="button" data-gallery-upload data-block-index="${index}">本地上传并加入画廊</button><p class="message" data-gallery-msg="${index}"></p></div>`;
  } else {
    fields = `<label class="block-textarea-label">正文内容<textarea rows="8" data-block-field="text" data-block-index="${index}" placeholder="这里写一段文字，支持 Markdown：# 标题、**加粗**、列表、引用等。">${escapeHtml(block.text || '')}</textarea></label>`;
  }

  return `<article class="block-item${active}${added}${collapsed}" data-block-select data-block-index="${index}">
    <div class="block-item-head">
      <div><span class="block-badge">${badge}</span><b>${index + 1}. ${title}</b></div>
      <div class="row-actions block-actions">
        <button type="button" data-block-collapse data-block-index="${index}">${block.collapsed ? '展开' : '折叠'}</button>
        <button type="button" data-block-duplicate data-block-index="${index}">复制</button>
        <button type="button" data-block-up data-block-index="${index}" ${index === 0 ? 'disabled' : ''}>上移</button>
        <button type="button" data-block-down data-block-index="${index}" ${index === last ? 'disabled' : ''}>下移</button>
        <button type="button" class="danger" data-block-delete data-block-index="${index}">删除</button>
      </div>
    </div>
    <div class="block-item-body">${block.collapsed ? '<p class="muted block-collapsed-hint">模块已折叠，点击“展开”继续编辑。</p>' : fields}</div>
  </article>`;
}

function addBlock(kind, type, data = {}) {
  if (!blockEditors[kind]) kind = 'post';
  const editor = blockEditors[kind];
  const listEl = $(editor.list);
  if (!listEl) { showIsland('没有找到模块编辑区，请刷新后台页面'); return; }
  ensureBlocks(kind);
  const currentIndex = Number.isFinite(Number(editor.activeIndex)) ? Number(editor.activeIndex) : editor.blocks.length - 1;
  const insertAt = editor.blocks.length ? Math.min(editor.blocks.length, currentIndex + 1) : 0;
  const block = newBlock(type, data);
  block.justAdded = true;
  editor.blocks.splice(insertAt, 0, block);
  editor.activeIndex = insertAt;
  renderBlockEditor(kind);
  const insertedEl = document.querySelector(`${editor.list} [data-block-index="${insertAt}"]`);
  insertedEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  insertedEl?.querySelector('textarea,input,select')?.focus?.({ preventScroll: true });
  setTimeout(() => { if (editor.blocks[insertAt]) delete editor.blocks[insertAt].justAdded; }, 900);
  blockEditorChanged(kind, { immediate: true });
  showIsland(`${({ image: '图片', video: '视频', quote: '引用', callout: '提示卡', button: '按钮', divider: '分割线', gallery: '画廊', text: '文字' }[type] || '文字')}模块已插入`);
}

function initBlockEditors() {
  setBlocksFromMarkdown('post', postForm?.content?.value || '');
  setBlocksFromMarkdown('page', pageForm?.content?.value || '');
  bindBlockToolbarDelegation();
}

let blockToolbarDelegationBound = false;
function bindBlockToolbarDelegation() {
  if (blockToolbarDelegationBound) return;
  blockToolbarDelegationBound = true;
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-add-block]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const kind = btn.dataset.editor || btn.closest('[data-block-toolbar]')?.dataset.editor || 'post';
    const type = btn.dataset.addBlock || 'text';
    addBlock(kind, type);
  }, true);
}

function updateSummary() { const published = posts.filter(p => p.status === 'published').length; const postDrafts = posts.filter(p => p.status !== 'published').length; const pageDrafts = pages.filter(p => p.status !== 'published').length; $('#summaryPosts').textContent = String(posts.length); $('#summaryPublished').textContent = String(published); $('#summaryPages').textContent = String(pages.length); $('#summaryDrafts').textContent = String(postDrafts + pageDrafts); }
function updateSlugHints() { const pSlug = normalizeSlug(postForm?.slug?.value || postForm?.title?.value || ''); const pageSlug = normalizeSlug(pageForm?.slug?.value || pageForm?.title?.value || ''); if ($('#postSlugPreview')) $('#postSlugPreview').textContent = cleanPath(pSlug || '保存后自动生成'); if ($('#pageSlugPreview')) $('#pageSlugPreview').textContent = cleanPath(pageSlug || '保存后自动生成'); if ($('#postOpenLink')) $('#postOpenLink').href = cleanPath(pSlug || ''); if ($('#pageOpenLink')) $('#pageOpenLink').href = cleanPath(pageSlug || ''); }
function renderPostPreview() { syncBlocksToContent('post'); const el = $('#postFrontPreview'); if (!el || !postForm) return; const d = formDataToObject(postForm); updateSlugHints(); const tags = String(d.tags || '').split(/[，,]/).map(t => t.trim()).filter(Boolean).map(t => `<span class="tag">${escapeHtml(tagLabel(t))}</span>`).join(''); applyPreviewCustomStyles(); el.innerHTML = `<article class="card post-full preview-post">${d.cover ? `<img class="article-cover" src="${escapeHtml(d.cover)}" alt="${escapeHtml(d.title)}">` : '<div class="article-cover preview-cover-placeholder">文章封面预览</div>'}<header class="post-hero"><h1>${escapeHtml(d.title || '文章标题预览')}</h1><div class="article-meta" style="justify-content:center"><span>📅 ${fmtDate(new Date())}</span><span>📁 ${escapeHtml(d.category || '未分类')}</span><span>👁 0</span></div><p class="muted">${escapeHtml(d.excerpt || '这里会显示文章摘要。')}</p><div class="article-tags" style="justify-content:center">${tags}</div></header><div class="post-content">${d.content ? renderMarkdown(d.content) : '<p class="muted">开始输入正文后，这里会显示接近前台文章详情页的效果。</p>'}</div><div class="post-bottom"><section class="card license-box"><b>版权说明</b><p>本文由站点作者原创或整理发布，转载请注明来源。</p></section><section class="card comments"><h3>评论</h3><p class="muted">文章预览会显示评论区域；页面预览不会显示评论区域。</p></section></div></article>`; initTiltCards(el); }
function renderPagePreview() { syncBlocksToContent('page'); const el = $('#pageFrontPreview'); if (!el || !pageForm) return; const d = formDataToObject(pageForm); updateSlugHints(); applyPreviewCustomStyles(); el.innerHTML = `<article class="card page-full preview-page template-${escapeHtml(d.template || 'standard')}">${d.cover ? `<img class="article-cover" src="${escapeHtml(d.cover)}" alt="${escapeHtml(d.title)}">` : ''}<header class="page-hero"><small class="page-type-label">独立页面 · 不进入文章流</small><h1>${escapeHtml(d.title || '页面标题预览')}</h1><p class="muted">${escapeHtml(d.summary || '这里会显示页面摘要。')}</p></header><div class="post-content page-content-preview">${d.content ? renderMarkdown(d.content) : '<p class="muted">开始输入页面正文后，这里会显示接近前台独立页面的效果。</p>'}</div></article>`; initTiltCards(el); }

async function checkLogin() { const { user } = await api('/api/auth/me'); if (user) { showAdmin(); await loadPosts(); await loadPages(); await loadSettings(); await loadComments(false); showIsland('登录成功'); } else showLogin(); }
async function loadPosts() { const data = await api('/api/admin/posts'); posts = data.posts || []; renderPostTable(); updateSummary(); }
function renderPostTable() { $('#postTable').innerHTML = posts.length ? posts.map(p => `<div class="admin-post-row reveal-up in-view"><div><h3>${escapeHtml(p.title)}</h3><p class="muted">${escapeHtml(p.status)} · ${fmtDate(p.created_at)} · ${escapeHtml(p.category || '未分类')} · ${cleanPath(p.slug)}</p></div><div class="row-actions"><a class="small-btn" href="${cleanPath(p.slug)}" target="_blank">查看</a><button data-edit="${p.id}">编辑</button><button class="danger" data-delete="${p.id}">删除</button></div></div>`).join('') : '<p class="muted">暂无文章。</p>'; $$('[data-edit]').forEach(btn => btn.addEventListener('click', () => editPost(btn.dataset.edit))); $$('[data-delete]').forEach(btn => btn.addEventListener('click', () => removePost(btn.dataset.delete))); }
async function editPost(id) { const { post } = await api(`/api/admin/posts/${id}`); $('#editorTitle').textContent = `编辑文章：${post.title}`; postForm.id.value = post.id; postForm.title.value = post.title || ''; postForm.slug.value = post.slug || ''; postForm.category.value = post.category || ''; postForm.tags.value = Array.isArray(post.tags) ? post.tags.join(',') : (post.tags || ''); updateArticleTaxonomyUI(); postForm.cover.value = post.cover || ''; postForm.excerpt.value = post.excerpt || ''; postForm.content.value = post.content || ''; setBlocksFromMarkdown('post', post.content || ''); postForm.status.value = post.status || 'published'; renderPostPreview(); switchTab('posts'); postForm.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
async function removePost(id) { if (!confirm('确定删除这篇文章吗？')) return; await api(`/api/admin/posts/${id}`, { method: 'DELETE' }); $('#postMsg').textContent = '已删除。'; await loadPosts(); await loadSettings(); showIsland('文章已删除'); }
function resetPostForm() { postForm.reset(); postForm.id.value = ''; setCurrentPostTags([]); updateArticleTaxonomyUI(); setBlocksFromMarkdown('post', ''); $('#editorTitle').textContent = '新建文章'; $('#postMsg').textContent = ''; renderPostPreview(); }
async function savePost(e) { e.preventDefault(); syncBlocksToContent('post'); postForm.category.value = normalizeCategoryInput(postForm.category.value); setCurrentPostTags(currentPostTags()); ensureTaxonomy(postForm.category.value, currentPostTags()); const data = formDataToObject(postForm); const id = data.id; delete data.id; try { if (id) { await api(`/api/admin/posts/${id}`, { method: 'PUT', body: JSON.stringify(data) }); $('#postMsg').textContent = '文章已更新。'; } else { await api('/api/admin/posts', { method: 'POST', body: JSON.stringify(data) }); $('#postMsg').textContent = '文章已创建。'; resetPostForm(); } await loadPosts(); await loadSettings(); markSaved(); showIsland('文章已保存'); } catch (err) { $('#postMsg').textContent = err.message; } }

async function loadPages() { const data = await api('/api/admin/pages'); pages = data.pages || []; renderPageTable(); updateSummary(); }
function renderPageTable() { $('#pageTable').innerHTML = pages.length ? pages.map(p => `<div class="admin-post-row page-row reveal-up in-view"><div><h3>${escapeHtml(p.title)}</h3><p class="muted">${escapeHtml(p.status)} · ${fmtDate(p.created_at)} · 模板：${escapeHtml(p.template || 'standard')} · ${cleanPath(p.slug)}</p></div><div class="row-actions"><a class="small-btn" href="${cleanPath(p.slug)}" target="_blank">查看</a><button data-page-edit="${p.id}">编辑</button><button class="danger" data-page-delete="${p.id}">删除</button></div></div>`).join('') : '<p class="muted">暂无页面。</p>'; $$('[data-page-edit]').forEach(btn => btn.addEventListener('click', () => editPage(btn.dataset.pageEdit))); $$('[data-page-delete]').forEach(btn => btn.addEventListener('click', () => removePage(btn.dataset.pageDelete))); }
async function editPage(id) { const { page } = await api(`/api/admin/pages/${id}`); $('#pageEditorTitle').textContent = `编辑页面：${page.title}`; pageForm.id.value = page.id; pageForm.title.value = page.title || ''; pageForm.slug.value = page.slug || ''; pageForm.sort_order.value = page.sort_order || 0; pageForm.summary.value = page.summary || ''; pageForm.cover.value = page.cover || ''; pageForm.content.value = page.content || ''; setBlocksFromMarkdown('page', page.content || ''); pageForm.template.value = page.template || 'standard'; pageForm.status.value = page.status || 'published'; renderPagePreview(); switchTab('pages'); pageForm.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
async function removePage(id) { if (!confirm('确定删除这个页面吗？')) return; await api(`/api/admin/pages/${id}`, { method: 'DELETE' }); $('#pageMsg').textContent = '页面已删除。'; await loadPages(); await loadSettings(); showIsland('页面已删除'); }

async function loadComments(showTip = true) {
  try {
    const data = await api('/api/admin/comments');
    comments = data.comments || [];
    renderCommentTable();
    if (showTip) showIsland('评论已刷新');
  } catch (err) {
    const msg = $('#commentAdminMsg');
    if (msg) msg.textContent = err.message;
  }
}
function renderCommentTable() {
  const wrap = $('#commentTable');
  const count = $('#commentCountText');
  if (!wrap) return;
  const keyword = String($('#commentSearchInput')?.value || '').trim().toLowerCase();
  const status = String($('#commentStatusFilter')?.value || '');
  const list = comments
    .filter(c => !status || (c.status || 'approved') === status)
    .filter(c => !keyword || `${c.name || ''} ${c.email || ''} ${c.content || ''} ${c.post_title || ''} ${c.ip || ''}`.toLowerCase().includes(keyword));
  if (count) count.textContent = `${list.length} / ${comments.length} 条评论`;
  wrap.innerHTML = list.length ? list.map(c => `
    <div class="admin-comment-row card-lite comment-status-${escapeHtml(c.status || 'approved')}">
      <div class="comment-row-main">
        <div class="comment-row-head">
          <b>${escapeHtml(c.name || '匿名')}</b>
          <small class="muted">${fmtDate(c.created_at)} · ${escapeHtml(c.email || '未留邮箱')} · ${escapeHtml(c.ip || '未知 IP')}</small>
        </div>
        <p><span class="status-pill">${escapeHtml(commentStatusLabel(c.status))}</span>${c.moderation_reason ? ` <small class="muted">${escapeHtml(c.moderation_reason)}</small>` : ''}</p>
        <p>${escapeHtml(c.content || '')}</p>
        <p class="muted">文章：${c.post_slug ? `<a href="${cleanPath(c.post_slug)}" target="_blank">${escapeHtml(c.post_title || c.post_slug)}</a>` : escapeHtml(c.post_title || '已删除文章')}</p>
      </div>
      <div class="row-actions">
        ${c.post_slug ? `<a class="small-btn" href="${cleanPath(c.post_slug)}" target="_blank">查看文章</a>` : ''}
        ${(c.status || 'approved') !== 'approved' ? `<button type="button" data-comment-status="${c.id}" data-status="approved">通过</button>` : ''}
        ${(c.status || 'approved') !== 'pending' ? `<button type="button" data-comment-status="${c.id}" data-status="pending">待审核</button>` : ''}
        ${(c.status || 'approved') !== 'spam' ? `<button class="danger" type="button" data-comment-status="${c.id}" data-status="spam">屏蔽</button>` : ''}
        <button class="danger" type="button" data-comment-delete="${c.id}">删除评论</button>
      </div>
    </div>`).join('') : '<p class="muted">暂无评论。</p>';
  $$('[data-comment-delete]', wrap).forEach(btn => btn.addEventListener('click', () => removeComment(btn.dataset.commentDelete)));
  $$('[data-comment-status]', wrap).forEach(btn => btn.addEventListener('click', () => changeCommentStatus(btn.dataset.commentStatus, btn.dataset.status)));
}
function commentStatusLabel(status = 'approved') {
  return status === 'pending' ? '待审核' : status === 'spam' ? '已屏蔽' : '已通过';
}
async function changeCommentStatus(id, status) {
  try {
    await api(`/api/admin/comments/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
    const comment = comments.find(c => String(c.id) === String(id));
    if (comment) comment.status = status;
    renderCommentTable();
    $('#commentAdminMsg').textContent = `评论已标记为：${commentStatusLabel(status)}。`;
    showIsland('评论状态已更新');
  } catch (err) {
    $('#commentAdminMsg').textContent = err.message;
  }
}
async function removeComment(id) {
  if (!confirm('确定删除这条评论吗？删除后不可恢复。')) return;
  try {
    await api(`/api/admin/comments/${id}`, { method: 'DELETE' });
    comments = comments.filter(c => String(c.id) !== String(id));
    renderCommentTable();
    $('#commentAdminMsg').textContent = '评论已删除。';
    showIsland('评论已删除');
  } catch (err) {
    $('#commentAdminMsg').textContent = err.message;
  }
}

async function loadSystemCheck() {
  const wrap = $('#systemCheckTable');
  const msg = $('#systemCheckMsg');
  if (!wrap) return;
  try {
    if (msg) msg.textContent = '正在检查...';
    const data = await api('/api/admin/system');
    const system = data.system || {};
    const rows = [
      ['Node 版本', system.node_version || '-'],
      ['运行环境', system.environment || '-'],
      ['数据库', system.database || '-'],
      ['图片存储', system.storage_provider || '-'],
      ['Supabase URL', system.supabase_url_configured ? '已配置' : '未配置'],
      ['Service Role Key', system.supabase_service_role_configured ? '已配置' : '未配置'],
      ['图片桶', system.supabase_bucket || '-'],
      ['上传上限', `${system.max_upload_mb || 5} MB`],
      ['后台入口', system.admin_path_configured || '-'],
      ['推荐运行时', system.package_runtime || '-']
    ];
    wrap.innerHTML = rows.map(([k, v]) => `<div class="system-check-item card-lite"><small>${escapeHtml(k)}</small><b>${escapeHtml(v)}</b></div>`).join('');
    if (msg) msg.textContent = '检查完成。';
  } catch (err) {
    wrap.innerHTML = '<p class="muted">系统检查加载失败。</p>';
    if (msg) msg.textContent = err.message;
  }
}

function resetPageForm() { pageForm.reset(); pageForm.id.value = ''; pageForm.sort_order.value = '0'; setBlocksFromMarkdown('page', ''); $('#pageEditorTitle').textContent = '新建页面'; $('#pageMsg').textContent = ''; renderPagePreview(); }
async function savePage(e) { e.preventDefault(); syncBlocksToContent('page'); const data = formDataToObject(pageForm); const id = data.id; delete data.id; try { if (id) { await api(`/api/admin/pages/${id}`, { method: 'PUT', body: JSON.stringify(data) }); $('#pageMsg').textContent = '页面已更新。'; } else { await api('/api/admin/pages', { method: 'POST', body: JSON.stringify(data) }); $('#pageMsg').textContent = '页面已创建。'; resetPageForm(); } await loadPages(); await loadSettings(); markSaved(); showIsland('页面已保存'); } catch (err) { $('#pageMsg').textContent = err.message; } }

async function uploadImage(fileInput, msgEl, folder = 'posts') { const file = fileInput?.files?.[0]; if (!file) throw new Error('请先选择一张图片'); const form = new FormData(); form.append('image', file); form.append('folder', folder); msgEl.textContent = '正在上传...'; const res = await fetch('/api/admin/upload', { method: 'POST', body: form }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || '上传失败'); msgEl.textContent = data.warning ? `上传成功：${data.warning}` : '上传成功。'; return data.url; }
function insertAtEnd(textarea, text, cb) { const before = textarea.value.trimEnd(); textarea.value = before ? `${before}\n\n${text}\n` : `${text}\n`; textarea.focus(); cb?.(); }
async function handleCoverUpload() { const msg = $('#coverUploadMsg'); try { postForm.cover.value = await uploadImage($('#coverUpload'), msg, 'covers'); renderPostPreview(); } catch (err) { msg.textContent = err.message; } }
async function handleContentUpload() { const msg = $('#contentUploadMsg'); try { const url = await uploadImage($('#contentUpload'), msg, 'posts'); addBlock('post', 'image', { src: url, alt: '文章图片' }); renderPostPreview(); } catch (err) { msg.textContent = err.message; } }
async function handlePageCoverUpload() { const msg = $('#pageCoverUploadMsg'); try { pageForm.cover.value = await uploadImage($('#pageCoverUpload'), msg, 'pages'); renderPagePreview(); } catch (err) { msg.textContent = err.message; } }
async function handlePageContentUpload() { const msg = $('#pageContentUploadMsg'); try { const url = await uploadImage($('#pageContentUpload'), msg, 'pages'); addBlock('page', 'image', { src: url, alt: '页面图片' }); renderPagePreview(); } catch (err) { msg.textContent = err.message; } }
async function handleAvatarUpload() { const msg = $('#avatarUploadMsg'); try { settingsForm.author_avatar.value = await uploadImage($('#avatarUpload'), msg, 'avatars'); } catch (err) { msg.textContent = err.message; } }
async function handleLogoUpload() { const msg = $('#logoUploadMsg'); try { settingsForm.logo_url.value = await uploadImage($('#logoUpload'), msg, 'logos'); } catch (err) { msg.textContent = err.message; } }

async function loadSettings() { const { settings } = await api('/api/admin/settings'); for (const [key, value] of Object.entries(settings)) if (settingsForm.elements[key]) { if (settingsForm.elements[key].type === 'checkbox') settingsForm.elements[key].checked = String(value) !== 'false'; else settingsForm.elements[key].value = value; } moduleVisibilityState = parseModuleVisibility(settings.module_visibility); renderVisibilityToggles(); taxonomyState.categories = categoryListFromValue(settings.taxonomy_categories); taxonomyState.tags = tagListFromValue(settings.taxonomy_tags); posts.forEach(p => ensureTaxonomy(p.category, p.tags || [])); renderTaxonomyEditors(); updateArticleTaxonomyUI(); homeCards = parseHomeCards(settings.home_cards); renderHomeCardEditor(); listState.header_nav_links = parseList(settings.header_nav_links, defaultHeaderNav()); listState.nav_links = parseList(settings.nav_links, defaultNavLinks()); listState.project_cards = parseList(settings.project_cards, defaultProjects()); listState.friend_links = parseList(settings.friend_links, defaultFriends()); listState.music_playlist = parseList(settings.music_playlist, defaultMusic()); Object.keys(LIST_CONFIG).forEach(renderListEditor); applyPreviewCustomStyles(); settingsHomePreviewFast(); initTiltCards(document); }
async function saveSettings(e) { e.preventDefault(); try { syncHomeCardsInput(); syncTaxonomyInputs(); syncModuleVisibilityInput(); Object.keys(LIST_CONFIG).forEach(syncListInput); const saved = await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(settingsDataToObject()) }); $('#settingsMsg').textContent = '设置已保存。前台刷新后会读取最新设置；已对接口禁用缓存。'; if (saved?.settings) { moduleVisibilityState = parseModuleVisibility(saved.settings.module_visibility); renderVisibilityToggles(); } markSaved(); showIsland('站点设置已保存'); } catch (err) { $('#settingsMsg').textContent = err.message; } }

$('#loginForm').addEventListener('submit', async e => { e.preventDefault(); $('#loginMsg').textContent = ''; try { await api('/api/auth/login', { method: 'POST', body: JSON.stringify(formDataToObject(e.target)) }); await checkLogin(); } catch (err) { $('#loginMsg').textContent = err.message; } });
$('#logoutBtn').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); showLogin(); });
$$('[data-admin-tab]').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.adminTab)));
const previewPostFast = debounce(() => { markDirty(); renderPostPreview(); }, 120);
const previewPageFast = debounce(() => { markDirty(); renderPagePreview(); }, 120);
$('#newPostBtn')?.addEventListener('click', resetPostForm); $('#resetBtn')?.addEventListener('click', resetPostForm); postForm?.addEventListener('submit', savePost); postForm?.addEventListener('input', previewPostFast);
$('#newPageBtn')?.addEventListener('click', resetPageForm); $('#resetPageBtn')?.addEventListener('click', resetPageForm); pageForm?.addEventListener('submit', savePage); pageForm?.addEventListener('input', previewPageFast);
$('#insertPostVideoBtn')?.addEventListener('click', () => addBlock('post', 'video', { title: '外部视频', ratio: '16:9' })); $('#insertPageVideoBtn')?.addEventListener('click', () => addBlock('page', 'video', { title: '外部视频', ratio: '16:9' }));
$('#coverUploadBtn')?.addEventListener('click', handleCoverUpload); $('#contentUploadBtn')?.addEventListener('click', handleContentUpload); $('#pageCoverUploadBtn')?.addEventListener('click', handlePageCoverUpload); $('#pageContentUploadBtn')?.addEventListener('click', handlePageContentUpload); $('#avatarUploadBtn')?.addEventListener('click', handleAvatarUpload); $('#logoUploadBtn')?.addEventListener('click', handleLogoUpload);
$('#addHomeCardBtn')?.addEventListener('click', addHomeCard); $('#addHeaderNavBtn')?.addEventListener('click', () => addListItem('header_nav_links')); $('#addNavLinkBtn')?.addEventListener('click', () => addListItem('nav_links')); $('#addProjectCardBtn')?.addEventListener('click', () => addListItem('project_cards')); $('#addFriendLinkBtn')?.addEventListener('click', () => addListItem('friend_links')); $('#addMusicBtn')?.addEventListener('click', () => addListItem('music_playlist'));
$('#refreshCommentsBtn')?.addEventListener('click', () => loadComments());
$('#refreshSystemBtn')?.addEventListener('click', () => loadSystemCheck());
$('#commentSearchInput')?.addEventListener('input', renderCommentTable);
$('#commentStatusFilter')?.addEventListener('change', renderCommentTable);
settingsForm?.addEventListener('input', applyPreviewCustomStyles);
settingsForm?.addEventListener('submit', saveSettings);
bindVisibilityToggles();

initTheme();
bindMouseAura();
bindTaxonomyUI();
updateArticleTaxonomyUI();
// v10.16: 模块添加按钮必须在登录检查前就绑定。
// 之前如果 loadSettings 中途报错，后面的 initBlockEditors 不会执行，导致 + 文字/图片/视频按钮无反应。
bindBlockToolbarDelegation();
await checkLogin();
initBlockEditors();
renderPostPreview();
renderPagePreview();
observeReveal();
initTiltCards(document);
showIsland('控制台已就绪');

// v10.5：站点设置右侧主页实时预览 + 低风险体验兜底
function checkedRadioValue(form, name, fallback = '') {
  const checked = form?.querySelector?.(`input[name="${name}"]:checked`);
  return checked?.value || fallback;
}

function safeJsonListFromInput(name, fallback = []) {
  try {
    const raw = settingsForm?.elements?.[name]?.value || '[]';
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : fallback;
  } catch {
    return fallback;
  }
}

const previewThemeMap = {
  'hyper-blue': ['#5668ff', '#7a8cff', '#67d9ff', '#edf2fb', '#f8fbff'],
  sakura: ['#ff6aa9', '#ff9ac8', '#ffd0e4', '#fff0f7', '#fffafd'],
  matcha: ['#2fb879', '#72d98c', '#b8f7ce', '#f1fbf3', '#fbfff8'],
  sunset: ['#ff7a43', '#ffb15f', '#ffe0a3', '#fff4ea', '#fffaf5'],
  aurora: ['#8b5cf6', '#5eead4', '#b9f6ff', '#f4f2ff', '#fbfbff'],
  night: ['#38bdf8', '#818cf8', '#22d3ee', '#0c1324', '#111a2f']
};

function renderPreviewLogo(s, label) {
  return s.logo_url
    ? `<img class="preview-brand-logo-img" src="${escapeHtml(s.logo_url)}" alt="${escapeHtml(label)}">`
    : '<span class="preview-brand-mark"></span>';
}

function renderSettingsHomePreview() {
  const el = $('#settingsHomePreview');
  if (!el || !settingsForm) return;
  try {
    // 保证隐藏字段与当前编辑器状态同步，右侧预览才能即时看到卡片、导航变化。
    syncHomeCardsInput?.();
    Object.keys(LIST_CONFIG || {}).forEach(name => syncListInput?.(name));
    syncTaxonomyInputs?.();
  } catch {}

  const s = formDataToObject(settingsForm);
  const theme = checkedRadioValue(settingsForm, 'theme_preset', s.theme_preset || 'hyper-blue');
  const layout = checkedRadioValue(settingsForm, 'layout_mode', s.layout_mode || 'classic');
  const themeVars = previewThemeMap[theme] || previewThemeMap['hyper-blue'];
  const cards = homeCards?.length ? homeCards : parseHomeCards(s.home_cards);
  const headerLinks = listState.header_nav_links?.length ? listState.header_nav_links : safeJsonListFromInput('header_nav_links', defaultHeaderNav());
  const navLinks = listState.nav_links?.length ? listState.nav_links : safeJsonListFromInput('nav_links', []);
  const categories = uniqueItems((taxonomyState.categories || []).map(normalizeCategoryInput).filter(Boolean));
  const tags = uniqueItems((taxonomyState.tags || []).map(normalizeTagInput).filter(Boolean));
  const samplePosts = (posts || []).slice(0, 2);
  const brandLabel = s.logo_text || s.site_title || '网站标题';
  const showHeaderNav = isPreviewModuleVisible('header_nav');
  const showHero = isPreviewModuleVisible('hero');
  const showHeroCards = isPreviewModuleVisible('hero_cards');
  const showQuickNav = isPreviewModuleVisible('quick_nav');
  const showCategories = isPreviewModuleVisible('categories');
  const showTags = isPreviewModuleVisible('tags');
  const showProfile = isPreviewModuleVisible('profile_card');
  const showFooter = isPreviewModuleVisible('footer');

  el.style.setProperty('--p-primary', themeVars[0]);
  el.style.setProperty('--p-primary-2', themeVars[1]);
  el.style.setProperty('--p-accent', themeVars[2]);
  el.style.setProperty('--p-bg', themeVars[3]);
  el.style.setProperty('--p-bg-2', themeVars[4]);

  el.innerHTML = `
    <div class="preview-home preview-layout-${escapeHtml(layout)} preview-theme-${escapeHtml(theme)}">
      <header class="preview-topbar">
        <div class="preview-brand">${renderPreviewLogo(s, brandLabel)}<b>${escapeHtml(brandLabel)}</b></div>
        ${showHeaderNav ? `<nav>${headerLinks.slice(0, 5).map(item => `<span>${escapeHtml(item.title || '导航')}</span>`).join('')}</nav>` : ''}
      </header>
      ${showHero ? `<section class="preview-hero">
        <div>
          <small>${escapeHtml(s.site_subtitle || '站点副标题')}</small>
          <h1>${escapeHtml(s.hero_title || s.site_title || '主页大标题')}</h1>
          <p>${escapeHtml(s.hero_text || '这里会显示 Banner 说明，方便你判断主页首屏效果。')}</p>
        </div>
        ${showHeroCards ? `<div class="preview-hero-cards">${cards.slice(0, 3).map(card => `<a class="preview-mini-card" href="javascript:void(0)"><span>${escapeHtml(card.icon || '✨')}</span><b>${escapeHtml(card.title || '卡片标题')}</b><small>${escapeHtml(card.text || card.label || '卡片说明')}</small></a>`).join('')}</div>` : ''}
      </section>` : `<section class="preview-hero preview-disabled"><p class="muted">Hero 首屏已关闭</p></section>`}
      <section class="preview-body">
        <aside class="preview-sidebar">
          ${showProfile ? `<div class="preview-profile"><div class="preview-avatar" ${s.author_avatar ? `style="background-image:url('${escapeHtml(s.author_avatar)}')"` : ''}></div><b>${escapeHtml(s.author_name || '站长')}</b><p>${escapeHtml(s.author_bio || '作者简介会显示在这里。')}</p></div>` : ''}
          ${showQuickNav && navLinks.length ? `<div class="preview-side-block"><b>快捷导航</b>${navLinks.slice(0, 4).map(item => `<span>${escapeHtml(item.title || '链接')}</span>`).join('')}</div>` : ''}
          ${showCategories ? `<div class="preview-side-block"><b>分类</b>${(categories.length ? categories : ['教程', '随笔']).slice(0, 4).map(c => `<span>@${escapeHtml(c)}</span>`).join('')}</div>` : ''}
          ${showTags ? `<div class="preview-side-block"><b>标签</b>${(tags.length ? tags : ['#设计', '#建站']).slice(0, 5).map(t => `<span>${escapeHtml(tagLabel(t))}</span>`).join('')}</div>` : ''}
        </aside>
        <main class="preview-post-flow">
          ${(samplePosts.length ? samplePosts : [{ title: '文章卡片预览', excerpt: '这里显示首页文章列表效果。', category: '教程', tags: ['#展示'] }, { title: '第二篇文章预览', excerpt: '调整站点设置时，右侧会同步更新主页视觉。', category: '随笔', tags: ['#预览'] }]).map(p => `<article class="preview-post-card"><h3>${escapeHtml(p.title || '文章标题')}</h3><p>${escapeHtml(p.excerpt || '文章摘要显示在这里。')}</p><div><span>@${escapeHtml(p.category || '未分类')}</span>${(p.tags || []).slice(0, 2).map(t => `<span>${escapeHtml(tagLabel(t))}</span>`).join('')}</div></article>`).join('')}
        </main>
      </section>
      ${showFooter ? `<footer class="preview-footer">${escapeHtml(s.footer_html || '页脚文字')}</footer>` : ''}
    </div>`;
}

settingsHomePreviewFast = debounce(() => renderSettingsHomePreview(), 100);
settingsForm?.addEventListener('input', () => { markDirty(); settingsHomePreviewFast(); });
settingsForm?.addEventListener('change', () => { markDirty(); settingsHomePreviewFast(); });
settingsForm?.addEventListener('click', () => setTimeout(renderSettingsHomePreview, 0));

// 追加到原有加载流程之后，避免影响文章 / 页面编辑器初始化。
setTimeout(renderSettingsHomePreview, 0);
