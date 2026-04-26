#!/usr/bin/env node

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { URL } from 'node:url';

import {
  DEFAULT_CATEGORY,
  ROOT,
  TRASH_POST_DIR,
  createPost,
  deletePostToTrash,
  findPostDir,
  getStats,
  readIdeas,
  readPosts,
  readTrashPosts,
  renamePost,
  restorePostFromTrash,
  searchPosts,
  splitTags,
  today,
  toRelative,
  updatePostFrontmatter
} from './lib/posts.js';
import { splitFrontmatter, updateFrontmatterContent } from './lib/frontmatter.js';

const HOST = '127.0.0.1';
const PORT = readPort(process.env.ADMIN_PORT, 4323);
const ADMIN_URL = `http://localhost:${PORT}/admin`;
const MAX_BODY_SIZE = 5 * 1024 * 1024;
const PUBLIC_COVERS_DIR = path.join(ROOT, 'public', 'images', 'covers');
const COVER_EXTENSIONS = new Set(['.avif', '.gif', '.jpg', '.jpeg', '.png', '.svg', '.webp']);
const DEFAULT_CATEGORIES = ['tech', 'article', 'thoughts', 'reviews', '随笔'];
const DEFAULT_TAGS = ['Astro', 'TypeScript', 'Tailwind CSS', 'UI', '动漫', '游戏', '影评', '随想', '日常'];

