const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const app = $('#app');
let site = null;
let revealObserver = null;
let islandTimer = null;
let musicAudio = null;
let musicList = [];
let currentTrack = 0;
const IS_MOBILE_TEMPLATE = document.documentElement.dataset.template === 'mobile' || document.body.classList.contains('mobile-template');
const IS_TOUCH_DEVICE = window.matchMedia('(hover: none), (pointer: coarse)').matches;

const RESERVED = new Set(['archive', 'category', 'tag', 'search', 'api', 'admin', 'admin.html']);
const THEME_PRESETS = {
  'hyper-blue': { name: 'Hyper Blue', color: '#5668ff', primary: '#5668ff', primary2: '#7a8cff', accent: '#67d9ff', bg: '#eef3fb', bg2: '#f8fbff', dark: false },
  sakura: { name: 'Sakura', color: '#ff7ab6', primary: '#ff6aa9', primary2: '#ff9ac8', accent: '#ffd0e4', bg: '#fff0f7', bg2: '#fffafd', dark: false },
  matcha: { name: 'Matcha', color: '#37b879', primary: '#2fb879', primary2: '#72d98c', accent: '#b8f7ce', bg: '#f1fbf3', bg2: '#fbfff8', dark: false },
  sunset: { name: 'Sunset', color: '#ff8a4c', primary: '#ff7a43', primary2: '#ffb15f', accent: '#ffe0a3', bg: '#fff4ea', bg2: '#fffaf5', dark: false },
  aurora: { name: 'Aurora', color: '#8b5cf6', primary: '#8b5cf6', primary2: '#5eead4', accent: '#b9f6ff', bg: '#f4f2ff', bg2: '#fbfbff', dark: false },
  night: { name: 'Night', color: '#38bdf8', primary: '#38bdf8', primary2: '#818cf8', accent: '#22d3ee', bg: '#0c1324', bg2: '#111a2f', dark: true }
};
const THEME_ANIMATION_DIRECTIONS = [
  { key: 'top', name: '自上而下', enter: 'polygon(0 0,100% 0,100% 0,0 0)', full: 'polygon(0 0,100% 0,100% 100%,0 100%)', exit: 'polygon(0 100%,100% 100%,100% 100%,0 100%)' },
  { key: 'bottom', name: '自下而上', enter: 'polygon(0 100%,100% 100%,100% 100%,0 100%)', full: 'polygon(0 0,100% 0,100% 100%,0 100%)', exit: 'polygon(0 0,100% 0,100% 0,0 0)' },
  { key: 'left', name: '从左往右', enter: 'polygon(0 0,0 0,0 100%,0 100%)', full: 'polygon(0 0,100% 0,100% 100%,0 100%)', exit: 'polygon(100% 0,100% 0,100% 100%,100% 100%)' },
  { key: 'right', name: '从右往左', enter: 'polygon(100% 0,100% 0,100% 100%,100% 100%)', full: 'polygon(0 0,100% 0,100% 100%,0 100%)', exit: 'polygon(0 0,0 0,0 100%,0 100%)' }
];

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
let moduleVisibility = { ...DEFAULT_MODULE_VISIBILITY };
function parseModuleVisibility(value) {
  if (!value) return { ...DEFAULT_MODULE_VISIBILITY };
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return { ...DEFAULT_MODULE_VISIBILITY, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return { ...DEFAULT_MODULE_VISIBILITY };
  }
}
function isModuleVisible(key) { return moduleVisibility[key] !== false; }
function toggleEl(el, visible = true) { if (el) el.classList.toggle('hidden', !visible); }
function applyModuleVisibility(settings = {}) {
  moduleVisibility = parseModuleVisibility(settings.module_visibility);
  toggleEl($('#headerNavLinks'), isModuleVisible('header_nav'));
  toggleEl($('#themePaletteBtn'), isModuleVisible('theme_switcher'));
  toggleEl($('#themeMenu'), isModuleVisible('theme_switcher') && !$('#themeMenu')?.classList.contains('hidden'));
  toggleEl($('#heroSection'), isModuleVisible('hero'));
  toggleEl($('#heroCards'), isModuleVisible('hero_cards'));
  toggleEl($('#featureGrid'), isModuleVisible('feature_cards'));
  toggleEl($('#projectShowcase'), isModuleVisible('project_showcase'));
  toggleEl($('#friendLinks'), isModuleVisible('friend_links'));
  toggleEl($('#authorName')?.closest('.profile-card'), isModuleVisible('profile_card'));
  toggleEl($('#categoryList')?.closest('.side-card'), isModuleVisible('categories'));
  toggleEl($('#tagList')?.closest('.side-card'), isModuleVisible('tags'));
  toggleEl($('#quickNavList')?.closest('.side-card'), isModuleVisible('quick_nav'));
  toggleEl($('#musicPlayer'), isModuleVisible('music_player'));
  toggleEl($('#footerText'), isModuleVisible('footer'));
}

function escapeHtml(str = '') {
  return String(str).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}
