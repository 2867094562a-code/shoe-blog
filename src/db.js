import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const JSON_DB_PATH = path.join(DATA_DIR, 'db.json');
const hasPostgres = Boolean(process.env.DATABASE_URL);
let pool;
let store;

const RESERVED_SLUGS = new Set([
  'api', 'admin', 'admin.html', 'archive', 'category', 'tag', 'search', 'uploads',
  'login', 'logout', 'settings', 'comments', 'pages', 'posts', 'assets', 'favicon.ico'
]);

function nowISO() {
  return new Date().toISOString();
}

function normalizeCategoryName(value) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
    .trim();
}

function normalizeTagName(value) {
  const body = String(value || '')
    .trim()
    .replace(/^#+/, '')
    .trim();
  return body ? `#${body}` : '';
}

function uniqueList(items = []) {
  const seen = new Set();
  const out = [];
  for (const raw of items) {
    const value = String(raw || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function parseMaybeJsonList(value, fallback = []) {
  if (Array.isArray(value)) return value;
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return raw.split(/[，,\n]/);
  }
}

function normalizeCategoryList(value) {
  return uniqueList(parseMaybeJsonList(value).map(normalizeCategoryName).filter(Boolean));
}

function normalizeTagList(value) {
  return uniqueList(parseMaybeJsonList(value).map(normalizeTagName).filter(Boolean));
}

function normalizeTags(tags) {
  const values = Array.isArray(tags) ? tags : String(tags || '').split(/[，,]/);
  return normalizeTagList(values).join(',');
}

function rowToPost(row) {
  if (!row) return null;
  return {
    ...row,
    tags: String(row.tags || '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean),
    views: Number(row.views || 0)
  };
}

function rowToPage(row) {
  if (!row) return null;
  return {
    ...row,
    sort_order: Number(row.sort_order || 0)
  };
}

function slugBase(input) {
  const s = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/\-+/g, '-')
    .replace(/^\-+|\-+$/g, '');
  return s || `post-${Date.now()}`;
}

export function createSlug(input) {
  return slugBase(input);
}

function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function pgAll(sql, params = []) {
  const result = await pool.query(convertPlaceholders(sql), params);
  return result.rows;
}

async function pgGet(sql, params = []) {
  const rows = await pgAll(sql, params);
  return rows[0] || null;
}

async function pgRun(sql, params = []) {
  const result = await pool.query(convertPlaceholders(sql), params);
  return { changes: result.rowCount, rows: result.rows };
}

async function saveStore() {
  if (hasPostgres) return;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(JSON_DB_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function baseStore() {
  return {
    settings: {},
    users: [],
    posts: [],
    comments: [],
    pages: [],
    seq: { users: 1, posts: 1, comments: 1, pages: 1 }
  };
}

async function loadStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  if (!fssync.existsSync(JSON_DB_PATH)) {
    store = baseStore();
    await saveStore();
    return;
  }
  const raw = await fs.readFile(JSON_DB_PATH, 'utf8');
  store = { ...baseStore(), ...JSON.parse(raw) };
  store.seq = { ...baseStore().seq, ...(store.seq || {}) };
}

async function createTables() {
  if (!hasPostgres) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      excerpt TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      cover TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '随笔',
      tags TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'published',
      views INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS pages (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      cover TEXT NOT NULL DEFAULT '',
      template TEXT NOT NULL DEFAULT 'standard',
      status TEXT NOT NULL DEFAULT 'published',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function seedSettings() {
  const defaults = {
    site_title: 'Argon Lite Blog',
    site_subtitle: '不依赖 WordPress 的轻博客模板',
    author_name: '站长',
    author_bio: '写设计、生活、灵感与技术。',
    author_avatar: '',
    logo_url: '',
    logo_text: 'Argon Lite Blog',
    footer_html: '© 2026 Argon Lite Blog. Independent Argon-style implementation.',
    hero_title: '轻盈、清爽、适合个人博客',
    hero_text: '这个版本保留 Argon 类博客的卡片、侧栏、标签、夜间模式和文章阅读体验，但完全脱离 WordPress。',
    theme_preset: 'hyper-blue',
    layout_mode: 'classic',
    home_cards: JSON.stringify([
      { label: 'Markdown', title: '实时预览', text: '后台写作时边写边看，适合快速发布文章。', icon: '✍️', link: '' },
      { label: '页面系统', title: '文章 / 页面分离', text: '文章进博客流，页面做关于我、联系页或专题页。', icon: '📄', link: '/about' },
      { label: '图片上传', title: '封面 / Logo / 头像', text: '支持上传封面图、正文图、网站 Logo 和头像。', icon: '🖼️', link: '' }
    ]),
    site_notice: '欢迎来到我的独立博客，后台可编辑公告、导航、友链、项目卡片和音乐列表。',
    nav_links: JSON.stringify([
      { title: '关于我', desc: '独立页面示例', icon: '👋', link: '/about' },
      { title: '作品集', desc: '鞋类设计、建模和视觉作品', icon: '👟', link: '/category/设计' },
      { title: '建站记录', desc: '部署、功能更新与踩坑记录', icon: '🧩', link: '/category/建站' }
    ]),
    header_nav_links: JSON.stringify([
      { title: '首页', link: '/' },
      { title: '归档', link: '/archive' },
      { title: '关于我', link: '/about' }
    ]),
    friend_links: JSON.stringify([
      { name: 'RyuChan', desc: '借鉴其配置、写作和卡片化思路', avatar: '', link: 'https://github.com/kobaridev/RyuChan' },
      { name: '我的小店', desc: '校园鞋店与作品展示入口', avatar: '', link: '#' }
    ]),
    project_cards: JSON.stringify([
      { title: '校园鞋店 Vlog', desc: '记录从收拾店铺到正式营业的过程。', image: '', tags: 'Vlog,校园,鞋店', link: '#' },
      { title: '鞋类设计作品集', desc: '展示鞋底、鞋面、材料标注与渲染。', image: '', tags: '鞋类设计,作品集,渲染', link: '#' }
    ]),
    music_playlist: JSON.stringify([
      { title: '示例音乐', artist: '本地/外链音频', url: '', cover: '' }
    ]),
    license_text: '本文由站点作者原创或整理发布，转载请注明来源。',
    video_embed_css: '.video-embed iframe { border: 0; }',
    custom_css: '',
    taxonomy_categories: JSON.stringify(['建站', '设计', '教程', '随笔']),
    taxonomy_tags: JSON.stringify(['#WordPress', '#全栈', '#部署', '#UI', '#博客', '#Argon']),
    module_visibility: JSON.stringify({
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
    })
  };
  if (hasPostgres) {
    for (const [key, value] of Object.entries(defaults)) {
      const existing = await pgGet('SELECT key FROM settings WHERE key = ?', [key]);
      if (!existing) await pgRun('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
    return;
  }
  store.settings = { ...defaults, ...(store.settings || {}) };
  await saveStore();
}

async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123456';
  if (hasPostgres) {
    const existing = await pgGet('SELECT id FROM users WHERE username = ?', [username]);
    if (!existing) {
      const hash = await bcrypt.hash(password, 10);
      await pgRun('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)', [username, hash, nowISO()]);
    }
    return;
  }
  if (!store.users.some(u => u.username === username)) {
    const hash = await bcrypt.hash(password, 10);
    store.users.push({ id: store.seq.users++, username, password_hash: hash, created_at: nowISO() });
    await saveStore();
  }
}

async function insertSeedPost(p) {
  const record = {
    id: store.seq.posts++,
    title: p.title,
    slug: p.slug,
    excerpt: p.excerpt,
    content: p.content,
    cover: p.cover,
    category: p.category,
    tags: p.tags,
    status: 'published',
    views: Math.floor(Math.random() * 200),
    created_at: nowISO(),
    updated_at: nowISO()
  };
  store.posts.push(record);
}

async function seedPosts() {
  if (hasPostgres) {
    const count = await pgGet('SELECT COUNT(*) AS count FROM posts', []);
    if (Number(count?.count || 0) > 0) return;
  } else if (store.posts.length > 0) {
    return;
  }

  const seed = [
    {
      title: '从 WordPress 主题迁移到独立网站',
      slug: 'move-away-from-wordpress',
      category: '建站',
      tags: 'WordPress,全栈,部署',
      cover: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1400&q=80',
      excerpt: '把原来依赖 WordPress 的博客，拆成前端页面、后端接口和数据库三部分。',
      content: `# 从 WordPress 主题迁移到独立网站\n\n这个模板把博客拆成三块：\n\n- **前端**：负责页面、动画、夜间模式和交互。\n- **后端**：负责文章接口、登录、评论和后台管理。\n- **数据库**：本地默认 JSON 文件，部署时可以换成 PostgreSQL。\n\n## 为什么这样做\n\nWordPress 很方便，但如果你只是想做一个轻量的个人站，独立前后端会更容易部署、二次开发和接入自己的业务。\n\n> 这个项目没有直接复制 WordPress 主题代码，而是重新实现了类似的视觉结构。`
    },
    {
      title: 'Argon 风格页面由哪些部分组成',
      slug: 'argon-style-layout',
      category: '设计',
      tags: 'UI,博客,Argon',
      cover: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=80',
      excerpt: '顶部大横幅、圆角卡片、左侧站点概览、文章列表、标签和阅读页，是这种风格的核心。',
      content: `# Argon 风格页面由哪些部分组成\n\n常见结构如下：\n\n1. 顶部渐变 Banner。\n2. 白色或半透明卡片。\n3. 个人信息侧栏。\n4. 文章摘要列表。\n5. 文章详情页的目录、标签和评论。\n\n## 可继续增强的地方\n\n你可以加：友链页、说说页、相册页、文章归档、搜索高亮和图片上传。`
    },
    {
      title: '小白部署路线：先跑起来，再上线',
      slug: 'beginner-deploy-roadmap',
      category: '教程',
      tags: '部署,GitHub,Render,Supabase',
      cover: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1400&q=80',
      excerpt: '不要一上来就纠结服务器，先本地运行，再传 GitHub，最后接数据库和域名。',
      content: `# 小白部署路线：先跑起来，再上线\n\n第一步只要会打开终端，运行：\n\n\`\`\`bash\nnpm install\nnpm start\n\`\`\`\n\n然后打开浏览器访问：\n\n\`\`\`text\nhttp://localhost:3000\n\`\`\`\n\n后台地址：\n\n\`\`\`text\nhttp://localhost:3000/你设置的隐藏后台路径\n\`\`\`\n\n默认账号看 README，正式部署前一定要改密码。`
    }
  ];

  if (hasPostgres) {
    for (const p of seed) {
      await pgRun(
        'INSERT INTO posts (title, slug, excerpt, content, cover, category, tags, status, views, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [p.title, p.slug, p.excerpt, p.content, p.cover, p.category, p.tags, 'published', Math.floor(Math.random() * 200), nowISO(), nowISO()]
      );
    }
  } else {
    for (const p of seed) await insertSeedPost(p);
    await saveStore();
  }
}

async function seedPages() {
  if (hasPostgres) {
    const count = await pgGet('SELECT COUNT(*) AS count FROM pages', []);
    if (Number(count?.count || 0) > 0) return;
    await pgRun(
      'INSERT INTO pages (title, slug, summary, content, cover, template, status, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['关于我', 'about', '一个独立页面示例，不进入文章列表。', '# 关于我\n\n这里是一个页面，不是文章。你可以用它做个人介绍、店铺介绍、联系页或作品集目录。\n\n- 页面不会进入文章列表\n- 页面没有文章分类和评论\n- 后台有独立的实时预览', '', 'standard', 'published', 1, nowISO(), nowISO()]
    );
    return;
  }
  if (store.pages.length > 0) return;
  store.pages.push({
    id: store.seq.pages++,
    title: '关于我',
    slug: 'about',
    summary: '一个独立页面示例，不进入文章列表。',
    content: '# 关于我\n\n这里是一个页面，不是文章。你可以用它做个人介绍、店铺介绍、联系页或作品集目录。\n\n- 页面不会进入文章列表\n- 页面没有文章分类和评论\n- 后台有独立的实时预览',
    cover: '',
    template: 'standard',
    status: 'published',
    sort_order: 1,
    created_at: nowISO(),
    updated_at: nowISO()
  });
  await saveStore();
}

export async function initDb() {
  if (hasPostgres) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined
    });
    await createTables();
  } else {
    await loadStore();
  }
  await seedSettings();
  await seedAdmin();
  await seedPosts();
  await seedPages();
}

export async function getSettingsObject() {
  if (hasPostgres) {
    const rows = await pgAll('SELECT key, value FROM settings ORDER BY key', []);
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }
  return { ...store.settings };
}

export async function updateSettingsObject(data) {
  const allowed = ['site_title', 'site_subtitle', 'author_name', 'author_bio', 'author_avatar', 'logo_url', 'logo_text', 'footer_html', 'hero_title', 'hero_text', 'theme_preset', 'layout_mode', 'home_cards', 'site_notice', 'header_nav_links', 'nav_links', 'friend_links', 'project_cards', 'music_playlist', 'license_text', 'video_embed_css', 'custom_css', 'taxonomy_categories', 'taxonomy_tags', 'module_visibility'];
  if (Object.prototype.hasOwnProperty.call(data, 'taxonomy_categories')) data.taxonomy_categories = JSON.stringify(normalizeCategoryList(data.taxonomy_categories));
  if (Object.prototype.hasOwnProperty.call(data, 'taxonomy_tags')) data.taxonomy_tags = JSON.stringify(normalizeTagList(data.taxonomy_tags));
  if (hasPostgres) {
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        await pgRun('UPDATE settings SET value = ? WHERE key = ?', [String(data[key] ?? ''), key]);
      }
    }
    return getSettingsObject();
  }
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(data, key)) store.settings[key] = String(data[key] ?? '');
  }
  await saveStore();
  return getSettingsObject();
}