const server = http.createServer(async (req, res) => {
  try {
    if (!isLocalRequest(req)) {
      sendJson(res, 403, { error: '后台只允许 localhost 访问。' });
      return;
    }

    const url = new URL(req.url || '/', ADMIN_URL);

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/admin' || url.pathname === '/admin/')) {
      sendHtml(res, adminHtml());
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/admin-assets/covers/')) {
      await serveCoverAsset(res, url);
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    sendText(res, 404, 'Not found');
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || '后台服务出错了。' });
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用，后台没有启动。`);
    console.error(`请确认是否已经打开了后台，或关闭占用 ${PORT} 端口的程序后再试。`);
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`本地博客后台已启动：${ADMIN_URL}`);
  console.log('安全模式：仅监听 localhost，不会暴露到局域网。');
});

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1);
  const [resource, id, action] = parts;

  if (req.method === 'GET' && resource === 'meta') {
    sendJson(res, 200, await getEditorMeta());
    return;
  }

  if (req.method === 'GET' && resource === 'settings') {
    const postDir = await findPostDir();
    const meta = await getEditorMeta();
    sendJson(res, 200, {
      postDir: toRelative(postDir),
      trashDir: toRelative(TRASH_POST_DIR),
      adminUrl: ADMIN_URL,
      localOnly: true,
      categories: meta.categories,
      tags: meta.tags,
      covers: meta.covers,
      notes: [
        '后台只绑定 localhost，适合本机写作管理。',
        '文章文件只会在当前文章目录中创建、编辑、重命名或移入回收站。',
        '删除文章会先移动到 .trash/posts/，回收站里可以恢复。',
        '这个后台是本地工具，不会被 Astro 构建进 GitHub Pages。'
      ]
    });
    return;
  }

  if (req.method === 'GET' && resource === 'stats') {
    const posts = await readPosts();
    sendJson(res, 200, { stats: getStats(serializePosts(posts)) });
    return;
  }

  if (resource === 'ideas') {
    if (req.method === 'GET' && !id) {
      const ideas = await readIdeas();
      sendJson(res, 200, { ideas });
      return;
    }

    if (req.method === 'POST' && id === 'draft') {
      const body = await readJson(req);
      const title = normalizeTitle(body.title || randomItem(await readIdeas()));
      const result = await createPost(
        {
          title,
          category: DEFAULT_CATEGORY,
          tags: [],
          draft: true,
          description: '',
          cover: ''
        },
        { openEditor: false }
      );

      sendJson(res, 201, { post: result });
      return;
    }
  }

  if (resource === 'posts') {
    await handlePostsApi(req, res, url, id, action);
    return;
  }

  if (resource === 'trash') {
    await handleTrashApi(req, res, id, action);
    return;
  }

  sendJson(res, 404, { error: '没有找到这个后台接口。' });
}

async function handlePostsApi(req, res, url, id, action) {
  if (req.method === 'GET' && !id) {
    const query = url.searchParams.get('q') || '';
    const draftsOnly = url.searchParams.get('drafts') === '1';
    let posts = await readPosts();

    if (draftsOnly) posts = posts.filter((post) => post.draft);
    if (query.trim()) posts = searchPosts(posts, query);

    sendJson(res, 200, { posts: serializePosts(posts) });
    return;
  }

  if (req.method === 'POST' && !id) {
    const payload = normalizePostPayload(await readJson(req));
    const result = await createPost(payload, { openEditor: false });
    const post = await findPostByRelativePath(result.relativePath);

    sendJson(res, 201, { post: serializePost(post || result) });
    return;
  }

  if (!id) {
    sendJson(res, 404, { error: '缺少文章 id。' });
    return;
  }

  const post = await findPostById(id);

  if (req.method === 'GET' && !action) {
    sendJson(res, 200, { post: await serializeFullPost(post) });
    return;
  }

  if (req.method === 'PUT' && !action) {
    const payload = normalizePostPayload(await readJson(req), { requireBody: true });
    await savePost(post, payload);
    const nextPost = await findPostByRelativePath(post.relativePath);

    sendJson(res, 200, { post: await serializeFullPost(nextPost || post) });
    return;
  }

  if (req.method === 'POST' && action === 'publish') {
    await updatePostFrontmatter(post, { draft: false, updated: today() });
    sendJson(res, 200, { post: serializePost(await findPostByRelativePath(post.relativePath)) });
    return;
  }

  if (req.method === 'POST' && action === 'draft') {
    await updatePostFrontmatter(post, { draft: true, updated: today() });
    sendJson(res, 200, { post: serializePost(await findPostByRelativePath(post.relativePath)) });
    return;
  }

  if (req.method === 'POST' && action === 'touch') {
    await updatePostFrontmatter(post, { updated: today() });
    sendJson(res, 200, { post: serializePost(await findPostByRelativePath(post.relativePath)) });
    return;
  }

  if (req.method === 'POST' && action === 'rename') {
    const body = await readJson(req);
    const newTitle = normalizeTitle(body.title);
    const renamed = await renamePost(post, newTitle);
    const nextPost = await findPostByRelativePath(renamed.relativePath);

    sendJson(res, 200, { post: serializePost(nextPost || renamed) });
    return;
  }

  if (req.method === 'POST' && action === 'delete') {
    const result = await deletePostToTrash(post);
    sendJson(res, 200, { trash: result });
    return;
  }

  sendJson(res, 404, { error: '没有找到这个文章操作。' });
}

async function handleTrashApi(req, res, id, action) {
  if (req.method === 'GET' && !id) {
    const trashPosts = await readTrashPosts();
    sendJson(res, 200, { posts: trashPosts.map(serializeTrashPost) });
    return;
  }

  if (!id) {
    sendJson(res, 404, { error: '缺少回收站文章 id。' });
    return;
  }

  const trashPost = await findTrashPostById(id);

  if (req.method === 'POST' && action === 'restore') {
    const restored = await restorePostFromTrash(trashPost);
    sendJson(res, 200, { post: restored });
    return;
  }

  if (req.method === 'DELETE' && !action) {
    assertInsideTrash(trashPost.filePath);
    await fs.rm(trashPost.filePath, { force: true });
    await fs.rm(`${trashPost.filePath}.meta.json`, { force: true });
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: '没有找到这个回收站操作。' });
}

async function savePost(post, payload) {
  assertInside(await findPostDir(), post.filePath);

  const original = await fs.readFile(post.filePath, 'utf8');
  const frontmatterUpdated = updateFrontmatterContent(original, {
    title: payload.title,
    category: payload.category,
    tags: payload.tags,
    description: payload.description,
    cover: payload.cover,
    draft: payload.draft,
    updated: today()
  });
  const parsed = splitFrontmatter(frontmatterUpdated);
  const body = normalizeBody(payload.body);
  const nextContent = ['---', ...parsed.frontmatterLines, '---', '', body].join(parsed.newline);

  await fs.writeFile(post.filePath, nextContent, 'utf8');
}

async function findPostById(id) {
  const posts = await readPosts();
  const post = posts.find((item) => encodeId(item.relativePath) === id);

  if (!post) throw httpError(404, '没有找到这篇文章。');
  assertInside(await findPostDir(), post.filePath);

  return post;
}

async function findPostByRelativePath(relativePath) {
  const posts = await readPosts();
  return posts.find((post) => post.relativePath === relativePath);
}

async function findTrashPostById(id) {
  const posts = await readTrashPosts();
  const post = posts.find((item) => encodeId(item.relativePath) === id);

  if (!post) throw httpError(404, '回收站里没有找到这篇文章。');
  assertInsideTrash(post.filePath);

  return post;
}

async function serializeFullPost(post) {
  const content = await fs.readFile(post.filePath, 'utf8');
  const parsed = splitFrontmatter(content);

  return {
    ...serializePost(post),
    body: parsed.body
  };
}

async function getEditorMeta() {
  const posts = await readPosts();
  const categories = uniqueNormalized([...DEFAULT_CATEGORIES, ...posts.map((post) => post.category).filter(Boolean)]).sort((a, b) =>
    a.localeCompare(b, 'zh-CN')
  );
  const tags = Array.from(new Set([...DEFAULT_TAGS, ...posts.flatMap((post) => post.tags || [])])).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const covers = await readCoverOptions();

  return { categories, tags, covers };
}

function uniqueNormalized(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const item = String(value || '').trim().replace(/\s+/g, ' ');
    const key = item.toLocaleLowerCase('zh-CN');
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

async function readCoverOptions() {
  const files = await fs.readdir(PUBLIC_COVERS_DIR, { withFileTypes: true }).catch(() => []);

  return files
    .filter((file) => file.isFile() && COVER_EXTENSIONS.has(path.extname(file.name).toLowerCase()))
    .map((file) => ({
      name: file.name,
      path: `/images/covers/${file.name}`,
      previewUrl: `/admin-assets/covers/${encodeURIComponent(file.name)}`
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

async function serveCoverAsset(res, url) {
  const fileName = decodeURIComponent(url.pathname.replace('/admin-assets/covers/', ''));
  if (!fileName || fileName.includes('/') || fileName.includes('\\')) {
    sendText(res, 400, 'Invalid cover asset');
    return;
  }

  const filePath = path.join(PUBLIC_COVERS_DIR, fileName);
  assertInside(PUBLIC_COVERS_DIR, filePath);

  if (!COVER_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    sendText(res, 403, 'Unsupported cover type');
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': getMimeType(filePath),
      'Cache-Control': 'no-store'
    });
    res.end(file);
  } catch {
    sendText(res, 404, 'Cover not found');
  }
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const types = {
    '.avif': 'image/avif',
    '.gif': 'image/gif',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp'
  };

  return types[extension] || 'application/octet-stream';
}

function serializePosts(posts) {
  return posts.map(serializePost);
}

function serializePost(post) {
  if (!post) return null;

  return {
    id: encodeId(post.relativePath),
    title: post.title || '',
    date: post.date || '',
    updated: post.updated || '',
    category: post.category || '',
    tags: Array.isArray(post.tags) ? post.tags : [],
    description: post.data?.description || '',
    cover: post.data?.cover || '',
    draft: Boolean(post.draft),
    fileName: post.fileName || '',
    path: post.relativePath || ''
  };
}

function serializeTrashPost(post) {
  return {
    id: encodeId(post.relativePath),
    title: post.title || '',
    originalPath: post.originalRelativePath || '',
    deletedAt: post.deletedAt || '',
    path: post.relativePath || ''
  };
}

function normalizePostPayload(payload, options = {}) {
  return {
    title: normalizeTitle(payload.title),
    category: String(payload.category || DEFAULT_CATEGORY).trim() || DEFAULT_CATEGORY,
    tags: Array.isArray(payload.tags) ? payload.tags.map(String).map((tag) => tag.trim()).filter(Boolean) : splitTags(String(payload.tags || '')),
    description: String(payload.description || ''),
    cover: String(payload.cover || ''),
    draft: Boolean(payload.draft),
    body: options.requireBody ? String(payload.body || '') : undefined
  };
}

function normalizeTitle(value) {
  const title = String(value || '').trim();
  if (!title) throw httpError(400, '文章标题不能为空。');
  return title;
}

function normalizeBody(value) {
  return String(value || '').replace(/\r\n/g, '\n');
}

async function readJson(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_SIZE) throw httpError(413, '请求内容太大。');
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw httpError(400, '请求内容不是有效 JSON。');
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

function sendHtml(res, html) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(html);
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isLocalRequest(req) {
  const remote = req.socket.remoteAddress || '';
  const host = String(req.headers.host || '').split(':')[0].replace(/^\[|\]$/g, '').toLowerCase();
  const localRemote = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote);
  const localHost = !host || ['localhost', '127.0.0.1', '::1'].includes(host);

  return localRemote && localHost;
}

function encodeId(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)] || '今天想写的一件小事';
}

function readPort(value, fallback) {
  const port = Number.parseInt(value || '', 10);
  if (Number.isInteger(port) && port > 0 && port < 65536) return port;
  return fallback;
}

function assertInsideTrash(filePath) {
  assertInside(TRASH_POST_DIR, filePath);
}

function assertInside(directory, filePath) {
  const resolvedDir = path.resolve(directory);
  const resolvedFile = path.resolve(filePath);
  const relative = path.relative(resolvedDir, resolvedFile);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw httpError(403, '文件操作被拒绝：目标不在允许目录内。');
  }
}

function adminHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>本地博客后台 CMS</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b0d12;
      --panel: #121620;
      --panel-soft: #171c28;
      --line: #293142;
      --text: #edf2ff;
      --muted: #98a2b3;
      --brand: #8bd3ff;
      --brand-strong: #5db7f0;
      --danger: #ff6b7a;
      --danger-bg: #3b111a;
      --ok: #7ee2a8;
      --warn: #ffd166;
      --radius: 14px;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at 20% 0%, rgba(91, 183, 240, 0.18), transparent 28rem),
        linear-gradient(135deg, #0b0d12 0%, #111520 52%, #0b0d12 100%);
      color: var(--text);
    }
    button, input, textarea { font: inherit; }
    button { cursor: pointer; }
    .app { display: grid; grid-template-columns: 260px minmax(0, 1fr); min-height: 100vh; }
    .sidebar {
      border-right: 1px solid var(--line);
      background: rgba(12, 15, 22, 0.82);
      backdrop-filter: blur(18px);
      padding: 24px 18px;
      position: sticky;
      top: 0;
      height: 100vh;
    }
    .brand { margin-bottom: 28px; }
    .brand strong { display: block; font-size: 20px; letter-spacing: 0; }
    .brand span { color: var(--muted); font-size: 13px; }
    .nav { display: grid; gap: 8px; }
    .nav button {
      display: flex;
      width: 100%;
      align-items: center;
      justify-content: space-between;
      border: 1px solid transparent;
      border-radius: 10px;
      background: transparent;
      color: var(--muted);
      padding: 11px 12px;
      text-align: left;
    }
    .nav button.active, .nav button:hover {
      border-color: var(--line);
      background: rgba(139, 211, 255, 0.1);
      color: var(--text);
    }
    .main { padding: 28px; }
    .topbar {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 22px;
    }
    h1 { margin: 0; font-size: 28px; letter-spacing: 0; }
    .sub { margin: 6px 0 0; color: var(--muted); }
    .card {
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: rgba(18, 22, 32, 0.86);
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.22);
    }
    .card-pad { padding: 18px; }
    .grid { display: grid; gap: 16px; }
    .stats { grid-template-columns: repeat(5, minmax(0, 1fr)); }
    .stat strong { display: block; font-size: 30px; }
    .stat span { color: var(--muted); font-size: 13px; }
    .toolbar {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      align-items: center;
      margin-bottom: 14px;
    }
    .search { width: min(420px, 100%); }
    input, textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #0f131c;
      color: var(--text);
      padding: 11px 12px;
      outline: none;
    }
    textarea { min-height: 360px; resize: vertical; line-height: 1.7; }
    input:focus, textarea:focus { border-color: var(--brand-strong); box-shadow: 0 0 0 3px rgba(91, 183, 240, 0.12); }
    .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    label span { display: block; margin-bottom: 7px; color: var(--muted); font-size: 13px; }
    .check { display: flex; align-items: center; gap: 8px; color: var(--muted); }
    .check input { width: auto; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .btn {
      border: 1px solid var(--line);
      border-radius: 9px;
      background: #182031;
      color: var(--text);
      padding: 9px 11px;
    }
    .btn:hover { border-color: var(--brand-strong); }
    .primary { background: linear-gradient(135deg, #5db7f0, #8bd3ff); color: #05101a; border-color: transparent; font-weight: 800; }
    .danger { background: var(--danger-bg); border-color: rgba(255, 107, 122, 0.34); color: #ffd7dc; }
    .ghost { background: transparent; }
    .pill {
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 4px 8px;
      color: var(--muted);
      font-size: 12px;
      margin: 2px;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid var(--line); padding: 13px 10px; text-align: left; vertical-align: top; }
    th { color: var(--muted); font-size: 12px; font-weight: 700; }
    td { font-size: 14px; }
    .path { color: var(--muted); font-size: 12px; word-break: break-all; }
    .status { color: var(--ok); }
    .draft { color: var(--warn); }
    .editor { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
    .preview {
      min-height: 360px;
      overflow: auto;
      padding: 18px;
      line-height: 1.8;
    }
    .preview h1, .preview h2, .preview h3 { margin-top: 0.9em; }
    .preview blockquote { border-left: 3px solid var(--brand); color: var(--muted); margin-left: 0; padding-left: 14px; }
    .preview code { background: #0d111a; border: 1px solid var(--line); border-radius: 6px; padding: 2px 5px; }
    .empty { padding: 28px; text-align: center; color: var(--muted); }
    .idea { display: grid; gap: 12px; place-items: start; }
    .idea-title { font-size: 26px; line-height: 1.35; }
    .notice { color: var(--muted); line-height: 1.8; }
    body.sidebar-collapsed .app { grid-template-columns: 0 minmax(0, 1fr); }
    body.sidebar-collapsed .sidebar { width: 0; padding: 0; overflow: hidden; border-right: 0; }
    body.focus-mode .main { padding: 18px; }
    body.focus-mode .editor-meta,
    body.focus-mode .danger-zone { display: none; }
    body.focus-mode .editor-page .topbar { margin-bottom: 12px; }
    .editor-page { min-height: calc(100vh - 56px); }
    .editor-topbar {
      position: sticky;
      top: 0;
      z-index: 8;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: rgba(12, 15, 22, 0.92);
      padding: 12px;
      backdrop-filter: blur(18px);
      margin-bottom: 14px;
    }
    .editor-titleline { min-width: 0; }
    .editor-titleline strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .editor-titleline span { color: var(--muted); font-size: 12px; }
    .save-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 7px 10px;
      color: var(--muted);
      font-size: 13px;
      white-space: nowrap;
    }
    .save-pill.dirty { color: var(--warn); border-color: rgba(255, 209, 102, 0.42); }
    .save-pill.saving { color: var(--brand); border-color: rgba(139, 211, 255, 0.42); }
    .save-pill.saved { color: var(--ok); border-color: rgba(126, 226, 168, 0.42); }
    .save-pill.failed { color: var(--danger); border-color: rgba(255, 107, 122, 0.42); }
    .editor-meta {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: 14px;
      margin-bottom: 14px;
    }
    details.meta-panel summary {
      cursor: pointer;
      color: var(--text);
      font-weight: 800;
      list-style: none;
    }
    details.meta-panel summary::-webkit-details-marker { display: none; }
    .meta-body { margin-top: 16px; }
    .status-card { display: grid; gap: 14px; align-content: start; }
    .status-badge {
      display: inline-flex;
      width: fit-content;
      align-items: center;
      gap: 8px;
      border-radius: 999px;
      padding: 8px 12px;
      font-weight: 800;
    }
    .status-badge.published { background: rgba(126, 226, 168, 0.12); color: var(--ok); }
    .status-badge.draft { background: rgba(255, 209, 102, 0.12); color: var(--warn); }
    .option-row,
    .tag-suggestions,
    .cover-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }
    .combo-shell {
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
    }
    .category-menu {
      width: 100%;
      display: grid;
      gap: 6px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: rgba(13, 17, 26, 0.98);
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);
      margin-top: 8px;
      padding: 8px;
    }
    .category-menu.hidden { display: none; }
    .category-option {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      width: 100%;
      border: 1px solid transparent;
      border-radius: 9px;
      background: transparent;
      color: var(--text);
      padding: 9px 10px;
      text-align: left;
    }
    .category-option:hover,
    .category-option.active {
      border-color: rgba(139, 211, 255, 0.28);
      background: rgba(139, 211, 255, 0.1);
    }
    .category-option.create {
      color: var(--brand);
      border-color: rgba(139, 211, 255, 0.18);
    }
    .category-option small { color: var(--muted); }
    .tag-input-shell {
      min-height: 48px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #0f131c;
      padding: 8px;
    }
    .tag-input-shell:focus-within {
      border-color: var(--brand-strong);
      box-shadow: 0 0 0 3px rgba(91, 183, 240, 0.12);
    }
    .tag-input-shell input {
      min-width: 160px;
      flex: 1;
      border: 0;
      background: transparent;
      padding: 6px;
      box-shadow: none;
    }
    .selected-tags {
      display: contents;
    }
    .suggestion-title {
      width: 100%;
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
    }
    .chip-button,
    .tag-token {
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #101620;
      color: var(--muted);
      padding: 7px 10px;
      font-size: 13px;
    }
    .chip-button:hover,
    .chip-button.active {
      border-color: var(--brand-strong);
      color: var(--text);
      background: rgba(139, 211, 255, 0.1);
    }
    .tag-token {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--text);
    }
    .tag-token button {
      border: 0;
      background: transparent;
      color: var(--muted);
      padding: 0;
    }
    .cover-preview {
      display: grid;
      gap: 10px;
      align-content: start;
    }
    .cover-frame {
      aspect-ratio: 16 / 9;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: #0d111a;
      overflow: hidden;
      display: grid;
      place-items: center;
      color: var(--muted);
      text-align: center;
      padding: 12px;
    }
    .cover-frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .cover-option {
      width: 92px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #101620;
      padding: 6px;
      color: var(--muted);
      font-size: 11px;
      text-align: left;
    }
    .cover-option img {
      width: 100%;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      border-radius: 7px;
      display: block;
      margin-bottom: 5px;
    }
    .cover-option.active {
      border-color: var(--brand-strong);
      color: var(--text);
      background: rgba(139, 211, 255, 0.12);
      box-shadow: 0 0 0 3px rgba(91, 183, 240, 0.1);
    }
    .autosave-toggle {
      min-width: max-content;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #101620;
      padding: 7px 10px;
    }
    .writer-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(360px, 0.88fr);
      gap: 14px;
      min-height: calc(100vh - 260px);
    }
    .writer-layout.preview-hidden { grid-template-columns: minmax(0, 1fr); }
    .writer-layout.preview-hidden .preview-panel { display: none; }
    .editor-textarea {
      min-height: calc(100vh - 330px);
      height: calc(100vh - 330px);
      border: 0;
      border-radius: 0;
      background: transparent;
      font-size: 16px;
      line-height: 1.85;
      padding: 18px;
    }
    .writing-card {
      position: relative;
      overflow: hidden;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
    }
    .markdown-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      border-bottom: 1px solid var(--line);
      padding: 10px 14px;
      background: rgba(15, 19, 28, 0.6);
    }
    .panel-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      border-bottom: 1px solid var(--line);
      padding: 12px 14px;
      color: var(--muted);
      font-size: 13px;
    }
    .preview-panel {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      overflow: hidden;
    }
    .preview-scroll {
      min-height: calc(100vh - 330px);
      height: calc(100vh - 330px);
      overflow: auto;
    }
    .toc {
      border-bottom: 1px solid var(--line);
      padding: 12px 18px;
      color: var(--muted);
      font-size: 13px;
    }
    .toc a {
      display: block;
      color: var(--muted);
      text-decoration: none;
      padding: 3px 0;
    }
    .toc a:hover { color: var(--brand); }
    .toc .level-3 { padding-left: 14px; }
    .slash-menu {
      position: absolute;
      left: 18px;
      bottom: 24px;
      z-index: 12;
      width: min(360px, calc(100% - 36px));
      border: 1px solid var(--line);
      border-radius: 12px;
      background: rgba(13, 17, 26, 0.98);
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.32);
      padding: 8px;
    }
    .slash-menu.hidden { display: none; }
    .slash-menu button {
      width: 100%;
      display: flex;
      justify-content: space-between;
      gap: 10px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--text);
      padding: 10px;
      text-align: left;
    }
    .slash-menu button:hover { background: rgba(139, 211, 255, 0.1); }
    .slash-menu span { color: var(--muted); font-size: 12px; }
    .toast {
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 40;
      max-width: min(360px, calc(100vw - 48px));
      border: 1px solid rgba(126, 226, 168, 0.36);
      border-radius: 12px;
      background: rgba(16, 24, 20, 0.96);
      color: var(--ok);
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
      padding: 12px 14px;
      opacity: 0;
      transform: translateY(12px);
      pointer-events: none;
      transition: opacity 0.18s ease, transform 0.18s ease;
    }
    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }
    .danger-zone {
      margin-top: 18px;
      border-color: rgba(255, 107, 122, 0.35);
      background: rgba(59, 17, 26, 0.28);
    }
    @media (max-width: 1100px) {
      .app { grid-template-columns: 1fr; }
      .sidebar { position: static; height: auto; }
      .stats, .editor, .form-grid, .editor-meta, .writer-layout { grid-template-columns: 1fr; }
      .editor-textarea, .preview-scroll { height: 55vh; min-height: 55vh; }
    }
  </style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <strong>博客后台 CMS</strong>
        <span>localhost only</span>
      </div>
      <nav class="nav">
        <button data-view="dashboard">仪表盘</button>
        <button data-view="posts">文章列表</button>
        <button data-view="new">新建文章</button>
        <button data-view="drafts">草稿箱</button>
        <button data-view="trash">回收站</button>
        <button data-view="ideas">写作灵感</button>
        <button data-view="settings">设置</button>
      </nav>
    </aside>
    <main class="main">
      <div id="app"></div>
    </main>
  </div>
  <div id="toast" class="toast" aria-live="polite"></div>

  <script>
    const state = {
      view: 'dashboard',
      posts: [],
      stats: null,
      trash: [],
      ideas: [],
      currentIdea: '',
      settings: null,
      meta: null,
      search: '',
      editing: null,
      message: '',
      saveStatus: 'saved',
      dirty: false,
      editorSnapshot: '',
      previewVisible: true,
      sidebarVisible: true,
      focusMode: false,
      fullscreen: false,
      syncPreview: true,
      tagSearch: '',
      autosave: true,
      autosaveTimer: null,
      categoryQuery: '',
      categoryMenuOpen: false,
      toastTimer: null
    };

    const app = document.getElementById('app');

    document.querySelectorAll('[data-view]').forEach((button) => {
      button.addEventListener('click', () => setView(button.dataset.view));
    });

    window.addEventListener('beforeunload', (event) => {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = '';
    });

    document.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 's') {
        event.preventDefault();
        if (state.view === 'editor' && state.editing) saveEditingPost();
      }
      if (event.key === 'Escape' && state.focusMode) {
        state.focusMode = false;
        applyEditorChromeState();
        render();
      }
    });

    document.addEventListener('fullscreenchange', () => {
      state.fullscreen = Boolean(document.fullscreenElement);
    });

    function setView(view) {
      if (state.view === 'editor' && state.dirty && !confirm('当前文章还有未保存内容，确定离开吗？')) return;
      cancelAutosave();
      state.view = view;
      state.message = '';
      state.editing = null;
      state.dirty = false;
      state.saveStatus = 'saved';
      render();
      loadView();
    }

    async function loadView() {
      try {
        if (state.view === 'dashboard') await loadStats();
        if (state.view === 'posts') await loadPosts();
        if (state.view === 'drafts') await loadPosts(true);
        if (state.view === 'trash') await loadTrash();
        if (state.view === 'ideas') await loadIdeas();
        if (state.view === 'settings') await loadSettings();
      } catch (error) {
        showMessage(error.message || '操作失败');
      }
    }

    async function api(path, options = {}) {
      const response = await fetch('/api' + path, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '请求失败');
      return data;
    }

    async function loadStats() {
      const data = await api('/stats');
      state.stats = data.stats;
      render();
    }

    async function loadPosts(draftsOnly = false) {
      const query = state.search ? '&q=' + encodeURIComponent(state.search) : '';
      const data = await api('/posts?' + (draftsOnly ? 'drafts=1' : 'drafts=0') + query);
      state.posts = data.posts;
      render();
    }

    async function loadTrash() {
      const data = await api('/trash');
      state.trash = data.posts;
      render();
    }

    async function loadIdeas() {
      const data = await api('/ideas');
      state.ideas = data.ideas;
      if (!state.currentIdea) pickIdea();
      render();
    }

    async function loadSettings() {
      const data = await api('/settings');
      state.settings = data;
      state.meta = {
        categories: data.categories || [],
        tags: data.tags || [],
        covers: data.covers || []
      };
      render();
    }

    async function loadMeta() {
      if (state.meta) return state.meta;
      state.meta = await api('/meta');
      return state.meta;
    }

    function showMessage(message) {
      state.message = message;
      render();
    }

    function showToast(message) {
      const toast = document.getElementById('toast');
      if (!toast) return;
      clearTimeout(state.toastTimer);
      toast.textContent = message;
      toast.classList.add('show');
      state.toastTimer = setTimeout(() => {
        toast.classList.remove('show');
      }, 2200);
    }

    function render() {
      document.querySelectorAll('[data-view]').forEach((button) => {
        button.classList.toggle('active', button.dataset.view === state.view);
      });

      const views = {
        dashboard: renderDashboard,
        posts: () => renderPosts('文章列表', false),
        new: renderNewPost,
        drafts: () => renderPosts('草稿箱', true),
        trash: renderTrash,
        ideas: renderIdeas,
        settings: renderSettings,
        editor: renderEditor
      };

      const renderView = views[state.view] || renderDashboard;
      app.innerHTML = (state.message ? '<div class="card card-pad" style="margin-bottom:14px">' + escapeHtml(state.message) + '</div>' : '') + renderView();
      bindViewEvents();
    }

    function renderHeader(title, sub, actionHtml = '') {
      return '<div class="topbar"><div><h1>' + title + '</h1><p class="sub">' + sub + '</p></div><div class="actions">' + actionHtml + '</div></div>';
    }

    function renderDashboard() {
      const stats = state.stats;
      if (!stats) return renderHeader('仪表盘', '正在读取博客统计...') + '<div class="card empty">加载中</div>';

      return renderHeader('仪表盘', '一眼看清当前博客状态。', '<button class="btn" onclick="loadStats()">刷新</button>') +
        '<section class="grid stats">' +
        statCard('总文章数', stats.total) +
        statCard('已发布', stats.published) +
        statCard('草稿', stats.drafts) +
        statCard('分类', stats.categoryCount) +
        statCard('标签', stats.tagCount) +
        '</section>' +
        '<section class="card card-pad" style="margin-top:16px"><h2>最近 10 篇文章</h2>' + postTable(stats.recent || []) + '</section>';
    }

    function statCard(label, value) {
      return '<div class="card card-pad stat"><strong>' + value + '</strong><span>' + label + '</span></div>';
    }

    function renderPosts(title, draftsOnly) {
      return renderHeader(title, draftsOnly ? '只显示 draft: true 的文章。' : '搜索、编辑、发布、删除和维护文章。', '<button class="btn primary" onclick="setView(\\'new\\')">新建文章</button>') +
        '<section class="card card-pad">' +
        '<div class="toolbar"><input class="search" id="searchInput" placeholder="搜索标题、分类、标签、文件名或正文" value="' + escapeAttr(state.search) + '" /><button class="btn" id="refreshPosts">刷新</button></div>' +
        postTable(state.posts || []) +
        '</section>';
    }

    function postTable(posts) {
      if (!posts || posts.length === 0) return '<div class="empty">没有找到文章。</div>';

      return '<div style="overflow:auto"><table><thead><tr><th>标题</th><th>日期</th><th>updated</th><th>分类</th><th>标签</th><th>状态</th><th>路径</th><th>操作</th></tr></thead><tbody>' +
        posts.map((post) => '<tr>' +
          '<td><strong>' + escapeHtml(post.title) + '</strong></td>' +
          '<td>' + escapeHtml(post.date || '-') + '</td>' +
          '<td>' + escapeHtml(post.updated || '-') + '</td>' +
          '<td>' + escapeHtml(post.category || '-') + '</td>' +
          '<td>' + tagsHtml(post.tags) + '</td>' +
          '<td><span class="' + (post.draft ? 'draft' : 'status') + '">' + (post.draft ? 'draft' : 'published') + '</span></td>' +
          '<td class="path">' + escapeHtml(post.path || '') + '</td>' +
          '<td><div class="actions">' +
          '<button class="btn" onclick="editPost(\\'' + post.id + '\\')">编辑</button>' +
          (post.draft ? '<button class="btn primary" onclick="publishPost(\\'' + post.id + '\\')">发布</button>' : '<button class="btn" onclick="draftPost(\\'' + post.id + '\\')">设草稿</button>') +
          '<button class="btn" onclick="renamePostUi(\\'' + post.id + '\\', \\'' + escapeJs(post.title) + '\\')">重命名</button>' +
          '<button class="btn" onclick="touchPost(\\'' + post.id + '\\')">更新</button>' +
          '<button class="btn danger" onclick="deletePostUi(\\'' + post.id + '\\', \\'' + escapeJs(post.title) + '\\')">删除</button>' +
          '</div></td>' +
          '</tr>').join('') +
        '</tbody></table></div>';
    }

    function renderNewPost() {
      return renderHeader('新建文章', '填写必要信息后自动生成 Markdown 文件。') +
        '<section class="card card-pad"><form id="newPostForm" class="grid">' +
        '<div class="form-grid">' +
        field('标题', 'title', '') +
        field('分类', 'category', '随笔') +
        field('标签，用逗号分隔', 'tags', '') +
        field('摘要', 'description', '') +
        field('封面', 'cover', '') +
        '<label class="check" style="margin-top:28px"><input type="checkbox" name="draft" /> 是否草稿</label>' +
        '</div>' +
        '<div class="actions"><button class="btn primary" type="submit">创建文章</button></div>' +
        '</form></section>';
    }

    function renderEditor() {
      const post = state.editing;
      if (!post) return renderHeader('编辑文章', '正在打开文章...') + '<div class="card empty">加载中</div>';

      const metrics = getTextMetrics(post.body || '');
      const layoutClass = state.previewVisible ? 'writer-layout' : 'writer-layout preview-hidden';
      const postUrl = postUrlFromPath(post.path || post.fileName || '');

      return '<section class="editor-page">' +
        '<div class="editor-topbar">' +
        '<div class="editor-titleline"><strong>' + escapeHtml(post.title || '未命名文章') + '</strong><span>' + escapeHtml(post.path || '') + '</span></div>' +
        '<span class="save-pill ' + saveStatusClass() + '">' + saveStatusText() + '</span>' +
        '<label class="check autosave-toggle"><input type="checkbox" id="autosave-toggle" ' + (state.autosave ? 'checked' : '') + ' /> 自动保存</label>' +
        '<div class="actions">' +
        '<button class="btn" onclick="setView(\\'posts\\')">返回</button>' +
        '<button class="btn primary" id="savePost">保存 Ctrl+S</button>' +
        (post.draft ? '<button class="btn primary" onclick="publishEditingPost()">发布文章</button>' : '<button class="btn" onclick="draftEditingPost()">设为草稿</button>') +
        '<button class="btn" onclick="toggleFocusMode()">' + (state.focusMode ? '退出专注' : '专注写作') + '</button>' +
        '<button class="btn" onclick="toggleFullscreen()">' + (state.fullscreen ? '退出全屏' : '全屏编辑') + '</button>' +
        '<button class="btn" onclick="togglePreview()">' + (state.previewVisible ? '隐藏预览' : '显示预览') + '</button>' +
        '<button class="btn" onclick="toggleSidebar()">' + (state.sidebarVisible ? '隐藏菜单' : '显示菜单') + '</button>' +
        '</div></div>' +
        '<div class="editor-meta">' +
        '<details class="card card-pad meta-panel" open><summary>文章信息</summary><div class="meta-body grid">' +
        '<div class="form-grid">' +
        field('标题', 'edit-title', post.title) +
        field('摘要', 'edit-description', post.description || '') +
        '<label><span>分类</span><div class="combo-shell"><input id="edit-category" value="' + escapeAttr(post.category || '随笔') + '" placeholder="选择或输入新分类，按 Enter 创建" autocomplete="off" /><button class="btn" type="button" onclick="createOrSelectCategory()">➕ 添加 / 创建</button></div>' + categoryButtonsHtml(post.category || '随笔') + '</label>' +
        '<label><span>封面</span><input id="edit-cover" value="' + escapeAttr(post.cover || '') + '" />' + coverOptionsHtml() + '</label>' +
        '</div>' +
        '<div><label><span>标签</span><div class="tag-input-shell">' + selectedTagsHtml(post.tags || []) + '<input id="tag-search" value="' + escapeAttr(state.tagSearch) + '" placeholder="输入标签，按 Enter 添加" /></div></label>' + tagSuggestionsHtml(post.tags || []) + '</div>' +
        '</div></details>' +
        '<aside class="card card-pad status-card">' +
        '<div class="status-badge ' + (post.draft ? 'draft' : 'published') + '">' + (post.draft ? '草稿' : '已发布') + '</div>' +
        '<div class="notice">当前状态：' + (post.draft ? '草稿，不会出现在前台列表。' : '已发布，会参与前台构建。') + '</div>' +
        '<div class="notice">文章地址：<strong>' + escapeHtml(postUrl) + '</strong></div>' +
        '<div class="actions">' +
        (post.draft ? '<button class="btn primary" onclick="publishEditingPost()">发布文章</button>' : '<button class="btn" onclick="draftEditingPost()">设为草稿</button>') +
        '<button class="btn" onclick="touchEditingPost()">更新日期</button>' +
        '</div>' +
        '<div class="notice" id="statusMetrics">字数：<strong>' + metrics.words + '</strong><br />预计阅读：<strong>' + metrics.minutes + ' 分钟</strong></div>' +
        coverPreviewHtml(post.cover || '') +
        '</aside></div>' +
        '<div class="' + layoutClass + '">' +
        '<div class="card writing-card"><div class="panel-head"><span>Markdown 正文</span><span id="editorMetrics">' + metrics.words + ' 字 · ' + metrics.minutes + ' 分钟阅读</span></div>' +
        '<div class="markdown-toolbar">' +
        '<button class="btn" type="button" onclick="insertMarkdown(\\'h1\\')">H1</button>' +
        '<button class="btn" type="button" onclick="insertMarkdown(\\'h2\\')">H2</button>' +
        '<button class="btn" type="button" onclick="insertMarkdown(\\'bold\\')">B</button>' +
        '<button class="btn" type="button" onclick="insertMarkdown(\\'quote\\')">引用</button>' +
        '<button class="btn" type="button" onclick="insertMarkdown(\\'list\\')">列表</button>' +
        '<button class="btn" type="button" onclick="insertMarkdown(\\'code\\')">代码</button>' +
        '</div>' +
        '<textarea id="edit-body" class="editor-textarea" placeholder="输入 / 可打开快捷菜单">' + escapeHtml(post.body || '') + '</textarea>' +
        '<div id="slash-menu" class="slash-menu hidden">' +
        '<button type="button" onclick="runSlashCommand(\\'h2\\')"><strong>二级标题</strong><span>## 标题</span></button>' +
        '<button type="button" onclick="runSlashCommand(\\'quote\\')"><strong>引用</strong><span>> 一句话</span></button>' +
        '<button type="button" onclick="runSlashCommand(\\'list\\')"><strong>列表</strong><span>- 条目</span></button>' +
        '<button type="button" onclick="runSlashCommand(\\'code\\')"><strong>代码块</strong><span>&#96;&#96;&#96;</span></button>' +
        '</div></div>' +
        '<div class="card preview-panel"><div class="panel-head"><span>实时预览</span><label class="check"><input type="checkbox" id="sync-preview" ' + (state.syncPreview ? 'checked' : '') + ' /> 同步滚动</label></div><div id="toc" class="toc"></div><div class="preview preview-scroll" id="preview"></div></div>' +
        '</div>' +
        '<section class="card card-pad danger-zone"><h2>危险区域</h2><p class="notice">删除文章会移动到 .trash/posts/，不会永久删除。</p><button class="btn danger" onclick="deleteEditingPost()">删除这篇文章</button></section>' +
        '</section>';
    }

    function renderTrash() {
      return renderHeader('回收站', '删除的文章会先移动到这里，可以恢复，也可以永久删除。', '<button class="btn" onclick="loadTrash()">刷新</button>') +
        '<section class="card card-pad">' + trashTable(state.trash || []) + '</section>';
    }

    function trashTable(posts) {
      if (posts.length === 0) return '<div class="empty">回收站是空的。</div>';

      return '<div style="overflow:auto"><table><thead><tr><th>标题</th><th>删除时间</th><th>原路径</th><th>备份路径</th><th>操作</th></tr></thead><tbody>' +
        posts.map((post) => '<tr><td><strong>' + escapeHtml(post.title) + '</strong></td><td>' + escapeHtml(post.deletedAt || '-') + '</td><td class="path">' + escapeHtml(post.originalPath || '-') + '</td><td class="path">' + escapeHtml(post.path || '') + '</td><td><div class="actions"><button class="btn primary" onclick="restorePost(\\'' + post.id + '\\')">恢复</button><button class="btn danger" onclick="purgePost(\\'' + post.id + '\\', \\'' + escapeJs(post.title) + '\\')">永久删除</button></div></td></tr>').join('') +
        '</tbody></table></div>';
    }

    function renderIdeas() {
      return renderHeader('写作灵感', '随机抽一个选题，或者一键创建为草稿。') +
        '<section class="card card-pad idea">' +
        '<div class="idea-title">' + escapeHtml(state.currentIdea || '正在读取灵感...') + '</div>' +
        '<div class="actions"><button class="btn" onclick="pickIdea(); render();">随机抽取</button><button class="btn primary" onclick="createIdeaDraft()">用这个选题创建草稿</button></div>' +
        '</section>';
    }

    function renderSettings() {
      const s = state.settings;
      if (!s) return renderHeader('设置', '正在读取本地配置...') + '<div class="card empty">加载中</div>';

      return renderHeader('设置', '当前后台运行状态和安全说明。') +
        '<section class="card card-pad notice">' +
        '<p><strong>当前文章目录：</strong>' + escapeHtml(s.postDir) + '</p>' +
        '<p><strong>回收站目录：</strong>' + escapeHtml(s.trashDir) + '</p>' +
        '<p><strong>后台地址：</strong>' + escapeHtml(s.adminUrl) + '</p>' +
        '<p><strong>是否仅本地运行：</strong>' + (s.localOnly ? '是，只监听 localhost' : '否') + '</p>' +
        '<h2>常用说明</h2><ul>' + s.notes.map((note) => '<li>' + escapeHtml(note) + '</li>').join('') + '</ul>' +
        '</section>';
    }

    function saveStatusClass() {
      return {
        dirty: 'dirty',
        saving: 'saving',
        saved: 'saved',
        failed: 'failed'
      }[state.saveStatus] || 'saved';
    }

    function saveStatusText() {
      return {
        dirty: '未保存',
        saving: '保存中',
        saved: '已保存',
        failed: '保存失败'
      }[state.saveStatus] || '已保存';
    }

    function categoryButtonsHtml(current) {
      const query = state.categoryQuery || current || '';
      return '<div id="category-choices" class="category-menu ' + (state.categoryMenuOpen ? '' : 'hidden') + '">' + categoryMenuItemsHtml(query) + '</div>';
    }

    function categoryMenuItemsHtml(queryValue) {
      const query = normalizeCategory(queryValue);
      const queryKey = categoryKey(query);
      const categories = getCategoryList();
      const matches = (queryKey ? categories.filter((category) => categoryKey(category).includes(queryKey)) : categories).slice(0, 10);

      if (!matches.length && query) {
        return '<button class="category-option create" type="button" onmousedown="event.preventDefault(); createOrSelectCategory()"><span>➕ 创建分类 &quot;' + escapeHtml(query) + '&quot;</span><small>Enter</small></button>';
      }

      if (!matches.length) {
        return '<div class="notice">输入分类名称后按 Enter 创建。</div>';
      }

      return matches.map((category) =>
        '<button class="category-option ' + (categoryKey(category) === queryKey ? 'active' : '') + '" type="button" onmousedown="event.preventDefault(); setCategory(\\'' + escapeJs(category) + '\\')"><span>' + escapeHtml(category) + '</span><small>选择</small></button>'
      ).join('');
    }

    function selectedTagsHtml(tags) {
      if (!tags.length) return '<div id="selected-tags" class="selected-tags"><span class="pill">暂无标签</span></div>';

      return '<div id="selected-tags" class="selected-tags">' + tags.map((tag) =>
        '<span class="tag-token">' + escapeHtml(tag) + '<button type="button" onclick="removeTag(\\'' + escapeJs(tag) + '\\')">×</button></span>'
      ).join('') + '</div>';
    }

    function tagSuggestionsHtml(selected) {
      const search = state.tagSearch.trim().toLowerCase();
      const selectedSet = new Set(selected);
      const suggestions = (state.meta?.tags || [])
        .filter((tag) => !selectedSet.has(tag))
        .filter((tag) => !search || tag.toLowerCase().includes(search))
        .slice(0, 18);

      if (!suggestions.length) return '<div id="tag-suggestions" class="tag-suggestions"><span class="suggestion-title">推荐标签</span><span class="pill">输入后按 Enter 添加新标签</span></div>';

      return '<div id="tag-suggestions" class="tag-suggestions"><span class="suggestion-title">推荐标签</span>' + suggestions.map((tag) =>
        '<button class="chip-button" type="button" onclick="addTag(\\'' + escapeJs(tag) + '\\')">' + escapeHtml(tag) + '</button>'
      ).join('') + '</div>';
    }

    function coverOptionsHtml() {
      const covers = state.meta?.covers || [];
      if (!covers.length) return '';
      const current = state.editing?.cover || '';

      return '<div class="cover-grid">' + covers.map((cover) =>
        '<button class="cover-option ' + (cover.path === current ? 'active' : '') + '" type="button" data-cover-path="' + escapeAttr(cover.path) + '" onclick="selectCover(\\'' + escapeJs(cover.path) + '\\')"><img src="' + escapeAttr(cover.previewUrl) + '" alt="" /><span>' + escapeHtml(cover.name) + '</span></button>'
      ).join('') + '</div>';
    }

    function coverPreviewHtml(cover) {
      return '<div id="cover-preview-holder" class="cover-preview">' + coverPreviewInnerHtml(cover) + '</div>';
    }

    function coverPreviewInnerHtml(cover) {
      if (!cover) return '<div class="cover-frame">未设置封面，将使用站点默认封面。</div>';

      const known = findCover(cover);
      if (known) return '<div class="cover-frame"><img src="' + escapeAttr(known.previewUrl) + '" alt="封面预览" /></div><div class="notice">已选择：' + escapeHtml(known.path) + '</div>';

      if (/^https?:\\/\\//.test(cover)) {
        return '<div class="cover-frame"><img src="' + escapeAttr(cover) + '" alt="封面预览" onerror="this.replaceWith(document.createTextNode(\\'外部图片无法预览\\'))" /></div><div class="notice">外部图片地址。</div>';
      }

      return '<div class="cover-frame">找不到这个本地封面图。请确认路径在 public/images/covers 中。</div><div class="notice">' + escapeHtml(cover) + '</div>';
    }

    function findCover(coverPath) {
      return (state.meta?.covers || []).find((cover) => cover.path === coverPath);
    }

    function getTextMetrics(markdown) {
      const codeFence = new RegExp('\\\\x60\\\\x60\\\\x60[\\\\s\\\\S]*?\\\\x60\\\\x60\\\\x60', 'g');
      const text = String(markdown || '').replace(codeFence, '').replace(/[#>*_\\-[\\]()]/g, ' ');
      const chinese = text.match(/[\\u4e00-\\u9fff]/g)?.length || 0;
      const latin = text
        .replace(/[\\u4e00-\\u9fff]/g, ' ')
        .trim()
        .split(/\\s+/)
        .filter(Boolean).length;
      const words = chinese + latin;
      const minutes = Math.max(1, Math.ceil(chinese / 420 + latin / 220));

      return { words, minutes };
    }

    function getHeadings(markdown) {
      return String(markdown || '')
        .split('\\n')
        .map((line) => {
          const match = line.match(/^(#{1,3})\\s+(.+)$/);
          if (!match) return null;
          const title = match[2].trim();
          return {
            level: match[1].length,
            title,
            id: headingId(title)
          };
        })
        .filter(Boolean);
    }

    function tocHtml(markdown) {
      const headings = getHeadings(markdown);
      if (!headings.length) return '<span>暂无目录</span>';

      return '<strong>文章目录</strong>' + headings.map((heading) =>
        '<a class="level-' + heading.level + '" href="#' + escapeAttr(heading.id) + '">' + escapeHtml(heading.title) + '</a>'
      ).join('');
    }

    function headingId(title) {
      const id = String(title)
        .trim()
        .toLowerCase()
        .replace(/[^\\p{Letter}\\p{Number}]+/gu, '-')
        .replace(/^-+|-+$/g, '');
      return id || 'section';
    }

    function postUrlFromPath(postPath) {
      const normalized = String(postPath || '')
        .replace(/\\\\/g, '/')
        .replace(/^src\\/content\\/blog\\//, '')
        .replace(/^src\\/content\\/posts\\//, '')
        .replace(/\\.(md|mdx)$/i, '');
      return normalized ? '/blog/posts/' + normalized : '/blog/posts/';
    }

    function bindViewEvents() {
      if (state.view === 'new') {
        document.getElementById('newPostForm')?.addEventListener('submit', createNewPost);
      }

      if (state.view === 'posts' || state.view === 'drafts') {
        const search = document.getElementById('searchInput');
        search?.addEventListener('input', debounce((event) => {
          state.search = event.target.value;
          loadPosts(state.view === 'drafts');
        }, 250));
        document.getElementById('refreshPosts')?.addEventListener('click', () => loadPosts(state.view === 'drafts'));
      }

      if (state.view === 'editor') {
        bindEditorEvents();
        document.getElementById('savePost')?.addEventListener('click', saveEditingPost);
      }
    }

    function bindEditorEvents() {
      const body = document.getElementById('edit-body');
      const preview = document.getElementById('preview');
      if (!body || !preview) return;

      const metadataInputs = ['edit-title', 'edit-description', 'edit-cover'];
      for (const id of metadataInputs) {
        document.getElementById(id)?.addEventListener('input', () => {
          syncEditingFromDom();
          markEditorDirty();
          if (id === 'edit-cover') {
            updateCoverPreviewOnly();
            updateCoverSelection();
          }
        });
      }

      const categoryInput = document.getElementById('edit-category');
      categoryInput?.addEventListener('focus', () => {
        state.categoryQuery = categoryInput.value;
        state.categoryMenuOpen = true;
        updateCategoryControls();
      });
      categoryInput?.addEventListener('input', () => {
        if (!state.editing) return;
        state.editing.category = categoryInput.value;
        state.categoryQuery = categoryInput.value;
        state.categoryMenuOpen = true;
        markEditorDirty();
        updateCategoryControls();
      });
      categoryInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          createOrSelectCategory();
          return;
        }
        if (event.key === 'Escape') {
          state.categoryMenuOpen = false;
          updateCategoryControls();
        }
      });
      categoryInput?.addEventListener('blur', () => {
        setTimeout(() => {
          const value = normalizeCategory(categoryInput.value);
          if (!value) categoryInput.value = state.editing?.category || '随笔';
          if (state.editing) state.editing.category = categoryInput.value;
          state.categoryMenuOpen = false;
          markEditorDirty();
          updateCategoryControls();
        }, 120);
      });

      body.addEventListener('input', () => {
        if (state.editing) state.editing.body = body.value;
        markEditorDirty();
        updateEditorPreview();
        updateSlashMenu();
      });
      body.addEventListener('keyup', updateSlashMenu);
      body.addEventListener('click', updateSlashMenu);
      body.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') hideSlashMenu();
      });

      body.addEventListener('scroll', () => {
        if (!state.syncPreview) return;
        const previewBox = document.getElementById('preview');
        if (!previewBox) return;
        const sourceMax = Math.max(1, body.scrollHeight - body.clientHeight);
        const targetMax = Math.max(1, previewBox.scrollHeight - previewBox.clientHeight);
        previewBox.scrollTop = (body.scrollTop / sourceMax) * targetMax;
      });

      const tagSearch = document.getElementById('tag-search');
      tagSearch?.addEventListener('input', (event) => {
        state.tagSearch = event.target.value;
        updateTagControls();
      });
      tagSearch?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        addTagFromSearch();
      });

      document.getElementById('sync-preview')?.addEventListener('change', (event) => {
        state.syncPreview = event.target.checked;
      });
      document.getElementById('autosave-toggle')?.addEventListener('change', (event) => {
        state.autosave = event.target.checked;
        if (state.autosave && state.dirty) scheduleAutosave();
        if (!state.autosave) cancelAutosave();
      });

      updateEditorPreview();
      updateSavePill();
      applyEditorChromeState();
    }

    function syncEditingFromDom() {
      if (!state.editing) return;
      state.editing.title = valueOf('edit-title') || state.editing.title;
      state.editing.category = valueOf('edit-category') || '随笔';
      state.editing.description = valueOf('edit-description');
      state.editing.cover = valueOf('edit-cover');
      state.editing.body = valueOf('edit-body');
    }

    function markEditorDirty() {
      state.dirty = getEditorSnapshot(getEditorPayload()) !== state.editorSnapshot;
      state.saveStatus = state.dirty ? 'dirty' : 'saved';
      updateSavePill();
      if (state.dirty) scheduleAutosave();
      else cancelAutosave();
    }

    function scheduleAutosave() {
      cancelAutosave();
      if (!state.autosave || state.view !== 'editor' || !state.editing) return;
      state.autosaveTimer = setTimeout(() => {
        if (state.view === 'editor' && state.editing && state.dirty) saveEditingPost({ silent: true, autosave: true });
      }, 2000);
    }

    function cancelAutosave() {
      if (state.autosaveTimer) clearTimeout(state.autosaveTimer);
      state.autosaveTimer = null;
    }

    function setSaveStatus(status) {
      state.saveStatus = status;
      updateSavePill();
    }

    function updateSavePill() {
      const pill = document.querySelector('.save-pill');
      if (!pill) return;
      pill.className = 'save-pill ' + saveStatusClass();
      pill.textContent = saveStatusText();
    }

    function updateEditorPreview() {
      const body = document.getElementById('edit-body');
      const preview = document.getElementById('preview');
      const toc = document.getElementById('toc');
      const metrics = document.getElementById('editorMetrics');
      const statusMetrics = document.getElementById('statusMetrics');
      if (!body || !preview) return;

      preview.innerHTML = markdownToHtml(body.value);
      if (toc) toc.innerHTML = tocHtml(body.value);

      const textMetrics = getTextMetrics(body.value);
      if (metrics) metrics.textContent = textMetrics.words + ' 字 · ' + textMetrics.minutes + ' 分钟阅读';
      if (statusMetrics) statusMetrics.innerHTML = '字数：<strong>' + textMetrics.words + '</strong><br />预计阅读：<strong>' + textMetrics.minutes + ' 分钟</strong>';
    }

    function updateCoverPreviewOnly() {
      const holder = document.getElementById('cover-preview-holder');
      if (!holder) return;
      holder.innerHTML = coverPreviewInnerHtml(valueOf('edit-cover'));
    }

    function updateCoverSelection() {
      const current = valueOf('edit-cover') || state.editing?.cover || '';
      document.querySelectorAll('.cover-option').forEach((button) => {
        button.classList.toggle('active', button.dataset.coverPath === current);
      });
    }

    function getEditorPayload() {
      return {
        title: normalizeText(valueOf('edit-title') || state.editing?.title || ''),
        category: normalizeText(valueOf('edit-category') || state.editing?.category || '随笔') || '随笔',
        tags: cleanTags(state.editing?.tags || []),
        description: valueOf('edit-description').trim(),
        cover: valueOf('edit-cover').trim(),
        draft: Boolean(state.editing?.draft),
        body: valueOf('edit-body')
      };
    }

    function getEditorSnapshot(payload) {
      return JSON.stringify({
        title: payload.title,
        category: payload.category,
        tags: [...(payload.tags || [])].sort(),
        description: payload.description,
        cover: payload.cover,
        draft: payload.draft,
        body: payload.body
      });
    }

    function normalizeText(value) {
      return String(value || '').trim().replace(/\\s+/g, ' ');
    }

    function normalizeCategory(value) {
      return normalizeText(value);
    }

    function categoryKey(value) {
      return normalizeCategory(value).toLocaleLowerCase('zh-CN');
    }

    function getCategoryList() {
      const seen = new Set();
      const categories = [];
      for (const category of state.meta?.categories || []) {
        const normalized = normalizeCategory(category);
        const key = categoryKey(normalized);
        if (!normalized || seen.has(key)) continue;
        seen.add(key);
        categories.push(normalized);
      }
      return categories.sort((a, b) => a.localeCompare(b, 'zh-CN'));
    }

    function upsertCategory(category) {
      const normalized = normalizeCategory(category);
      if (!normalized) return { category: '', created: false };

      state.meta = state.meta || { categories: [], tags: [], covers: [] };
      const existing = getCategoryList().find((item) => categoryKey(item) === categoryKey(normalized));
      if (existing) return { category: existing, created: false };

      state.meta.categories = [...getCategoryList(), normalized].sort((a, b) => a.localeCompare(b, 'zh-CN'));
      return { category: normalized, created: true };
    }

    function cleanTags(tags) {
      const seen = new Set();
      const result = [];
      for (const tag of tags || []) {
        const nextTag = normalizeText(tag);
        if (!nextTag || seen.has(nextTag)) continue;
        seen.add(nextTag);
        result.push(nextTag);
      }
      return result;
    }

    async function createNewPost(event) {
      event.preventDefault();
      const form = new FormData(event.target);
      const payload = {
        title: form.get('title'),
        category: form.get('category') || '随笔',
        tags: form.get('tags') || '',
        description: form.get('description') || '',
        cover: form.get('cover') || '',
        draft: form.get('draft') === 'on'
      };
      const data = await api('/posts', { method: 'POST', body: JSON.stringify(payload) });
      showMessage('已创建文章：' + data.post.path);
      setView('posts');
    }

    async function editPost(id) {
      try {
        await loadMeta();
        state.view = 'editor';
        state.editing = null;
        state.message = '';
        state.dirty = false;
        state.saveStatus = 'saved';
        cancelAutosave();
        render();
        const data = await api('/posts/' + encodeURIComponent(id));
        state.editing = data.post;
        state.tagSearch = '';
        state.categoryQuery = data.post.category || '';
        state.categoryMenuOpen = false;
        state.editorSnapshot = getEditorSnapshot({
          title: data.post.title,
          category: data.post.category,
          tags: data.post.tags || [],
          description: data.post.description || '',
          cover: data.post.cover || '',
          draft: Boolean(data.post.draft),
          body: data.post.body || ''
        });
        render();
      } catch (error) {
        state.view = 'posts';
        state.editing = null;
        showMessage('打开编辑器失败：' + (error.message || '未知错误'));
        await loadPosts(state.view === 'drafts');
      }
    }

    async function saveEditingPost(options = {}) {
      try {
        if (!state.editing || state.saveStatus === 'saving') return;
        cancelAutosave();
        syncEditingFromDom();
        const post = state.editing;
        const payload = getEditorPayload();
        setSaveStatus('saving');
        const data = await api('/posts/' + encodeURIComponent(post.id), { method: 'PUT', body: JSON.stringify(payload) });
        state.editing = { ...data.post, body: payload.body };
        mergeEditorMeta(payload);
        state.editorSnapshot = getEditorSnapshot(payload);
        state.dirty = false;
        state.saveStatus = 'saved';
        state.categoryQuery = payload.category;
        state.categoryMenuOpen = false;
        applyPayloadToEditorFields(payload);
        updateSavePill();
        updateEditorStaticBits();
        updateCategoryControls();
        updateTagControls();
        updateCoverPreviewOnly();
        updateCoverSelection();
      } catch (error) {
        state.saveStatus = 'failed';
        updateSavePill();
        if (!options.silent) showMessage('保存失败：' + (error.message || '未知错误'));
      }
    }

    function mergeEditorMeta(payload) {
      state.meta = state.meta || { categories: [], tags: [], covers: [] };
      upsertCategory(payload.category);
      for (const tag of payload.tags || []) {
        if (!state.meta.tags.includes(tag)) state.meta.tags.push(tag);
      }
      state.meta.tags.sort((a, b) => a.localeCompare(b, 'zh-CN'));
    }

    function updateEditorStaticBits() {
      const post = state.editing;
      if (!post) return;
      const title = document.querySelector('.editor-titleline strong');
      const path = document.querySelector('.editor-titleline span');
      if (title) title.textContent = post.title || '未命名文章';
      if (path) path.textContent = post.path || '';
    }

    function applyPayloadToEditorFields(payload) {
      const fields = {
        'edit-title': payload.title,
        'edit-category': payload.category,
        'edit-description': payload.description,
        'edit-cover': payload.cover
      };
      for (const [id, value] of Object.entries(fields)) {
        const input = document.getElementById(id);
        if (input) input.value = value || '';
      }
    }

    function setCategory(category) {
      if (!state.editing) return;
      const result = upsertCategory(category);
      if (!result.category) {
        showToast('分类不能为空。');
        return;
      }
      state.editing.category = result.category;
      state.categoryQuery = result.category;
      state.categoryMenuOpen = false;
      const input = document.getElementById('edit-category');
      if (input) input.value = result.category;
      markEditorDirty();
      updateCategoryControls();
      if (result.created) showToast('已创建分类：' + result.category);
    }

    function createOrSelectCategory() {
      const input = document.getElementById('edit-category');
      setCategory(input?.value || '');
    }

    function updateCategoryControls() {
      const holder = document.getElementById('category-choices');
      if (!holder) return;
      const current = normalizeCategory(valueOf('edit-category') || state.editing?.category || '');
      state.categoryQuery = current;
      holder.classList.toggle('hidden', !state.categoryMenuOpen);
      holder.innerHTML = categoryMenuItemsHtml(current);
    }

    function addTag(tag) {
      if (!state.editing) return;
      const nextTag = normalizeText(tag);
      if (!nextTag) return;
      state.editing.tags = cleanTags([...(state.editing.tags || []), nextTag]);
      mergeEditorMeta({ category: state.editing.category || '随笔', tags: [nextTag] });
      state.tagSearch = '';
      markEditorDirty();
      const input = document.getElementById('tag-search');
      if (input) input.value = '';
      updateTagControls();
    }

    function addTagFromSearch() {
      const input = document.getElementById('tag-search');
      addTag(input?.value || '');
    }

    function removeTag(tag) {
      if (!state.editing) return;
      state.editing.tags = (state.editing.tags || []).filter((item) => item !== tag);
      markEditorDirty();
      updateTagControls();
    }

    function updateTagControls() {
      if (!state.editing) return;
      const selected = document.getElementById('selected-tags');
      const suggestions = document.getElementById('tag-suggestions');
      if (selected) selected.outerHTML = selectedTagsHtml(state.editing.tags || []);
      if (suggestions) suggestions.outerHTML = tagSuggestionsHtml(state.editing.tags || []);
    }

    function selectCover(coverPath) {
      if (!state.editing) return;
      state.editing.cover = coverPath;
      const input = document.getElementById('edit-cover');
      if (input) input.value = coverPath;
      markEditorDirty();
      updateCoverPreviewOnly();
      updateCoverSelection();
    }

    function insertMarkdown(command) {
      const body = document.getElementById('edit-body');
      if (!body) return;
      const start = body.selectionStart || 0;
      const end = body.selectionEnd || start;
      const selected = body.value.slice(start, end);
      const snippets = {
        h1: ['# ', selected || '标题'],
        h2: ['## ', selected || '小标题'],
        bold: ['**', selected || '加粗文字', '**'],
        quote: ['> ', selected || '这里写引用'],
        list: ['- ', selected || '列表项'],
        code: ['\\x60\\x60\\x60\\n', selected || 'code', '\\n\\x60\\x60\\x60']
      };
      const parts = snippets[command];
      if (!parts) return;

      const text = parts.length === 3 ? parts[0] + parts[1] + parts[2] : parts[0] + parts[1];
      body.setRangeText(text, start, end, 'end');
      body.focus();
      if (parts.length === 3 && !selected) {
        body.selectionStart = start + parts[0].length;
        body.selectionEnd = body.selectionStart + parts[1].length;
      }
      body.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function updateSlashMenu() {
      const body = document.getElementById('edit-body');
      const menu = document.getElementById('slash-menu');
      if (!body || !menu) return;

      const position = body.selectionStart || 0;
      const lineStart = body.value.lastIndexOf('\\n', Math.max(0, position - 1)) + 1;
      const currentLine = body.value.slice(lineStart, position).trim();
      menu.classList.toggle('hidden', !currentLine.startsWith('/'));
    }

    function hideSlashMenu() {
      document.getElementById('slash-menu')?.classList.add('hidden');
    }

    function runSlashCommand(command) {
      const body = document.getElementById('edit-body');
      if (!body) return;
      const position = body.selectionStart || 0;
      const lineStart = body.value.lastIndexOf('\\n', Math.max(0, position - 1)) + 1;
      body.setSelectionRange(lineStart, position);
      hideSlashMenu();
      insertMarkdown(command);
    }

    function togglePreview() {
      state.previewVisible = !state.previewVisible;
      render();
    }

    function toggleSidebar() {
      state.sidebarVisible = !state.sidebarVisible;
      applyEditorChromeState();
      render();
    }

    function toggleFocusMode() {
      state.focusMode = !state.focusMode;
      applyEditorChromeState();
      render();
    }

    async function toggleFullscreen() {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
          state.fullscreen = true;
        } else {
          await document.exitFullscreen();
          state.fullscreen = false;
        }
      } catch (error) {
        showMessage('全屏切换失败：' + (error.message || '浏览器拒绝了全屏请求'));
      }
      render();
    }

    function applyEditorChromeState() {
      document.body.classList.toggle('sidebar-collapsed', !state.sidebarVisible);
      document.body.classList.toggle('focus-mode', state.focusMode);
    }

    async function publishEditingPost() {
      if (!state.editing) return;
      if (state.dirty) {
        await saveEditingPost();
        if (state.dirty) return;
      }
      const body = state.editing.body || '';
      const data = await api('/posts/' + encodeURIComponent(state.editing.id) + '/publish', { method: 'POST' });
      state.editing = { ...state.editing, ...data.post, body };
      state.dirty = false;
      state.saveStatus = 'saved';
      state.editorSnapshot = getEditorSnapshot(getEditorPayload());
      render();
    }

    async function draftEditingPost() {
      if (!state.editing) return;
      if (state.dirty) {
        await saveEditingPost();
        if (state.dirty) return;
      }
      const body = state.editing.body || '';
      const data = await api('/posts/' + encodeURIComponent(state.editing.id) + '/draft', { method: 'POST' });
      state.editing = { ...state.editing, ...data.post, body };
      state.dirty = false;
      state.saveStatus = 'saved';
      state.editorSnapshot = getEditorSnapshot(getEditorPayload());
      render();
    }

    async function touchEditingPost() {
      if (!state.editing) return;
      const body = state.editing.body || valueOf('edit-body');
      const data = await api('/posts/' + encodeURIComponent(state.editing.id) + '/touch', { method: 'POST' });
      state.editing = { ...state.editing, ...data.post, body };
      showMessage('updated 日期已更新。');
      state.view = 'editor';
      render();
    }

    async function deleteEditingPost() {
      if (!state.editing) return;
      const title = state.editing.title || '未命名文章';
      if (!confirm('确认删除《' + title + '》吗？文章会先移动到 .trash/posts/。')) return;
      if (!confirm('请再次确认：删除后需要到回收站恢复。继续删除吗？')) return;
      await api('/posts/' + encodeURIComponent(state.editing.id) + '/delete', { method: 'POST' });
      state.dirty = false;
      state.editing = null;
      state.view = 'posts';
      showMessage('已删除到回收站。');
      await loadPosts(false);
    }

    async function publishPost(id) {
      await api('/posts/' + id + '/publish', { method: 'POST' });
      showMessage('已发布文章。');
      loadPosts(state.view === 'drafts');
    }

    async function draftPost(id) {
      await api('/posts/' + id + '/draft', { method: 'POST' });
      showMessage('已设为草稿。');
      loadPosts(state.view === 'drafts');
    }

    async function touchPost(id) {
      await api('/posts/' + id + '/touch', { method: 'POST' });
      showMessage('updated 日期已更新。');
      loadPosts(state.view === 'drafts');
    }

    async function renamePostUi(id, title) {
      const nextTitle = prompt('请输入新标题：', title);
      if (!nextTitle) return;
      await api('/posts/' + id + '/rename', { method: 'POST', body: JSON.stringify({ title: nextTitle }) });
      showMessage('已重命名文章。');
      loadPosts(state.view === 'drafts');
    }

    async function deletePostUi(id, title) {
      if (!confirm('确认删除《' + title + '》吗？文章会先移动到 .trash/posts/。')) return;
      await api('/posts/' + id + '/delete', { method: 'POST' });
      showMessage('已删除到回收站。');
      loadPosts(state.view === 'drafts');
    }

    async function restorePost(id) {
      await api('/trash/' + id + '/restore', { method: 'POST' });
      showMessage('文章已恢复。');
      loadTrash();
    }

    async function purgePost(id, title) {
      if (!confirm('此操作不可恢复。确认永久删除《' + title + '》吗？')) return;
      await api('/trash/' + id, { method: 'DELETE' });
      showMessage('已永久删除。');
      loadTrash();
    }

    function pickIdea() {
      if (!state.ideas.length) return;
      state.currentIdea = state.ideas[Math.floor(Math.random() * state.ideas.length)];
    }

    async function createIdeaDraft() {
      const data = await api('/ideas/draft', { method: 'POST', body: JSON.stringify({ title: state.currentIdea }) });
      showMessage('已创建草稿：' + data.post.relativePath);
      setView('drafts');
    }

    function field(label, name, value) {
      return '<label><span>' + label + '</span><input name="' + name + '" id="' + name + '" value="' + escapeAttr(value || '') + '" /></label>';
    }

    function tagsHtml(tags) {
      if (!tags || tags.length === 0) return '<span class="pill">[]</span>';
      return tags.map((tag) => '<span class="pill">' + escapeHtml(tag) + '</span>').join('');
    }

    function valueOf(id) {
      return document.getElementById(id)?.value || '';
    }

    function markdownToHtml(markdown) {
      const lines = escapeHtml(markdown || '').split('\\n');
      let inList = false;
      const html = [];
      for (const line of lines) {
        if (/^###\\s+/.test(line)) { closeList(); const title = line.replace(/^###\\s+/, ''); html.push('<h3 id="' + escapeAttr(headingId(title)) + '">' + title + '</h3>'); continue; }
        if (/^##\\s+/.test(line)) { closeList(); const title = line.replace(/^##\\s+/, ''); html.push('<h2 id="' + escapeAttr(headingId(title)) + '">' + title + '</h2>'); continue; }
        if (/^#\\s+/.test(line)) { closeList(); const title = line.replace(/^#\\s+/, ''); html.push('<h1 id="' + escapeAttr(headingId(title)) + '">' + title + '</h1>'); continue; }
        if (/^&gt;\\s+/.test(line)) { closeList(); html.push('<blockquote>' + line.replace(/^&gt;\\s+/, '') + '</blockquote>'); continue; }
        if (/^-\\s+/.test(line)) {
          if (!inList) { html.push('<ul>'); inList = true; }
          html.push('<li>' + line.replace(/^-\\s+/, '') + '</li>');
          continue;
        }
        if (!line.trim()) { closeList(); html.push('<br />'); continue; }
        closeList(); html.push('<p>' + line + '</p>');
      }
      closeList();
      return html.join('');

      function closeList() {
        if (inList) { html.push('</ul>'); inList = false; }
      }
    }

    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }

    function escapeAttr(value) {
      return escapeHtml(value).replace(/\\n/g, '&#10;');
    }

    function escapeJs(value) {
      return String(value || '').replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'").replace(/\\n/g, '\\\\n').replace(/\\r/g, '');
    }

    function debounce(fn, wait) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
      };
    }

    setView('dashboard');
  </script>
</body>
</html>`;
}