function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
async function api(path, options = {}) {
  const res = await fetch(path, { cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}
function showIsland(text = '已完成') {
  const island = $('#quickIsland');
  const islandText = $('#islandText');
  if (!island || !islandText) return;
  islandText.textContent = text;
  island.classList.add('show');
  clearTimeout(islandTimer);
  islandTimer = setTimeout(() => island.classList.remove('show'), 2200);
}
function normalizeLink(link = '') {
  const raw = String(link || '').trim();
  if (!raw) return '#';
  if (/^(https?:|mailto:|tel:|#)/i.test(raw)) return raw;
  return raw.startsWith('/') ? raw : `/${raw}`;
}
function postHref(slug = '') { return `/${encodeURIComponent(String(slug || '').replace(/^\/+/, ''))}`; }
function categoryHref(name = '') { return `/category/${encodeURIComponent(name)}`; }
function tagHref(name = '') { return `/tag/${encodeURIComponent(name)}`; }
function tagLabel(name = '') { return String(name || '').startsWith('#') ? String(name || '') : `#${name}`; }
function inlineMd(text = '') {
  return escapeHtml(text)
    .replace(/!\[([^\]]*)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g, '<img alt="$1" src="$2">')
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/|#)[^\s)]*)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function parseEmbedAttrs(input = '') {
  const attrs = {};
  String(input).replace(/(\w+)=("[^"]*"|'[^']*'|[^\s\]]+)/g, (_, key, value) => {
    attrs[key] = String(value || '').replace(/^['"]|['"]$/g, '').trim();
    return '';
  });
  return attrs;
}
function safeEmbedUrl(url = '') {
  let raw = String(url || '').trim();
  if (!raw) return '';
  if (/^\/\//.test(raw)) raw = `https:${raw}`;
  if (!/^https?:\/\//i.test(raw)) return '';
  try {
    const parsed = new URL(raw);
    ['autoplay', 'autoPlay', 'auto_play', 'muted'].forEach(key => parsed.searchParams.delete(key));
    if (/youtube\.com|youtu\.be|bilibili\.com/i.test(parsed.hostname)) parsed.searchParams.set('autoplay', '0');
    return parsed.toString();
  } catch {
    return raw
      .replace(/([?&])autoplay=1/ig, '$1autoplay=0')
      .replace(/([?&])auto_?play=1/ig, '$1autoplay=0');
  }
}
function ratioToPadding(ratio = '16:9') {
  const [w, h] = String(ratio || '16:9').split(':').map(Number);
  if (!w || !h) return '56.25%';
  return `${Math.min(160, Math.max(20, (h / w) * 100)).toFixed(4)}%`;
}
function videoEmbedHtml(src = '', title = '外部视频', ratio = '16:9', className = '') {
  const safe = safeEmbedUrl(src);
  if (!safe) return '';
  const extraClass = String(className || '').trim().replace(/[^a-zA-Z0-9_\- ]/g, '');
  return `<figure class="video-embed card tilt-card ${escapeHtml(extraClass)}" data-tilt-strength="3" data-tilt-move="2" style="--video-ratio:${ratioToPadding(ratio)}"><div class="video-frame"><iframe src="${escapeHtml(safe)}" title="${escapeHtml(title || '外部视频')}" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>${title ? `<figcaption>${escapeHtml(title)}</figcaption>` : ''}</figure>`;
}
function renderVideoLine(line = '') {
  const trimmed = line.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('::video ')) {
    const body = trimmed.replace(/^::video\s+/, '');
    const parts = body.split(/\s+/);
    const src = parts.shift();
    const attrs = parseEmbedAttrs(body);
    return videoEmbedHtml(attrs.src || src, attrs.title || '外部视频', attrs.ratio || '16:9', attrs.class || attrs.className || '');
  }
  const shortMatch = trimmed.match(/^\[(?:video|iframe)\s+([^\]]+)\]$/i);
  if (shortMatch) {
    const attrs = parseEmbedAttrs(shortMatch[1]);
    return videoEmbedHtml(attrs.src || attrs.url, attrs.title || '外部视频', attrs.ratio || '16:9', attrs.class || attrs.className || '');
  }
  const iframeSrc = trimmed.match(/^<iframe\b[^>]*\bsrc=["']([^"']+)["'][\s\S]*<\/iframe>$/i);
  if (iframeSrc) return videoEmbedHtml(iframeSrc[1], '外部视频', '16:9');
  return '';
}

function readAttr(attrs = {}, key = '', fallback = '') {
  const value = attrs[key];
  return value == null ? fallback : String(value);
}
function moduleEmbedHtml(type = '', attrs = {}) {
  if (type === 'callout') {
    const tone = readAttr(attrs, 'tone', readAttr(attrs, 'type', 'tip')).replace(/[^a-zA-Z0-9_-]/g, '') || 'tip';
    const title = readAttr(attrs, 'title', tone === 'warn' ? '注意' : '提示');
    const text = readAttr(attrs, 'text', '');
    return `<aside class="content-module module-callout module-${escapeHtml(tone)} card"><b>${escapeHtml(title)}</b><p>${inlineMd(text)}</p></aside>`;
  }
  if (type === 'quote') {
    const text = readAttr(attrs, 'text', '');
    const author = readAttr(attrs, 'author', '');
    return `<figure class="content-module module-quote"><blockquote>${inlineMd(text)}</blockquote>${author ? `<figcaption>— ${escapeHtml(author)}</figcaption>` : ''}</figure>`;
  }
  if (type === 'button') {
    const text = readAttr(attrs, 'text', '查看详情');
    const url = normalizeLink(readAttr(attrs, 'url', '#'));
    const style = readAttr(attrs, 'style', 'primary').replace(/[^a-zA-Z0-9_-]/g, '') || 'primary';
    return `<p class="content-module module-button-wrap"><a class="module-button module-button-${escapeHtml(style)}" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(text)}</a></p>`;
  }
  if (type === 'divider') return '<div class="content-module module-divider"><span></span></div>';
  if (type === 'gallery') {
    const images = readAttr(attrs, 'images', '').split('|').map(v => v.trim()).filter(Boolean);
    const caption = readAttr(attrs, 'caption', '');
    if (!images.length) return '';
    return `<figure class="content-module module-gallery card"><div class="gallery-grid">${images.map((src, i) => `<img src="${escapeHtml(src)}" alt="图片 ${i + 1}" loading="lazy">`).join('')}</div>${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`;
  }
  return '';
}
function renderSpecialLine(line = '') {
  const video = renderVideoLine(line);
  if (video) return video;
  const match = line.trim().match(/^\[(callout|quote|button|divider|gallery)\s*([^\]]*)\]$/i);
  if (!match) return '';
  return moduleEmbedHtml(match[1].toLowerCase(), parseEmbedAttrs(match[2] || ''));
}
function applyCustomStyles(settings = {}) {
  let style = document.getElementById('customSiteStyle');
  if (!style) {
    style = document.createElement('style');
    style.id = 'customSiteStyle';
    document.head.appendChild(style);
  }
  style.textContent = `${settings.video_embed_css || ''}\n${settings.custom_css || ''}`;
}

function renderMarkdown(md = '') {
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let inCode = false;
  let code = [];
  let inList = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('```')) {
      if (!inCode) { closeList(); inCode = true; code = []; }
      else { html += `<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`; inCode = false; }
      continue;
    }
    if (inCode) { code.push(raw); continue; }
    if (!line.trim()) { closeList(); continue; }
    const specialBlock = renderSpecialLine(line);
    if (specialBlock) { closeList(); html += specialBlock; continue; }
    if (/^###\s+/.test(line)) { closeList(); html += `<h3>${inlineMd(line.replace(/^###\s+/, ''))}</h3>`; continue; }
    if (/^##\s+/.test(line)) { closeList(); html += `<h2>${inlineMd(line.replace(/^##\s+/, ''))}</h2>`; continue; }
    if (/^#\s+/.test(line)) { closeList(); html += `<h1>${inlineMd(line.replace(/^#\s+/, ''))}</h1>`; continue; }
    if (/^>\s?/.test(line)) { closeList(); html += `<blockquote>${inlineMd(line.replace(/^>\s?/, ''))}</blockquote>`; continue; }
    if (/^[-*]\s+/.test(line)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inlineMd(line.replace(/^[-*]\s+/, ''))}</li>`;
      continue;
    }
    closeList();
    html += `<p>${inlineMd(line)}</p>`;
  }
  closeList();
  if (inCode) html += `<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`;
  return html;
}
function parseJsonArray(value, fallback = [], mapper = item => item) {
  try {
    const arr = JSON.parse(value || '[]');
    if (!Array.isArray(arr)) return fallback;
    const clean = arr.map(mapper).filter(Boolean);
    return clean.length ? clean : fallback;
  } catch { return fallback; }
}
function defaultHomeCards() {
  return [
    { label: 'Markdown', title: '实时预览', text: '后台写作时边写边看，适合快速发布文章。', icon: '✍️', link: '' },
    { label: '页面系统', title: '文章 / 页面分离', text: '文章进博客流，页面做关于我、联系页或专题页。', icon: '📄', link: '/about' },
    { label: '图片上传', title: '封面 / Logo / 头像', text: '支持上传封面图、正文图、网站 Logo 和头像。', icon: '🖼️', link: '' }
  ];
}
function defaultHeaderNav() { return [{ title: '首页', link: '/' }, { title: '归档', link: '/archive' }, { title: '关于我', link: '/about' }]; }
function defaultNavLinks() { return [{ title: '关于我', desc: '独立页面示例', icon: '👋', link: '/about' }, { title: '作品集', desc: '鞋类设计、建模和视觉作品', icon: '👟', link: '/category/设计' }]; }
function defaultFriendLinks() { return [{ name: 'RyuChan', desc: '配置、写作和卡片化体验参考', avatar: '', link: 'https://github.com/kobaridev/RyuChan' }]; }
function defaultProjectCards() { return [{ title: '校园鞋店 Vlog', desc: '记录从收拾店铺到正式营业的过程。', image: '', tags: 'Vlog,校园,鞋店', link: '#' }]; }
function defaultMusicList() { return [{ title: '示例音乐', artist: '请在后台填写音频 URL', url: '', cover: '' }]; }
function normalizeNavLink(item) {
  const title = String(item.title || '').trim();
  const link = normalizeLink(item.link || '');
  if (!title && link === '#') return null;
  return { title, link, desc: String(item.desc || '').trim(), icon: String(item.icon || '🔗').trim() };
}
function normalizeHeaderNav(item) {
  const title = String(item.title || '').trim();
  const link = normalizeLink(item.link || '');
  if (!title || link === '#') return null;
  return { title, link };
}
function normalizeFriend(item) {
  const name = String(item.name || '').trim();
  const link = normalizeLink(item.link || '');
  if (!name && link === '#') return null;
  return { name, link, desc: String(item.desc || '').trim(), avatar: String(item.avatar || '').trim() };
}
function normalizeProject(item) {
  const title = String(item.title || '').trim();
  if (!title) return null;
  return { title, desc: String(item.desc || '').trim(), image: String(item.image || '').trim(), tags: String(item.tags || '').trim(), link: normalizeLink(item.link || '#') };
}
function normalizeTrack(item) {
  const title = String(item.title || '').trim();
  const url = String(item.url || '').trim();
  if (!title && !url) return null;
  return { title: title || '未命名音乐', artist: String(item.artist || '').trim(), url, cover: String(item.cover || '').trim() };
}

function systemPrefersDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}
function isThemeManuallySelected() {
  return localStorage.getItem('theme-manual') === '1';
}
function chooseThemeForDevice(defaultPreset = 'hyper-blue') {
  const saved = localStorage.getItem('theme-preset');
  if (isThemeManuallySelected() && saved && THEME_PRESETS[saved]) return saved;
  return systemPrefersDark() ? 'night' : (THEME_PRESETS[defaultPreset] ? defaultPreset : 'hyper-blue');
}
function markThemeManual() {
  localStorage.setItem('theme-manual', '1');
}
function bindSystemThemeListener() {
  if (!window.matchMedia) return;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    if (isThemeManuallySelected()) return;
    applyThemePreset(chooseThemeForDevice(site?.settings?.theme_preset || 'hyper-blue'), false, true);
    showIsland(systemPrefersDark() ? '已跟随系统切换夜间模式' : '已跟随系统切换日间模式');
  };
  if (mq.addEventListener) mq.addEventListener('change', handler);
  else if (mq.addListener) mq.addListener(handler);
}
function applyThemeInstant(key, persist = true) {
  const safeKey = THEME_PRESETS[key] ? key : 'hyper-blue';
  document.documentElement.setAttribute('data-theme-preset', safeKey);
  document.documentElement.classList.toggle('dark', Boolean(THEME_PRESETS[safeKey].dark));
  $('#themeBtn') && ($('#themeBtn').textContent = document.documentElement.classList.contains('dark') ? '☀️' : '🌙');
  if (persist) localStorage.setItem('theme-preset', safeKey);
  $$('#themeMenu [data-theme-preset]').forEach(btn => btn.classList.toggle('active', btn.dataset.themePreset === safeKey));
}
function playThemeTransition(key) {
  const safeKey = THEME_PRESETS[key] ? key : 'hyper-blue';
  const target = THEME_PRESETS[safeKey];
  if (!document.body || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    applyThemeInstant(safeKey, true);
    return;
  }
  const direction = THEME_ANIMATION_DIRECTIONS[Math.floor(Math.random() * THEME_ANIMATION_DIRECTIONS.length)];

  // V9.3：只切换背景，不再创建全屏覆盖层、不做粒子和扫光，避免卡顿。
  document.body.dataset.themeFlow = direction.key;
  document.body.classList.remove('theme-bg-flow');
  void document.body.offsetWidth;
  document.body.classList.add('theme-bg-flow');

  applyThemeInstant(safeKey, true);
  showIsland(`主题切换 · ${target.name} · ${direction.name}`);

  window.clearTimeout(window.__themeFlowTimer);
  window.__themeFlowTimer = window.setTimeout(() => {
    document.body.classList.remove('theme-bg-flow');
    delete document.body.dataset.themeFlow;
  }, 760);
}
function applyThemePreset(name, persist = true, animate = true) {
  const key = THEME_PRESETS[name] ? name : 'hyper-blue';
  const current = document.documentElement.getAttribute('data-theme-preset');
  if (animate && current && current !== key && persist) return playThemeTransition(key);
  applyThemeInstant(key, persist);
}
function applyLayoutMode(mode = 'classic') {
  const safe = ['classic', 'magazine', 'focus', 'compact'].includes(mode) ? mode : 'classic';
  document.documentElement.setAttribute('data-layout', safe);
}
function renderThemeMenu() {
  const menu = $('#themeMenu');
  if (!menu) return;
  menu.innerHTML = Object.entries(THEME_PRESETS).map(([key, item]) => `<button type="button" data-theme-preset="${key}"><span class="theme-swatch" style="--swatch:${item.color}"></span><span>${escapeHtml(item.name)}</span></button>`).join('');
  $$('[data-theme-preset]', menu).forEach(btn => btn.addEventListener('click', () => { markThemeManual(); applyThemePreset(btn.dataset.themePreset, true); menu.classList.add('hidden'); }));
}
function renderHeaderNav(items = []) {
  const wrap = $('#headerNavLinks');
  if (!wrap) return;
  if (!isModuleVisible('header_nav')) { wrap.innerHTML = ''; toggleEl(wrap, false); return; }
  toggleEl(wrap, true);
  const nav = items.length ? items : defaultHeaderNav();
  wrap.innerHTML = nav.map(item => `<a href="${escapeHtml(normalizeLink(item.link))}">${escapeHtml(item.title)}</a>`).join('');
}
function renderQuickNav(items = []) {
  const wrap = $('#quickNavList');
  if (!wrap) return;
  if (!isModuleVisible('quick_nav')) { wrap.innerHTML = ''; toggleEl(wrap.closest('.side-card'), false); return; }
  toggleEl(wrap.closest('.side-card'), true);
  const links = items.length ? items : defaultNavLinks();
  wrap.innerHTML = links.map(item => `<a class="quick-nav-item tilt-card" data-tilt-strength="6" data-tilt-move="3" href="${escapeHtml(normalizeLink(item.link))}"><span>${escapeHtml(item.icon || '🔗')}</span><b>${escapeHtml(item.title || '未命名')}</b><small>${escapeHtml(item.desc || '')}</small></a>`).join('');
}
function renderHomeCards(cards = []) {
  const heroCards = $('#heroCards');
  const grid = $('#featureGrid');
  const finalCards = cards.length ? cards : defaultHomeCards();
  if (heroCards) {
    if (!isModuleVisible('hero_cards')) { heroCards.innerHTML = ''; toggleEl(heroCards, false); }
    else { toggleEl(heroCards, true); heroCards.innerHTML = finalCards.slice(0, 4).map((card, index) => `<div class="floating-panel panel-dynamic panel-dynamic-${index}"><a class="floating-panel-card tilt-card" data-tilt-strength="18" data-tilt-move="8" href="${escapeHtml(normalizeLink(card.link || '#'))}"><span class="card-icon">${escapeHtml(card.icon || '✨')}</span><small>${escapeHtml(card.label || 'Feature')}</small><b>${escapeHtml(card.title || '未命名卡片')}</b></a></div>`).join(''); }
  }
  if (grid) {
    if (!isModuleVisible('feature_cards')) { grid.innerHTML = ''; toggleEl(grid, false); }
    else { toggleEl(grid, true); grid.innerHTML = `<div class="feature-grid-head reveal-up in-view"><p class="eyebrow">CONFIGURABLE CARDS</p><h2>首页卡片由后台控制</h2><p class="muted">卡片内容不写死，可以在后台新增、删除、排序和编辑。</p></div><div class="feature-grid">${finalCards.map((card, index) => `<a class="card feature-card tilt-card reveal-up in-view" style="transition-delay:${index * 60}ms" href="${escapeHtml(normalizeLink(card.link || '#'))}"><span class="feature-icon">${escapeHtml(card.icon || '✨')}</span><small>${escapeHtml(card.label || 'Feature')}</small><h3>${escapeHtml(card.title || '未命名卡片')}</h3><p>${escapeHtml(card.text || '')}</p></a>`).join('')}</div>`; }
  }
  initTiltCards(document);
}
function renderProjectShowcase(items = []) {
  const wrap = $('#projectShowcase');
  if (!wrap) return;
  if (!isModuleVisible('project_showcase')) { wrap.innerHTML = ''; toggleEl(wrap, false); return; }
  toggleEl(wrap, true);
  const projects = items.length ? items : defaultProjectCards();
  wrap.innerHTML = `<div class="section-head reveal-up in-view"><p class="eyebrow">PROJECT SHOWCASE</p><h2>项目展示</h2><p class="muted">适合放作品集、店铺动态、专题入口。</p></div><div class="project-grid">${projects.map((item, index) => { const tags = String(item.tags || '').split(/[，,]/).map(t => t.trim()).filter(Boolean).map(t => `<span>${escapeHtml(t)}</span>`).join(''); return `<a class="card project-card tilt-card reveal-up in-view" style="transition-delay:${index * 60}ms" data-tilt-strength="7" data-tilt-move="4" href="${escapeHtml(normalizeLink(item.link || '#'))}">${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}">` : `<div class="project-placeholder">${escapeHtml(item.title.slice(0,2) || 'PR')}</div>`}<div class="project-card-body"><h3>${escapeHtml(item.title || '未命名项目')}</h3><p>${escapeHtml(item.desc || '')}</p><div class="project-tags">${tags}</div></div></a>`; }).join('')}</div>`;
}
function renderFriendLinks(items = []) {
  const wrap = $('#friendLinks');
  if (!wrap) return;
  if (!isModuleVisible('friend_links')) { wrap.innerHTML = ''; toggleEl(wrap, false); return; }
  toggleEl(wrap, true);
  const friends = items.length ? items : defaultFriendLinks();
  wrap.innerHTML = `<div class="section-head reveal-up in-view"><p class="eyebrow">FRIEND LINKS</p><h2>友链 / 推荐</h2><p class="muted">适合放朋友网站、工具链接、社交主页和资源入口。</p></div><div class="friend-grid">${friends.map((item, index) => `<a class="card friend-card tilt-card reveal-up in-view" style="transition-delay:${index * 50}ms" data-tilt-strength="6" data-tilt-move="4" href="${escapeHtml(normalizeLink(item.link || '#'))}" target="_blank" rel="noopener"><span class="friend-avatar">${item.avatar ? `<img src="${escapeHtml(item.avatar)}" alt="${escapeHtml(item.name)}">` : escapeHtml((item.name || '?').slice(0,1))}</span><span><b>${escapeHtml(item.name || '未命名')}</b><small>${escapeHtml(item.desc || '')}</small></span></a>`).join('')}</div>`;
}
function initMusicPlayer(items = []) {
  const wrap = $('#musicPlayer');
  if (!wrap) return;
  if (!isModuleVisible('music_player')) { wrap.classList.add('hidden'); wrap.innerHTML = ''; if (musicAudio) musicAudio.pause(); return; }
  musicList = (items.length ? items : defaultMusicList()).filter(t => t.url);
  if (!musicList.length) { wrap.classList.add('hidden'); wrap.innerHTML = ''; return; }
  wrap.classList.remove('hidden');
  currentTrack = Math.min(currentTrack, musicList.length - 1);
  const track = musicList[currentTrack];
  wrap.innerHTML = `<button id="musicToggle" class="music-toggle" type="button">▶</button><div class="music-meta"><b>${escapeHtml(track.title)}</b><small>${escapeHtml(track.artist || '音乐播放器')}</small></div><button id="musicPrev" class="music-mini-btn" type="button">‹</button><button id="musicNext" class="music-mini-btn" type="button">›</button>`;
  if (!musicAudio) musicAudio = new Audio();
  if (musicAudio.src !== track.url) musicAudio.src = track.url;
  musicAudio.onended = () => { currentTrack = (currentTrack + 1) % musicList.length; initMusicPlayer(musicList); musicAudio.play().catch(() => {}); };
  $('#musicToggle')?.addEventListener('click', async () => { if (musicAudio.paused) { await musicAudio.play().catch(() => showIsland('音乐播放失败，请检查音频链接')); $('#musicToggle').textContent = '⏸'; showIsland(`播放：${track.title}`); } else { musicAudio.pause(); $('#musicToggle').textContent = '▶'; showIsland('音乐已暂停'); } });
  $('#musicPrev')?.addEventListener('click', () => { currentTrack = (currentTrack - 1 + musicList.length) % musicList.length; if (musicAudio) musicAudio.pause(); initMusicPlayer(musicList); });
  $('#musicNext')?.addEventListener('click', () => { currentTrack = (currentTrack + 1) % musicList.length; if (musicAudio) musicAudio.pause(); initMusicPlayer(musicList); });
}
function postCard(post, delay = 0) {
  const tags = (post.tags || []).map(t => `<a class="tag" href="${tagHref(t)}">${escapeHtml(tagLabel(t))}</a>`).join('');
  return `<article class="card article-card reveal-up in-view tilt-card" style="transition-delay:${delay}ms" data-tilt-strength="5" data-tilt-move="3">${post.cover ? `<a href="${postHref(post.slug)}"><img class="article-cover" src="${escapeHtml(post.cover)}" alt="${escapeHtml(post.title)}"></a>` : ''}<div class="article-body"><h2><a href="${postHref(post.slug)}">${escapeHtml(post.title)}</a></h2><div class="article-meta"><span>📅 ${fmtDate(post.created_at)}</span><a href="${categoryHref(post.category || '')}">📁 ${escapeHtml(post.category || '未分类')}</a><span>👁 ${post.views || 0}</span></div><p class="article-excerpt">${escapeHtml(post.excerpt || '这篇文章没有摘要。')}</p><div class="article-tags">${tags}</div></div></article>`;
}
function updateBrand(settings) {
  const brandText = settings.logo_text || settings.site_title || 'Argon Lite Blog';
  $('#brandText') && ($('#brandText').textContent = brandText);
  const wrap = $('#brandLogo');
  if (!wrap) return;
  wrap.innerHTML = settings.logo_url ? `<img class="brand-logo-img" src="${escapeHtml(settings.logo_url)}" alt="${escapeHtml(brandText)}">` : '<span class="brand-mark"></span>';
}
async function loadSite() {
  site = await api('/api/site');
  const s = site.settings || {};
  applyCustomStyles(s);
  applyModuleVisibility(s);
  updateBrand(s);
  $('#heroTitle') && ($('#heroTitle').textContent = s.hero_title || s.site_title || 'Argon Lite Blog');
  $('#heroText') && ($('#heroText').textContent = s.hero_text || s.site_subtitle || '');
  $('#authorName') && ($('#authorName').textContent = s.author_name || '站长');
  $('#authorBio') && ($('#authorBio').textContent = s.author_bio || '');
  $('#footerText') && ($('#footerText').textContent = s.footer_html || '© Argon Lite Blog');
  $('#statPosts') && ($('#statPosts').textContent = site.counts.posts);
  $('#statCategories') && ($('#statCategories').textContent = site.counts.categories);
  $('#statTags') && ($('#statTags').textContent = site.counts.tags);
  if (s.author_avatar && $('#avatar')) $('#avatar').style.backgroundImage = `url('${s.author_avatar}')`;
  applyLayoutMode(s.layout_mode || 'classic');
  // 默认跟随设备明暗模式：手机/电脑系统切到深色时自动使用 Night，浅色时使用后台设置的主题色。
  applyThemePreset(chooseThemeForDevice(s.theme_preset || 'hyper-blue'), false, false);
  renderHeaderNav(parseJsonArray(s.header_nav_links, defaultHeaderNav(), normalizeHeaderNav));
  renderHomeCards(parseJsonArray(s.home_cards, defaultHomeCards()));
  renderQuickNav(parseJsonArray(s.nav_links, defaultNavLinks(), normalizeNavLink));
  renderProjectShowcase(parseJsonArray(s.project_cards, defaultProjectCards(), normalizeProject));
  renderFriendLinks(parseJsonArray(s.friend_links, defaultFriendLinks(), normalizeFriend));
  initMusicPlayer(parseJsonArray(s.music_playlist, defaultMusicList(), normalizeTrack));
  renderTaxonomies(site.taxonomies || { categories: [], tags: [] });
  if (isModuleVisible('site_notice') && s.site_notice) showIsland(s.site_notice);
  setTitle();
}
function setTitle(title) {
  const base = site?.settings?.site_title || 'Argon Lite Blog';
  document.title = title ? `${title} - ${base}` : base;
  setMeta?.('meta[name="robots"]', 'content', '');
  setCanonical?.(absoluteUrl(location.pathname || '/'));
}
function setMeta(selector, attr, value) {
  let el = document.head.querySelector(selector);
  if (!value) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    const nameMatch = selector.match(/meta\[name="([^"]+)"\]/);
    const propertyMatch = selector.match(/meta\[property="([^"]+)"\]/);
    if (nameMatch) el.setAttribute('name', nameMatch[1]);
    if (propertyMatch) el.setAttribute('property', propertyMatch[1]);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}
function setCanonical(url = '') {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!url) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = url;
}
function absoluteUrl(path = '/') {
  try { return new URL(path || '/', location.origin).toString(); } catch { return location.href; }
}
function applySeo({ title = '', description = '', image = '', path = location.pathname, noindex = false } = {}) {
  const base = site?.settings?.site_title || 'Argon Lite Blog';
  const fullTitle = title ? `${title} - ${base}` : base;
  document.title = fullTitle;
  setMeta('meta[name="description"]', 'content', description || site?.settings?.site_subtitle || '');
  setMeta('meta[property="og:title"]', 'content', fullTitle);
  setMeta('meta[property="og:description"]', 'content', description || '');
  setMeta('meta[property="og:type"]', 'content', title ? 'article' : 'website');
  setMeta('meta[property="og:url"]', 'content', absoluteUrl(path));
  setMeta('meta[property="og:image"]', 'content', image ? absoluteUrl(image) : '');
  setMeta('meta[name="robots"]', 'content', noindex ? 'noindex,nofollow' : '');
  setCanonical(absoluteUrl(path));
}
function renderTaxonomies(tax) {
  const catWrap = $('#categoryList');
  const tagWrap = $('#tagList');
  if (catWrap) {
    toggleEl(catWrap.closest('.side-card'), isModuleVisible('categories'));
    catWrap.innerHTML = isModuleVisible('categories') ? (tax.categories?.length ? tax.categories.map(c => `<a class="chip" href="${categoryHref(c.name)}">${escapeHtml(c.name)} <small>${c.count}</small></a>`).join('') : '暂无分类') : '';
  }
  if (tagWrap) {
    toggleEl(tagWrap.closest('.side-card'), isModuleVisible('tags'));
    tagWrap.innerHTML = isModuleVisible('tags') ? (tax.tags?.length ? tax.tags.map(t => `<a class="chip" href="${tagHref(t.name)}">${escapeHtml(tagLabel(t.name))} <small>${t.count}</small></a>`).join('') : '暂无标签') : '';
  }
}
async function renderHome(extra = {}) {
  const params = new URLSearchParams(extra);
  const data = await api(`/api/posts?${params.toString()}`);
  const title = extra.search ? `搜索：${extra.search}` : extra.category ? `分类：${extra.category}` : extra.tag ? `标签：${extra.tag}` : '最新文章';
  setTitle(title === '最新文章' ? '' : title);
  app.innerHTML = `<h2 class="list-title reveal-up in-view">${escapeHtml(title)}</h2>${data.posts.length ? data.posts.map((post, i) => postCard(post, 40 * (i % 6))).join('') : '<div class="card empty reveal-up in-view">没有找到文章。</div>'}`;
  afterRender();
}
function buildToc() {
  const content = $('.post-content');
  if (!content) return '';
  const headings = [...content.querySelectorAll('h1, h2, h3')];
  if (!headings.length) return '';
  headings.forEach((h, i) => { h.id = `heading-${i}`; });
  return `<section class="card toc reveal-up in-view"><h3>文章目录</h3>${headings.map(h => `<a href="javascript:void(0)" data-toc="${h.id}">${'&nbsp;'.repeat((Number(h.tagName.slice(1)) - 1) * 2)}${escapeHtml(h.textContent)}</a>`).join('')}</section>`;
}
function commentListHtml(comments = []) {
  if (!comments.length) return '<p class="muted">还没有评论，来当第一个评论的人吧。</p>';
  return comments.map(c => `<div class="comment"><b>${escapeHtml(c.name)}</b><small class="muted">${fmtDate(c.created_at)}</small><p>${escapeHtml(c.content)}</p></div>`).join('');
}

async function refreshCommentCaptcha() {
  const form = $('#commentForm');
  if (!form) return;
  const msg = $('#captchaQuestion');
  const tokenInput = form.elements.captcha_token;
  try {
    const data = await api('/api/captcha');
    if (msg) msg.textContent = data.question || '请刷新验证码';
    if (tokenInput) tokenInput.value = data.token || '';
    if (form.elements.captcha_answer) form.elements.captcha_answer.value = '';
  } catch {
    if (msg) msg.textContent = '验证码加载失败，点刷新重试';
  }
}
async function renderPost(slug) {
  const { post } = await api(`/api/posts/${encodeURIComponent(slug)}`);
  const { posts: allPosts } = await api('/api/posts');
  const idx = allPosts.findIndex(p => p.slug === post.slug);
  const prevPost = idx >= 0 ? allPosts[idx + 1] : null;
  const nextPost = idx > 0 ? allPosts[idx - 1] : null;
  const licenseText = site?.settings?.license_text || '本文由站点作者原创或整理发布，转载请注明来源。';
  const tags = (post.tags || []).map(t => `<a class="tag" href="${tagHref(t)}">${escapeHtml(tagLabel(t))}</a>`).join('');
  applySeo({
    title: post.seo_title || post.title,
    description: post.seo_description || post.excerpt || '',
    image: post.seo_image || post.cover || '',
    path: postHref(post.slug),
    noindex: Boolean(post.seo_noindex)
  });
  const licenseHtml = isModuleVisible('license') ? `<section class="card license-box reveal-up in-view"><b>版权说明</b><p>${escapeHtml(licenseText)}</p></section>` : '';
  const navHtml = isModuleVisible('post_nav') ? `<section class="post-nav reveal-up in-view">${prevPost ? `<a class="card post-nav-card" href="${postHref(prevPost.slug)}"><small>上一篇</small><b>${escapeHtml(prevPost.title)}</b></a>` : '<span></span>'}${nextPost ? `<a class="card post-nav-card" href="${postHref(nextPost.slug)}"><small>下一篇</small><b>${escapeHtml(nextPost.title)}</b></a>` : '<span></span>'}</section>` : '';
  const commentsHtml = isModuleVisible('comments') ? `<section class="card comments reveal-up in-view"><h3>评论</h3><form id="commentForm" class="form-grid"><input type="hidden" name="post_id" value="${post.id}"><input type="hidden" name="captcha_token"><div class="two-col"><label>昵称<input name="name" required placeholder="怎么称呼你"></label><label>邮箱<input name="email" placeholder="可不填"></label></div><label>评论内容<textarea name="content" rows="4" required placeholder="写点什么吧"></textarea></label><div class="captcha-row"><div class="captcha-question"><span>验证码：</span><b id="captchaQuestion">加载中...</b></div><label class="captcha-answer">答案<input name="captcha_answer" inputmode="numeric" pattern="[0-9]*" required placeholder="填数字"></label><button id="refreshCaptchaBtn" class="ghost" type="button">刷新验证码</button></div><div class="button-row"><button class="primary" type="submit">提交评论</button></div><p id="commentMsg" class="message"></p></form><div id="commentList">${commentListHtml(post.comments || [])}</div></section>` : '';
  app.innerHTML = `<article class="card post-full reveal-up in-view">${post.cover ? `<img class="article-cover" src="${escapeHtml(post.cover)}" alt="${escapeHtml(post.title)}">` : ''}<header class="post-hero"><h1>${escapeHtml(post.title)}</h1><div class="article-meta" style="justify-content:center"><span>📅 ${fmtDate(post.created_at)}</span><a href="${categoryHref(post.category || '')}">📁 ${escapeHtml(post.category || '未分类')}</a><span>👁 ${post.views || 0}</span></div><div class="article-tags" style="justify-content:center">${tags}</div></header><div class="post-content">${renderMarkdown(post.content || '')}</div><div class="post-bottom">${buildToc()}${licenseHtml}${navHtml}${commentsHtml}</div></article>`;
  $('#commentForm')?.addEventListener('submit', async e => { e.preventDefault(); const payload = Object.fromEntries(new FormData(e.target).entries()); try { const data = await api('/api/comments', { method: 'POST', body: JSON.stringify(payload) }); $('#commentMsg').textContent = data.message || '评论已提交。'; $('#commentList').innerHTML = commentListHtml(data.comments || []); e.target.reset(); await refreshCommentCaptcha(); showIsland(data.status === 'pending' ? '评论等待审核' : '评论提交成功'); } catch (err) { $('#commentMsg').textContent = err.message; await refreshCommentCaptcha(); showIsland('评论提交失败'); } });
  $('#refreshCaptchaBtn')?.addEventListener('click', refreshCommentCaptcha);
  if (isModuleVisible('comments')) await refreshCommentCaptcha();
  $$('[data-toc]').forEach(a => a.addEventListener('click', () => document.getElementById(a.dataset.toc)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
  afterRender();
}
async function renderPage(slug) {
  const { page } = await api(`/api/pages/${encodeURIComponent(slug)}`);
  applySeo({ title: page.title, description: page.summary || '', image: page.cover || '', path: postHref(page.slug) });
  const template = ['standard', 'landing', 'narrow'].includes(page.template) ? page.template : 'standard';
  app.innerHTML = `<article class="card page-full reveal-up in-view template-${escapeHtml(template)}">${page.cover ? `<img class="article-cover" src="${escapeHtml(page.cover)}" alt="${escapeHtml(page.title)}">` : ''}<header class="page-hero"><small class="page-type-label">独立页面</small><h1>${escapeHtml(page.title)}</h1>${page.summary ? `<p class="muted">${escapeHtml(page.summary)}</p>` : ''}</header><div class="post-content page-content">${renderMarkdown(page.content || '')}</div><div class="post-bottom"><section class="card license-box reveal-up in-view"><b>页面说明</b><p>这是独立页面，不进入文章列表，也没有文章分类、标签和评论区。</p></section></div></article>`;
  afterRender();
}
async function renderContent(slug) {
  try { return await renderPage(slug); } catch (pageErr) { return await renderPost(slug); }
}
async function renderArchive() {
  const data = await api('/api/posts');
  setTitle('归档');
  app.innerHTML = `<section class="card article-body reveal-up in-view"><h1>文章归档</h1><p class="muted">按发布时间倒序排列。</p></section><div class="archive-grid">${data.posts.map((p, i) => `<a class="card archive-row reveal-up in-view tilt-card" style="transition-delay:${i * 35}ms" href="${postHref(p.slug)}"><span>${escapeHtml(p.title)}</span><small>${fmtDate(p.created_at)} · ${escapeHtml(p.category || '')}</small></a>`).join('')}</div>`;
  afterRender();
}
function observeReveal(root = document) {
  const els = $$('.reveal-up', root);
  if (!('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('in-view')); return; }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(entries => { entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('in-view'); revealObserver.unobserve(entry.target); } }); }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  }
  els.forEach(el => { if (!el.classList.contains('in-view')) revealObserver.observe(el); });
}
function initTiltCards(root = document) {
  if (IS_TOUCH_DEVICE || IS_MOBILE_TEMPLATE) return;
  $$('.tilt-card, .card, .card-lite, .summary-card, .project-card, .friend-card, .quick-nav-item, .archive-row, .post-nav-card', root).forEach(card => {
    if (!card.classList.contains('tilt-card')) { card.classList.add('tilt-card', 'tilt-soft-card'); }
    if (card.dataset.motionBound) return;
    card.dataset.motionBound = '1';
    const strength = Number(card.dataset.tiltStrength || (card.classList.contains('tilt-soft-card') ? 3 : 10));
    const move = Number(card.dataset.tiltMove || (card.classList.contains('tilt-soft-card') ? 2 : 6));
    const resetTilt = () => { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); card.style.setProperty('--tx', '0px'); card.style.setProperty('--ty', '0px'); card.style.setProperty('--shine-x', '50%'); card.style.setProperty('--shine-y', '50%'); };
    card.addEventListener('pointermove', e => { const rect = card.getBoundingClientRect(); const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)); const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)); card.style.setProperty('--rx', `${((0.5 - y) * strength).toFixed(2)}deg`); card.style.setProperty('--ry', `${((x - 0.5) * strength).toFixed(2)}deg`); card.style.setProperty('--tx', `${((x - 0.5) * move).toFixed(2)}px`); card.style.setProperty('--ty', `${((y - 0.5) * move).toFixed(2)}px`); card.style.setProperty('--shine-x', `${(x * 100).toFixed(1)}%`); card.style.setProperty('--shine-y', `${(y * 100).toFixed(1)}%`); });
    card.addEventListener('pointerleave', resetTilt); card.addEventListener('blur', resetTilt); resetTilt();
  });
}
function afterRender() {
  app.classList.remove('route-out'); app.classList.add('route-in'); window.setTimeout(() => app.classList.remove('route-in'), 520); observeReveal(app); initTiltCards(app);
}
function scrollToMainContent({ smooth = true } = {}) {
  requestAnimationFrame(() => {
    const target = document.querySelector('#app') || document.querySelector('.mobile-content') || document.body;
    const header = document.querySelector('.topbar') || document.querySelector('.mobile-topbar');
    const offset = (header?.offsetHeight || 0) + 14;
    const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - offset);
    window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  });
}

async function transitionTo(renderFn, options = {}) {
  app.classList.add('route-out');
  await new Promise(resolve => setTimeout(resolve, 120));
  await renderFn();
  if (options.scroll === 'content') scrollToMainContent({ smooth: true });
  else if (options.scroll === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
}
function cleanLegacyHash() {
  const hash = decodeURIComponent(location.hash || '');
  if (!hash.startsWith('#/')) return false;
  let path = '/';
  if (hash.startsWith('#/post/')) path = postHref(hash.replace('#/post/', ''));
  else if (hash.startsWith('#/page/')) path = postHref(hash.replace('#/page/', ''));
  else if (hash.startsWith('#/category/')) path = categoryHref(hash.replace('#/category/', ''));
  else if (hash.startsWith('#/tag/')) path = tagHref(hash.replace('#/tag/', ''));
  else if (hash.startsWith('#/search/')) path = `/search/${encodeURIComponent(hash.replace('#/search/', ''))}`;
  else if (hash === '#/archive') path = '/archive';
  history.replaceState({}, '', path);
  return true;
}
async function route() {
  cleanLegacyHash();
  const path = decodeURIComponent(location.pathname || '/').replace(/\/+$/, '') || '/';
  try {
    if (path === '/') return transitionTo(renderHome, { scroll: 'top' });
    if (path === '/archive') return transitionTo(renderArchive, { scroll: 'content' });
    if (path.startsWith('/category/')) return transitionTo(() => renderHome({ category: path.replace('/category/', '') }), { scroll: 'content' });
    if (path.startsWith('/tag/')) return transitionTo(() => renderHome({ tag: path.replace('/tag/', '') }), { scroll: 'content' });
    if (path.startsWith('/search/')) return transitionTo(() => renderHome({ search: path.replace('/search/', '') }), { scroll: 'content' });
    const slug = path.replace(/^\//, '');
    if (slug && !RESERVED.has(slug)) return transitionTo(() => renderContent(slug), { scroll: 'content' });
    return transitionTo(renderHome, { scroll: 'top' });
  } catch (err) {
    app.innerHTML = `<div class="card empty reveal-up in-view">${escapeHtml(err.message || '页面加载失败')}</div>`;
    showIsland('页面加载失败');
  }
}
function navigate(path) { history.pushState({}, '', path); route(); }
function bindInternalLinks() {
  document.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (!href.startsWith('/') || a.target || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href);
  });
  window.addEventListener('popstate', route);
}
function initTheme() {
  renderThemeMenu();
  applyThemePreset(chooseThemeForDevice('hyper-blue'), false, false);
  $('#themePaletteBtn')?.addEventListener('click', e => { e.stopPropagation(); $('#themeMenu')?.classList.toggle('hidden'); });
  document.addEventListener('click', e => { if (!e.target.closest('#themeMenu') && !e.target.closest('#themePaletteBtn')) $('#themeMenu')?.classList.add('hidden'); });
  $('#themeBtn')?.addEventListener('click', () => {
    markThemeManual();
    const dark = !document.documentElement.classList.contains('dark');
    applyThemePreset(dark ? 'night' : (site?.settings?.theme_preset || 'hyper-blue'), true);
  });
  bindSystemThemeListener();
}
function bindHeroMotion() {
  if (IS_TOUCH_DEVICE || IS_MOBILE_TEMPLATE) return;
  const hero = $('#heroSection'); if (!hero) return;
  hero.addEventListener('pointermove', e => { const rect = hero.getBoundingClientRect(); const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2; const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2; hero.style.setProperty('--mx', x.toFixed(3)); hero.style.setProperty('--my', y.toFixed(3)); });
  hero.addEventListener('pointerleave', () => { hero.style.setProperty('--mx', 0); hero.style.setProperty('--my', 0); });
}
function bindMouseAura() {
  if (IS_TOUCH_DEVICE || IS_MOBILE_TEMPLATE) return;
  const aura = $('#mouseAura'); if (!aura) return;
  window.addEventListener('pointermove', e => { document.body.classList.add('motion-ready'); aura.style.transform = `translate3d(${e.clientX - 180}px, ${e.clientY - 180}px, 0) scale(1)`; }, { passive: true });
}
function updateScrollProgress() {
  const progress = $('#scrollProgress'); const max = document.documentElement.scrollHeight - window.innerHeight; const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (window.scrollY / max) * 100)); if (progress) progress.style.width = `${pct}%`; $('#toTop')?.classList.toggle('show', scrollY > 500);
}
function bindUI() {
  $('#searchBtn')?.addEventListener('click', () => { const kw = $('#searchInput')?.value.trim(); if (kw) { showIsland(`搜索：${kw}`); navigate(`/search/${encodeURIComponent(kw)}`); } });
  $('#searchInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('#searchBtn')?.click(); });
  $('#toTop')?.addEventListener('click', () => { showIsland('回到顶部'); scrollTo({ top: 0, behavior: 'smooth' }); });
  window.addEventListener('scroll', updateScrollProgress, { passive: true });
}

initTheme();
bindUI();
bindHeroMotion();
bindMouseAura();
bindInternalLinks();
observeReveal(document);
initTiltCards(document);
updateScrollProgress();
await loadSite();
await route();
