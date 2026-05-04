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
  listPages,
  getPageBySlug,
  getPageById,
  createPage,
  updatePage,
  deletePage,
  deleteComment,
  listComments
} from './db.js';
import { uploadImage } from './storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const COOKIE_NAME = 'argon_lite_token';
const rawAdminPath = String(process.env.ADMIN_PATH || '/console-7f92x').trim();
const ADMIN_PATH = rawAdminPath.startsWith('/') ? rawAdminPath : `/${rawAdminPath}`;
const ADMIN_PATH_ALT = ADMIN_PATH.endsWith('/') ? ADMIN_PATH.slice(0, -1) : `${ADMIN_PATH}/`;
const ADMIN_HTML_FILE = path.join(__dirname, '../private/admin.html');
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
  if (!token || answer == null) throw new Error('请先完成验证码');
  let payload;
  try {
    payload = jwt.verify(String(token), JWT_SECRET);
  } catch {
    throw new Error('验证码已过期，请刷新验证码');
  }
  if (payload?.type !== 'comment-captcha') throw new Error('验证码无效，请刷新验证码');
  const normalized = String(answer).trim();
  if (!/^\d+$/.test(normalized) || Number(normalized) !== Number(payload.answer)) {
    throw new Error('验证码错误，请重新输入');
  }
}

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: '2mb' }));

// 隐藏后台入口：默认不暴露 /admin 和 /admin.html。
app.get(['/admin', '/admin/', '/admin.html'], (req, res) => {
  res.status(404).type('text/plain').send('Not Found');
});

app.get([ADMIN_PATH, ADMIN_PATH_ALT], (req, res) => {
  res.sendFile(ADMIN_HTML_FILE);
});

app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
}));

app.get('/api/health', async (req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), adminPathConfigured: true });
});

app.get('/api/site', async (req, res, next) => {
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
    verifyCaptcha(req.body.captcha_token, req.body.captcha_answer);
    if (!post_id || !name || !content) return res.status(400).json({ error: '昵称和评论内容不能为空' });
    const comments = await createComment({ post_id, name, email, content });
    res.json({ comments });
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
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || '服务器错误' });
});

await initDb();
app.listen(PORT, () => {
  console.log(`✅ 网站已运行：http://localhost:${PORT}`);
  console.log(`🔒 后台隐藏入口：http://localhost:${PORT}${ADMIN_PATH}`);
  console.log('提示：/admin 和 /admin.html 已默认隐藏，登录仍需账号密码。');
});
