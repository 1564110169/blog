#!/usr/bin/env node

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { URL } from 'node:url';

import {
  DEFAULT_CATEGORY,
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
const PORT = 4322;
const ADMIN_URL = `http://localhost:${PORT}/admin`;
const MAX_BODY_SIZE = 5 * 1024 * 1024;

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
    console.error('端口 4322 已被占用，后台没有启动。');
    console.error('请确认是否已经打开了后台，或关闭占用 4322 端口的程序后再试。');
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

  if (req.method === 'GET' && resource === 'settings') {
    const postDir = await findPostDir();
    sendJson(res, 200, {
      postDir: toRelative(postDir),
      trashDir: toRelative(TRASH_POST_DIR),
      adminUrl: ADMIN_URL,
      localOnly: true,
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
    @media (max-width: 1100px) {
      .app { grid-template-columns: 1fr; }
      .sidebar { position: static; height: auto; }
      .stats, .editor, .form-grid { grid-template-columns: 1fr; }
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

  <script>
    const state = {
      view: 'dashboard',
      posts: [],
      stats: null,
      trash: [],
      ideas: [],
      currentIdea: '',
      settings: null,
      search: '',
      editing: null,
      message: ''
    };

    const app = document.getElementById('app');

    document.querySelectorAll('[data-view]').forEach((button) => {
      button.addEventListener('click', () => setView(button.dataset.view));
    });

    function setView(view) {
      state.view = view;
      state.message = '';
      state.editing = null;
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
      render();
    }

    function showMessage(message) {
      state.message = message;
      render();
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
        settings: renderSettings
      };

      app.innerHTML = (state.message ? '<div class="card card-pad" style="margin-bottom:14px">' + escapeHtml(state.message) + '</div>' : '') + views[state.view]();
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

      return renderHeader('编辑文章', escapeHtml(post.path), '<button class="btn" onclick="setView(\\'posts\\')">返回列表</button><button class="btn primary" id="savePost">保存</button>') +
        '<section class="grid">' +
        '<div class="card card-pad form-grid">' +
        field('标题', 'edit-title', post.title) +
        field('分类', 'edit-category', post.category || '随笔') +
        field('标签，用逗号分隔', 'edit-tags', (post.tags || []).join(', ')) +
        field('摘要', 'edit-description', post.description || '') +
        field('封面', 'edit-cover', post.cover || '') +
        '<label class="check" style="margin-top:28px"><input type="checkbox" id="edit-draft" ' + (post.draft ? 'checked' : '') + ' /> 是否草稿</label>' +
        '</div>' +
        '<div class="editor">' +
        '<div class="card card-pad"><label><span>正文 Markdown</span><textarea id="edit-body">' + escapeHtml(post.body || '') + '</textarea></label></div>' +
        '<div class="card preview" id="preview"></div>' +
        '</div>' +
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
        const body = document.getElementById('edit-body');
        const preview = document.getElementById('preview');
        const updatePreview = () => preview.innerHTML = markdownToHtml(body.value);
        body?.addEventListener('input', updatePreview);
        updatePreview();
        document.getElementById('savePost')?.addEventListener('click', saveEditingPost);
      }
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
      state.view = 'editor';
      state.editing = null;
      render();
      const data = await api('/posts/' + id);
      state.editing = data.post;
      render();
    }

    async function saveEditingPost() {
      const post = state.editing;
      const payload = {
        title: valueOf('edit-title'),
        category: valueOf('edit-category') || '随笔',
        tags: valueOf('edit-tags'),
        description: valueOf('edit-description'),
        cover: valueOf('edit-cover'),
        draft: document.getElementById('edit-draft').checked,
        body: valueOf('edit-body')
      };
      const data = await api('/posts/' + post.id, { method: 'PUT', body: JSON.stringify(payload) });
      state.editing = data.post;
      showMessage('已保存：' + data.post.title);
      state.view = 'editor';
      render();
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
        if (/^###\\s+/.test(line)) { closeList(); html.push('<h3>' + line.replace(/^###\\s+/, '') + '</h3>'); continue; }
        if (/^##\\s+/.test(line)) { closeList(); html.push('<h2>' + line.replace(/^##\\s+/, '') + '</h2>'); continue; }
        if (/^#\\s+/.test(line)) { closeList(); html.push('<h1>' + line.replace(/^#\\s+/, '') + '</h1>'); continue; }
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