async function updateSettingKey(key, value) {
  if (hasPostgres) {
    const existing = await pgGet('SELECT key FROM settings WHERE key = ?', [key]);
    if (existing) await pgRun('UPDATE settings SET value = ? WHERE key = ?', [value, key]);
    else await pgRun('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
    return;
  }
  store.settings[key] = value;
}

async function syncTaxonomySettings(category, tags) {
  const current = await getSettingsObject();
  const categories = normalizeCategoryList(current.taxonomy_categories);
  const tagList = normalizeTagList(current.taxonomy_tags);
  const categoryName = normalizeCategoryName(category);
  const tagNames = normalizeTagList(tags);
  const nextCategories = uniqueList([...categories, categoryName].filter(Boolean));
  const nextTags = uniqueList([...tagList, ...tagNames].filter(Boolean));
  const nextCatJson = JSON.stringify(nextCategories);
  const nextTagJson = JSON.stringify(nextTags);
  if (nextCatJson !== String(current.taxonomy_categories || '')) await updateSettingKey('taxonomy_categories', nextCatJson);
  if (nextTagJson !== String(current.taxonomy_tags || '')) await updateSettingKey('taxonomy_tags', nextTagJson);
  if (!hasPostgres) await saveStore();
}

export async function getCounts() {
  if (hasPostgres) {
    const posts = await pgGet("SELECT COUNT(*) AS count FROM posts WHERE status = 'published'", []);
    const rows = await pgAll("SELECT category, tags FROM posts WHERE status = 'published'", []);
    const categorySet = new Set(rows.map(r => r.category).filter(Boolean));
    const tagSet = new Set();
    rows.forEach(r => String(r.tags || '').split(',').map(t => t.trim()).filter(Boolean).forEach(t => tagSet.add(t)));
    return { posts: Number(posts?.count || 0), categories: categorySet.size, tags: tagSet.size };
  }
  const published = store.posts.filter(p => p.status === 'published');
  const categorySet = new Set(published.map(p => p.category).filter(Boolean));
  const tagSet = new Set();
  published.forEach(p => String(p.tags || '').split(',').map(t => t.trim()).filter(Boolean).forEach(t => tagSet.add(t)));
  return { posts: published.length, categories: categorySet.size, tags: tagSet.size };
}

export async function listPosts({ search = '', category = '', tag = '', includeDrafts = false } = {}) {
  if (hasPostgres) {
    const clauses = [];
    const params = [];
    if (!includeDrafts) clauses.push("status = 'published'");
    if (search) {
      clauses.push('(title ILIKE ? OR excerpt ILIKE ? OR content ILIKE ?)');
      const kw = `%${search}%`;
      params.push(kw, kw, kw);
    }
    if (category) { clauses.push('category = ?'); params.push(normalizeCategoryName(category)); }
    if (tag) { clauses.push('tags ILIKE ?'); params.push(`%${normalizeTagName(tag)}%`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await pgAll(`SELECT id, title, slug, excerpt, cover, category, tags, status, views, created_at, updated_at FROM posts ${where} ORDER BY created_at DESC`, params);
    return rows.map(rowToPost);
  }
  const kw = String(search || '').toLowerCase();
  return store.posts
    .filter(p => includeDrafts || p.status === 'published')
    .filter(p => !kw || `${p.title} ${p.excerpt} ${p.content}`.toLowerCase().includes(kw))
    .filter(p => !category || p.category === normalizeCategoryName(category))
    .filter(p => !tag || normalizeTagList(p.tags).includes(normalizeTagName(tag)))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map(p => rowToPost({ ...p, content: undefined }));
}

export async function getPostBySlug(slug, includeDraft = false) {
  if (hasPostgres) {
    const post = await pgGet(`SELECT * FROM posts WHERE slug = ? ${includeDraft ? '' : "AND status = 'published'"}`, [slug]);
    if (!post) return null;
    await pgRun('UPDATE posts SET views = views + 1 WHERE id = ?', [post.id]);
    const comments = await pgAll('SELECT id, name, content, created_at FROM comments WHERE post_id = ? ORDER BY created_at DESC', [post.id]);
    return { ...rowToPost({ ...post, views: Number(post.views || 0) + 1 }), comments };
  }
  const post = store.posts.find(p => p.slug === slug && (includeDraft || p.status === 'published'));
  if (!post) return null;
  post.views = Number(post.views || 0) + 1;
  await saveStore();
  const comments = store.comments.filter(c => Number(c.post_id) === Number(post.id)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return { ...rowToPost(post), comments };
}

export async function getPostById(id) {
  if (hasPostgres) {
    const post = await pgGet('SELECT * FROM posts WHERE id = ?', [id]);
    return rowToPost(post);
  }
  const post = store.posts.find(p => Number(p.id) === Number(id));
  return rowToPost(post);
}

export async function listTaxonomies() {
  const posts = hasPostgres
    ? await pgAll("SELECT category, tags FROM posts WHERE status = 'published'", [])
    : store.posts.filter(p => p.status === 'published');
  const settings = await getSettingsObject();
  const categoryMap = new Map();
  const tagMap = new Map();
  normalizeCategoryList(settings.taxonomy_categories).forEach(name => categoryMap.set(name, 0));
  normalizeTagList(settings.taxonomy_tags).forEach(name => tagMap.set(name, 0));
  for (const p of posts) {
    const categoryName = normalizeCategoryName(p.category);
    if (categoryName) categoryMap.set(categoryName, (categoryMap.get(categoryName) || 0) + 1);
    normalizeTagList(p.tags).forEach(t => tagMap.set(t, (tagMap.get(t) || 0) + 1));
  }
  return {
    categories: Array.from(categoryMap, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans-CN')),
    tags: Array.from(tagMap, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans-CN'))
  };
}

export async function createComment({ post_id, name, email = '', content }) {
  if (hasPostgres) {
    const post = await pgGet('SELECT id FROM posts WHERE id = ? AND status = ?', [post_id, 'published']);
    if (!post) throw new Error('文章不存在');
    await pgRun('INSERT INTO comments (post_id, name, email, content, created_at) VALUES (?, ?, ?, ?, ?)', [post_id, name, email, content, nowISO()]);
    return pgAll('SELECT id, name, content, created_at FROM comments WHERE post_id = ? ORDER BY created_at DESC', [post_id]);
  }
  const post = store.posts.find(p => Number(p.id) === Number(post_id) && p.status === 'published');
  if (!post) throw new Error('文章不存在');
  store.comments.push({ id: store.seq.comments++, post_id: Number(post_id), name, email, content, created_at: nowISO() });
  await saveStore();
  return store.comments.filter(c => Number(c.post_id) === Number(post_id)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function findUser(username) {
  if (hasPostgres) return pgGet('SELECT * FROM users WHERE username = ?', [username]);
  return store.users.find(u => u.username === username) || null;
}

async function ensureUniqueSlug(base, ignoreId = null) {
  const root = slugBase(base);
  let slug = RESERVED_SLUGS.has(root) ? `${root}-post` : root;
  let i = 2;
  while (true) {
    const existingPost = hasPostgres
      ? await pgGet('SELECT id FROM posts WHERE slug = ?', [slug])
      : store.posts.find(p => p.slug === slug);
    const existingPage = hasPostgres
      ? await pgGet('SELECT id FROM pages WHERE slug = ?', [slug])
      : store.pages.find(p => p.slug === slug);
    if ((!existingPost || String(existingPost.id) === String(ignoreId)) && !existingPage) return slug;
    slug = `${root}-${i++}`;
  }
}

export async function createPost(data) {
  const title = String(data.title || '').trim();
  if (!title) throw new Error('标题不能为空');
  const slug = await ensureUniqueSlug(data.slug || title);
  const post = {
    title,
    slug,
    excerpt: String(data.excerpt || ''),
    content: String(data.content || ''),
    cover: String(data.cover || ''),
    category: normalizeCategoryName(data.category || '随笔'),
    tags: normalizeTags(data.tags),
    status: data.status === 'draft' ? 'draft' : 'published',
    views: 0,
    created_at: nowISO(),
    updated_at: nowISO()
  };
  if (hasPostgres) {
    const rows = await pgRun('INSERT INTO posts (title, slug, excerpt, content, cover, category, tags, status, views, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *', [post.title, post.slug, post.excerpt, post.content, post.cover, post.category, post.tags, post.status, post.views, post.created_at, post.updated_at]);
    await syncTaxonomySettings(post.category, post.tags);
    return rowToPost(rows.rows[0]);
  }
  post.id = store.seq.posts++;
  store.posts.push(post);
  await syncTaxonomySettings(post.category, post.tags);
  await saveStore();
  return rowToPost(post);
}

export async function updatePost(id, data) {
  const current = await getPostById(id);
  if (!current) throw new Error('文章不存在');
  const nextTitle = String(data.title ?? current.title).trim();
  if (!nextTitle) throw new Error('标题不能为空');
  const nextSlug = await ensureUniqueSlug(data.slug || current.slug || nextTitle, id);
  const updated = {
    title: nextTitle,
    slug: nextSlug,
    excerpt: String(data.excerpt ?? current.excerpt ?? ''),
    content: String(data.content ?? current.content ?? ''),
    cover: String(data.cover ?? current.cover ?? ''),
    category: normalizeCategoryName(data.category ?? current.category ?? '随笔'),
    tags: normalizeTags(data.tags ?? current.tags),
    status: data.status === 'draft' ? 'draft' : 'published',
    updated_at: nowISO()
  };
  if (hasPostgres) {
    const rows = await pgRun('UPDATE posts SET title = ?, slug = ?, excerpt = ?, content = ?, cover = ?, category = ?, tags = ?, status = ?, updated_at = ? WHERE id = ? RETURNING *', [updated.title, updated.slug, updated.excerpt, updated.content, updated.cover, updated.category, updated.tags, updated.status, updated.updated_at, id]);
    await syncTaxonomySettings(updated.category, updated.tags);
    return rowToPost(rows.rows[0]);
  }
  const idx = store.posts.findIndex(p => Number(p.id) === Number(id));
  store.posts[idx] = { ...store.posts[idx], ...updated };
  await syncTaxonomySettings(updated.category, updated.tags);
  await saveStore();
  return rowToPost(store.posts[idx]);
}

export async function deletePost(id) {
  if (hasPostgres) {
    await pgRun('DELETE FROM posts WHERE id = ?', [id]);
  } else {
    store.posts = store.posts.filter(p => Number(p.id) !== Number(id));
    store.comments = store.comments.filter(c => Number(c.post_id) !== Number(id));
    await saveStore();
  }
  return { ok: true };
}


async function ensureUniquePageSlug(base, ignoreId = null) {
  const root = slugBase(base);
  let slug = RESERVED_SLUGS.has(root) ? `${root}-page` : root;
  let i = 2;
  while (true) {
    const existingPage = hasPostgres
      ? await pgGet('SELECT id FROM pages WHERE slug = ?', [slug])
      : store.pages.find(p => p.slug === slug);
    const existingPost = hasPostgres
      ? await pgGet('SELECT id FROM posts WHERE slug = ?', [slug])
      : store.posts.find(p => p.slug === slug);
    if ((!existingPage || String(existingPage.id) === String(ignoreId)) && !existingPost) return slug;
    slug = `${root}-${i++}`;
  }
}

export async function listPages({ includeDrafts = false } = {}) {
  if (hasPostgres) {
    const rows = await pgAll(`SELECT id, title, slug, summary, cover, template, status, sort_order, created_at, updated_at FROM pages ${includeDrafts ? '' : "WHERE status = 'published'"} ORDER BY sort_order ASC, created_at DESC`, []);
    return rows.map(rowToPage);
  }
  return store.pages
    .filter(p => includeDrafts || p.status === 'published')
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || new Date(b.created_at) - new Date(a.created_at))
    .map(p => rowToPage({ ...p, content: undefined }));
}

export async function getPageBySlug(slug, includeDraft = false) {
  if (hasPostgres) {
    const page = await pgGet(`SELECT * FROM pages WHERE slug = ? ${includeDraft ? '' : "AND status = 'published'"}`, [slug]);
    return rowToPage(page);
  }
  const page = store.pages.find(p => p.slug === slug && (includeDraft || p.status === 'published'));
  return rowToPage(page);
}

export async function getPageById(id) {
  if (hasPostgres) {
    const page = await pgGet('SELECT * FROM pages WHERE id = ?', [id]);
    return rowToPage(page);
  }
  const page = store.pages.find(p => Number(p.id) === Number(id));
  return rowToPage(page);
}

export async function createPage(data) {
  const title = String(data.title || '').trim();
  if (!title) throw new Error('页面标题不能为空');
  const slug = await ensureUniquePageSlug(data.slug || title);
  const page = {
    title,
    slug,
    summary: String(data.summary || ''),
    content: String(data.content || ''),
    cover: String(data.cover || ''),
    template: ['standard', 'landing', 'narrow'].includes(data.template) ? data.template : 'standard',
    status: data.status === 'draft' ? 'draft' : 'published',
    sort_order: Number(data.sort_order || 0),
    created_at: nowISO(),
    updated_at: nowISO()
  };
  if (hasPostgres) {
    const rows = await pgRun('INSERT INTO pages (title, slug, summary, content, cover, template, status, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *', [page.title, page.slug, page.summary, page.content, page.cover, page.template, page.status, page.sort_order, page.created_at, page.updated_at]);
    return rowToPage(rows.rows[0]);
  }
  page.id = store.seq.pages++;
  store.pages.push(page);
  await saveStore();
  return rowToPage(page);
}

export async function updatePage(id, data) {
  const current = await getPageById(id);
  if (!current) throw new Error('页面不存在');
  const nextTitle = String(data.title ?? current.title).trim();
  if (!nextTitle) throw new Error('页面标题不能为空');
  const updated = {
    title: nextTitle,
    slug: await ensureUniquePageSlug(data.slug || current.slug || nextTitle, id),
    summary: String(data.summary ?? current.summary ?? ''),
    content: String(data.content ?? current.content ?? ''),
    cover: String(data.cover ?? current.cover ?? ''),
    template: ['standard', 'landing', 'narrow'].includes(data.template) ? data.template : (current.template || 'standard'),
    status: data.status === 'draft' ? 'draft' : 'published',
    sort_order: Number(data.sort_order ?? current.sort_order ?? 0),
    updated_at: nowISO()
  };
  if (hasPostgres) {
    const rows = await pgRun('UPDATE pages SET title = ?, slug = ?, summary = ?, content = ?, cover = ?, template = ?, status = ?, sort_order = ?, updated_at = ? WHERE id = ? RETURNING *', [updated.title, updated.slug, updated.summary, updated.content, updated.cover, updated.template, updated.status, updated.sort_order, updated.updated_at, id]);
    return rowToPage(rows.rows[0]);
  }
  const idx = store.pages.findIndex(p => Number(p.id) === Number(id));
  store.pages[idx] = { ...store.pages[idx], ...updated };
  await saveStore();
  return rowToPage(store.pages[idx]);
}

export async function deletePage(id) {
  if (hasPostgres) {
    await pgRun('DELETE FROM pages WHERE id = ?', [id]);
  } else {
    store.pages = store.pages.filter(p => Number(p.id) !== Number(id));
    await saveStore();
  }
  return { ok: true };
}


export async function listComments({ limit = 300 } = {}) {
  const safeLimit = Math.min(1000, Math.max(1, Number(limit) || 300));
  if (hasPostgres) {
    const rows = await pgAll(`
      SELECT c.id, c.post_id, c.name, c.email, c.content, c.created_at,
             p.title AS post_title, p.slug AS post_slug
      FROM comments c
      LEFT JOIN posts p ON p.id = c.post_id
      ORDER BY c.created_at DESC
      LIMIT ?
    `, [safeLimit]);
    return rows.map(r => ({
      id: r.id,
      post_id: r.post_id,
      name: r.name,
      email: r.email || '',
      content: r.content,
      created_at: r.created_at,
      post_title: r.post_title || '已删除文章',
      post_slug: r.post_slug || ''
    }));
  }
  return store.comments
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, safeLimit)
    .map(c => {
      const post = store.posts.find(p => Number(p.id) === Number(c.post_id));
      return {
        ...c,
        email: c.email || '',
        post_title: post?.title || '已删除文章',
        post_slug: post?.slug || ''
      };
    });
}

export async function deleteComment(id) {
  if (hasPostgres) {
    await pgRun('DELETE FROM comments WHERE id = ?', [id]);
  } else {
    store.comments = store.comments.filter(c => Number(c.id) !== Number(id));
    await saveStore();
  }
  return { ok: true };
}
