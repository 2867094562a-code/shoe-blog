import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  initDb,
  getSettingsObject,
  updateSettingsObject,
  getCounts,
  listPosts,
  getPostBySlug,
  getPostById,
  listTaxonomies,
  createComment,
  findUser,
  createPost,
  updatePost,
  deletePost,
  likePost,
  listPages,
  getPageBySlug,
  getPageById,
  createPage,
  updatePage,
  deletePage,
  deleteComment,
  updateCommentStatus,
  listComments,
  recordVisit,
  getVisitStats,
  exportBackup,
  importBackup
} from './db.js';
import { uploadImage } from './storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);
const DEFAULT_JWT_SECRET = 'dev-only-secret-change-me';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
const COOKIE_NAME = 'argon_lite_token';
const rawAdminPath = String(process.env.ADMIN_PATH || '/console-7f92x').trim();
const ADMIN_PATH = rawAdminPath.startsWith('/') ? rawAdminPath : `/${rawAdminPath}`;
const ADMIN_PATH_ALT = ADMIN_PATH.endsWith('/') ? ADMIN_PATH.slice(0, -1) : `${ADMIN_PATH}/`;
const ADMIN_HTML_FILE = path.join(__dirname, '../private/admin.html');
const DESKTOP_HTML_FILE = path.join(__dirname, '../public/index.html');
const MOBILE_HTML_FILE = path.join(__dirname, '../public/mobile.html');
const commentRateMap = new Map();

function validateProductionEnv() {
  if (process.env.NODE_ENV !== 'production') return;
  const missing = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEFAULT_JWT_SECRET) missing.push('JWT_SECRET');
  if (!process.env.ADMIN_USERNAME) missing.push('ADMIN_USERNAME');
  if (!process.env.ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');
  if (missing.length) {
    throw new Error(`生产环境缺少必要配置：${missing.join(', ')}。请在部署平台环境变量中设置后再启动。`);
  }
}

class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function isMobileUserAgent(req) {
  const ua = String(req.headers['user-agent'] || '').toLowerCase();
  if (req.query?.view === 'desktop') return false;
  if (req.query?.view === 'mobile') return true;
  return /android|iphone|ipod|ipad|mobile|windows phone|harmonyos|miuibrowser|huaweibrowser|ucbrowser|quark|mqqbrowser/.test(ua);
}

function serveFrontEntry(req, res) {
  res.setHeader('Vary', 'User-Agent');
  if (req.method === 'GET') recordVisit(req.path).catch(err => console.error('visit stat failed:', err.message));
  res.sendFile(isMobileUserAgent(req) ? MOBILE_HTML_FILE : DESKTOP_HTML_FILE);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 5) * 1024 * 1024 }
});

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header.split(';').map(v => v.trim()).filter(Boolean).map(pair => {
      const idx = pair.indexOf('=');
      return [decodeURIComponent(pair.slice(0, idx)), decodeURIComponent(pair.slice(idx + 1))];
    })
  );
}

function sendAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}${isProd ? '; Secure' : ''}`);
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function currentUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: '请先登录后台' });
  req.user = user;
  next();
}

function safeString(value, max = 20000) {
  return String(value ?? '').trim().slice(0, max);
}

function makeCaptcha() {
  const a = Math.floor(Math.random() * 8) + 2;
  const b = Math.floor(Math.random() * 8) + 2;
  const useMinus = Math.random() < 0.28;
  const left = useMinus ? Math.max(a, b) : a;
  const right = useMinus ? Math.min(a, b) : b;
  const answer = useMinus ? left - right : left + right;
  const question = useMinus ? `${left} - ${right} = ?` : `${left} + ${right} = ?`;
  const token = jwt.sign({ type: 'comment-captcha', answer }, JWT_SECRET, { expiresIn: '10m' });
  return { question, token };
}

function verifyCaptcha(token, answer) {
  if (!token || answer == null) throw new HttpError('请先完成验证码', 400);
  let payload;
  try {
    payload = jwt.verify(String(token), JWT_SECRET);
  } catch {
    throw new HttpError('验证码已过期，请刷新验证码', 400);
  }
  if (payload?.type !== 'comment-captcha') throw new HttpError('验证码无效，请刷新验证码', 400);
  const normalized = String(answer).trim();
  if (!/^\d+$/.test(normalized) || Number(normalized) !== Number(payload.answer)) {
    throw new HttpError('验证码错误，请重新输入', 400);
  }
}

function checkCommentRate(req) {
  const key = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxCount = 5;
  const history = (commentRateMap.get(key) || []).filter(ts => now - ts < windowMs);
  if (history.length >= maxCount) throw new HttpError('评论太频繁，请稍后再试', 429);
  history.push(now);
  commentRateMap.set(key, history);
}

function splitModerationList(value = '') {
  return String(value || '')
    .split(/[\n,，]/)
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.ip || '')
    .split(',')[0]
    .trim();
}

function includesAny(text = '', words = []) {
  const body = String(text || '').toLowerCase();
  return words.find(word => word && body.includes(word)) || '';
}

function moderateComment({ settings, name, email, content, ip }) {
  const enabled = String(settings.comment_moderation_enabled ?? 'true') !== 'false';
  if (!enabled) return { status: 'approved', reason: '' };
  const badWords = splitModerationList(settings.comment_bad_words);
  const blacklist = splitModerationList(settings.comment_blacklist);
  const identity = `${name} ${email} ${ip}`.toLowerCase();
  const blockedBy = includesAny(identity, blacklist);
  if (blockedBy) throw new HttpError('评论提交失败，请检查昵称、邮箱或稍后再试', 403);
  const hit = includesAny(`${name} ${email} ${content}`, badWords);
  if (hit) return { status: 'pending', reason: `命中违禁词：${hit}` };
  return { status: 'approved', reason: '' };
}

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: '10mb' }));

// 隐藏后台入口：默认不暴露 /admin 和 /admin.html。
app.get(['/admin', '/admin/', '/admin.html'], (req, res) => {
  res.status(404).type('text/plain').send('Not Found');
});

app.get([ADMIN_PATH, ADMIN_PATH_ALT], (req, res) => {
  res.sendFile(ADMIN_HTML_FILE);
});

// 前台入口按 User-Agent 选择桌面模板或手机模板。
app.get(['/', '/index.html'], serveFrontEntry);

app.use('/css', express.static(path.join(__dirname, '../public/css'), {
  maxAge: '1h'
}));

app.use('/js', express.static(path.join(__dirname, '../public/js'), {
  maxAge: '1h'
}));

app.use('/uploads', express.static(path.join(__dirname, '../public/uploads'), {
  maxAge: '30d'
}));

app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: 0
}));

app.get('/api/health', async (req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), adminPathConfigured: true });
});

app.get('/api/site', async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    const [settings, counts, taxonomies] = await Promise.all([getSettingsObject(), getCounts(), listTaxonomies()]);
    res.json({ settings, counts, taxonomies });
  } catch (err) { next(err); }
});

app.get('/api/posts', async (req, res, next) => {
  try {
    const posts = await listPosts({
      search: safeString(req.query.search, 100),
      category: safeString(req.query.category, 100),
      tag: safeString(req.query.tag, 100)
    });
    res.json({ posts });
  } catch (err) { next(err); }
});

app.get('/api/posts/:slug', async (req, res, next) => {
  try {
    const post = await getPostBySlug(req.params.slug);
    if (!post) return res.status(404).json({ error: '文章不存在' });
    res.json({ post });
  } catch (err) { next(err); }
});

app.post('/api/posts/:id/like', async (req, res, next) => {
  try {
    res.json(await likePost(req.params.id));
  } catch (err) { next(err); }
});


app.get('/api/pages', async (req, res, next) => {
  try {
    res.json({ pages: await listPages() });
  } catch (err) { next(err); }
});

app.get('/api/pages/:slug', async (req, res, next) => {
  try {
    const page = await getPageBySlug(req.params.slug);
    if (!page) return res.status(404).json({ error: '页面不存在' });
    res.json({ page });
  } catch (err) { next(err); }
});

app.get('/api/taxonomies', async (req, res, next) => {
  try {
    res.json(await listTaxonomies());
  } catch (err) { next(err); }
});


app.get('/api/captcha', (req, res) => {
  res.json(makeCaptcha());
});

app.post('/api/comments', async (req, res, next) => {
  try {
    const name = safeString(req.body.name, 30);
    const email = safeString(req.body.email, 100);
    const content = safeString(req.body.content, 1000);
    const post_id = Number(req.body.post_id);
    const ip = clientIp(req);
    checkCommentRate(req);
    verifyCaptcha(req.body.captcha_token, req.body.captcha_answer);
    if (!post_id || !name || !content) return res.status(400).json({ error: '昵称和评论内容不能为空' });
    const settings = await getSettingsObject();
    const moderation = moderateComment({ settings, name, email, content, ip });
    const comments = await createComment({
      post_id,
      name,
      email,
      content,
      status: moderation.status,
      moderation_reason: moderation.reason,
      ip,
      user_agent: safeString(req.headers['user-agent'], 300)
    });
    res.json({
      comments,
      status: moderation.status,
      message: moderation.status === 'pending' ? '评论已提交，等待站长审核后显示。' : '评论已提交。'
    });
  } catch (err) { next(err); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const username = safeString(req.body.username, 60);
    const password = String(req.body.password || '');
    const user = await findUser(username);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: '账号或密码错误' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    sendAuthCookie(res, token);
    res.json({ user: { id: user.id, username: user.username } });
  } catch (err) { next(err); }
});

app.post('/api/auth/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = currentUser(req);
  res.json({ user: user ? { id: user.id, username: user.username } : null });
});

app.get('/api/admin/posts', requireAuth, async (req, res, next) => {
  try {
    const posts = await listPosts({ includeDrafts: true, search: safeString(req.query.search, 100) });
    res.json({ posts });
  } catch (err) { next(err); }
});

app.get('/api/admin/posts/:id', requireAuth, async (req, res, next) => {
  try {
    const post = await getPostById(req.params.id);
    if (!post) return res.status(404).json({ error: '文章不存在' });
    res.json({ post });
  } catch (err) { next(err); }
});

app.post('/api/admin/posts', requireAuth, async (req, res, next) => {
  try {
    const post = await createPost(req.body);
    res.status(201).json({ post });
  } catch (err) { next(err); }
});

app.put('/api/admin/posts/:id', requireAuth, async (req, res, next) => {
  try {
    const post = await updatePost(req.params.id, req.body);
    res.json({ post });
  } catch (err) { next(err); }
});

app.delete('/api/admin/posts/:id', requireAuth, async (req, res, next) => {
  try {
    res.json(await deletePost(req.params.id));
  } catch (err) { next(err); }
});


app.get('/api/admin/pages', requireAuth, async (req, res, next) => {
  try {
    res.json({ pages: await listPages({ includeDrafts: true }) });
  } catch (err) { next(err); }
});

app.get('/api/admin/pages/:id', requireAuth, async (req, res, next) => {
  try {
    const page = await getPageById(req.params.id);
    if (!page) return res.status(404).json({ error: '页面不存在' });
    res.json({ page });
  } catch (err) { next(err); }
});

app.post('/api/admin/pages', requireAuth, async (req, res, next) => {
  try {
    const page = await createPage(req.body);
    res.status(201).json({ page });
  } catch (err) { next(err); }
});

app.put('/api/admin/pages/:id', requireAuth, async (req, res, next) => {
  try {
    const page = await updatePage(req.params.id, req.body);
    res.json({ page });
  } catch (err) { next(err); }
});

app.delete('/api/admin/pages/:id', requireAuth, async (req, res, next) => {
  try {
    res.json(await deletePage(req.params.id));
  } catch (err) { next(err); }
});

app.post('/api/admin/upload', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    const result = await uploadImage(req.file, { folder: safeString(req.body.folder, 60) || 'posts' });
    res.status(201).json(result);
  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') err.message = `图片太大，请控制在 ${process.env.MAX_UPLOAD_MB || 5}MB 以内`;
    next(err);
  }
});


app.get('/api/admin/comments', requireAuth, async (req, res, next) => {
  try {
    res.json({ comments: await listComments({ limit: Number(req.query.limit || 300) }) });
  } catch (err) { next(err); }
});

app.delete('/api/admin/comments/:id', requireAuth, async (req, res, next) => {
  try {
    res.json(await deleteComment(req.params.id));
  } catch (err) { next(err); }
});

app.put('/api/admin/comments/:id/status', requireAuth, async (req, res, next) => {
  try {
    res.json(await updateCommentStatus(req.params.id, safeString(req.body.status, 20)));
  } catch (err) { next(err); }
});

app.get('/api/admin/stats', requireAuth, async (req, res, next) => {
  try {
    res.json({ stats: await getVisitStats({ days: Number(req.query.days || 14) }) });
  } catch (err) { next(err); }
});

app.get('/api/admin/backup', requireAuth, async (req, res, next) => {
  try {
    const backup = await exportBackup();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Disposition', `attachment; filename="shoe-blog-backup-${stamp}.json"`);
    res.json(backup);
  } catch (err) { next(err); }
});

app.post('/api/admin/backup/import', requireAuth, async (req, res, next) => {
  try {
    res.json(await importBackup(req.body));
  } catch (err) { next(err); }
});

app.get('/api/admin/system', requireAuth, async (req, res) => {
  const hasValue = value => Boolean(String(value || '').trim());
  const stats = await getVisitStats({ days: 7 }).catch(() => ({ total: 0, top_paths: [] }));
  res.json({
    system: {
      node_version: process.version,
      environment: process.env.NODE_ENV || 'development',
      database: hasValue(process.env.DATABASE_URL) ? 'PostgreSQL / Supabase' : '本地 JSON，仅建议本地测试',
      storage_provider: process.env.STORAGE_PROVIDER || 'local',
      supabase_url_configured: hasValue(process.env.SUPABASE_URL),
      supabase_service_role_configured: hasValue(process.env.SUPABASE_SERVICE_ROLE_KEY),
      supabase_bucket: process.env.SUPABASE_BUCKET || '',
      max_upload_mb: Number(process.env.MAX_UPLOAD_MB || 5),
      admin_path_configured: ADMIN_PATH,
      package_runtime: 'Node 20.18.1 + npm ci',
      visits_7d: stats.total,
      top_path_7d: stats.top_paths?.[0]?.path || '-'
    }
  });
});

app.get('/api/admin/settings', requireAuth, async (req, res, next) => {
  try {
    res.json({ settings: await getSettingsObject() });
  } catch (err) { next(err); }
});

app.put('/api/admin/settings', requireAuth, async (req, res, next) => {
  try {
    res.json({ settings: await updateSettingsObject(req.body) });
  } catch (err) { next(err); }
});


// 前台使用 clean URL：/about、/archive、/category/设计、/my-post
// 这些地址直接刷新时，也返回前台 index.html，由前端路由再判断是文章还是页面。
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  serveFrontEntry(req, res);
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = Number(err.status || err.statusCode || 500);
  res.status(status >= 400 && status < 600 ? status : 500).json({ error: err.message || '服务器错误' });
});

validateProductionEnv();
await initDb();
app.listen(PORT, () => {
  console.log(`✅ 网站已运行：http://localhost:${PORT}`);
  console.log(`🔒 后台隐藏入口：http://localhost:${PORT}${ADMIN_PATH}`);
  console.log('提示：/admin 和 /admin.html 已默认隐藏，登录仍需账号密码。');
});
