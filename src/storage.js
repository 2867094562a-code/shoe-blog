import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCAL_UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR || path.join(__dirname, '../public/uploads');
const MAX_SAFE_NAME = 80;
const IMAGE_MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

function cleanPart(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SAFE_NAME);
}

function extFromFile(file) {
  const byMime = IMAGE_MIME_TO_EXT[file.mimetype];
  if (byMime) return byMime;
  const raw = path.extname(file.originalname || '').replace('.', '').toLowerCase();
  return raw || 'bin';
}

function storageProvider() {
  if (process.env.STORAGE_PROVIDER) return process.env.STORAGE_PROVIDER.toLowerCase();
  if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET && process.env.R2_PUBLIC_URL) return 'r2';
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_BUCKET) return 'supabase';
  return 'local';
}

function makeKey(file, folder = 'posts') {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const original = cleanPart(path.basename(file.originalname || 'image', path.extname(file.originalname || '')));
  const name = original || 'image';
  return `${cleanPart(folder) || 'posts'}/${yyyy}/${mm}/${Date.now()}-${randomUUID().slice(0, 8)}-${name}.${extFromFile(file)}`;
}

export function assertImageFile(file) {
  if (!file) {
    const err = new Error('没有收到图片文件');
    err.status = 400;
    throw err;
  }
  if (!Object.keys(IMAGE_MIME_TO_EXT).includes(file.mimetype)) {
    const err = new Error('只支持 jpg、png、webp、gif 图片');
    err.status = 400;
    throw err;
  }
}

export async function uploadImage(file, options = {}) {
  assertImageFile(file);
  const provider = storageProvider();
  const key = makeKey(file, options.folder || 'posts');

  if (provider === 'r2') {
    const endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
      }
    });
    await client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      CacheControl: 'public, max-age=31536000, immutable'
    }));
    return {
      provider,
      key,
      url: `${String(process.env.R2_PUBLIC_URL).replace(/\/$/, '')}/${key}`
    };
  }

  if (provider === 'supabase') {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });
    const bucket = process.env.SUPABASE_BUCKET || 'blog-images';
    const { error } = await supabase.storage.from(bucket).upload(key, file.buffer, {
      contentType: file.mimetype,
      cacheControl: '31536000',
      upsert: false
    });
    if (error) throw error;
    const { data } = supabase.storage.from(bucket).getPublicUrl(key);
    return { provider, key, url: data.publicUrl };
  }

  await fs.mkdir(path.dirname(path.join(LOCAL_UPLOAD_DIR, key)), { recursive: true });
  await fs.writeFile(path.join(LOCAL_UPLOAD_DIR, key), file.buffer);
  return {
    provider,
    key,
    url: `/uploads/${key}`,
    warning: '当前使用本地上传，仅适合本地测试；部署到 Render 免费版后本地图片可能丢失。'
  };
}
