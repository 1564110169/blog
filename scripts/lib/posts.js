import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { escapeYamlString, formatYamlArray, splitFrontmatter, updateFrontmatterContent } from './frontmatter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..', '..');
export const CONTENT_ROOT = path.join(ROOT, 'src', 'content');
export const PREFERRED_POST_DIR = path.join(CONTENT_ROOT, 'posts');
export const FALLBACK_POST_DIR = path.join(CONTENT_ROOT, 'blog');
export const TRASH_POST_DIR = path.join(ROOT, '.trash', 'posts');
export const TEMPLATE_PATH = path.join(ROOT, 'scripts', 'templates', 'post.md');
export const IDEAS_PATH = path.join(ROOT, 'scripts', 'ideas.json');
export const POST_EXTENSIONS = new Set(['.md', '.mdx']);
export const DEFAULT_CATEGORY = '随笔';

export async function findPostDir() {
  if (await hasPosts(PREFERRED_POST_DIR)) return PREFERRED_POST_DIR;
  if (await hasPosts(FALLBACK_POST_DIR)) return FALLBACK_POST_DIR;
  if (existsSync(PREFERRED_POST_DIR)) return PREFERRED_POST_DIR;
  if (existsSync(FALLBACK_POST_DIR)) return FALLBACK_POST_DIR;

  const entries = await fs.readdir(CONTENT_ROOT, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const candidate = path.join(CONTENT_ROOT, entry.name);
    if (await hasPosts(candidate)) return candidate;
  }

  return PREFERRED_POST_DIR;
}

export async function readPosts() {
  const postDir = await findPostDir();
  const files = await walk(postDir);
  const posts = [];

  for (const filePath of files.filter(isPostFile)) {
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = splitFrontmatter(content);
    const data = parsed.data;

    posts.push({
      filePath,
      relativePath: toRelative(filePath),
      fileName: path.basename(filePath),
      title: String(data.title || path.basename(filePath, path.extname(filePath))),
      date: stringifyDate(data.date),
      updated: stringifyDate(data.updated),
      category: String(data.category || ''),
      tags: normalizeTags(data.tags),
      draft: data.draft === true,
      body: parsed.body,
      data
    });
  }

  return sortPosts(posts);
}

export async function createPost(post, options = {}) {
  const postDir = await findPostDir();
  const date = today();
  const template = await fs.readFile(TEMPLATE_PATH, 'utf8');
  const filePath = await getUniquePostPath(postDir, date, post.title, '.md');
  const content = renderTemplate(template, {
    title: post.title,
    date,
    updated: date,
    category: post.category,
    tags: post.tags,
    description: post.description,
    cover: post.cover,
    draft: post.draft
  });

  await fs.mkdir(postDir, { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');

  return {
    filePath,
    relativePath: toRelative(filePath),
    openedInVSCode: options.openEditor === false ? false : openInVSCode(filePath)
  };
}

export async function updatePostFrontmatter(post, updates) {
  const content = await fs.readFile(post.filePath, 'utf8');
  const nextContent = updateFrontmatterContent(content, updates);
  await fs.writeFile(post.filePath, nextContent, 'utf8');
}

export async function renamePost(post, newTitle) {
  const extension = path.extname(post.filePath);
  const postDir = path.dirname(post.filePath);
  const date = post.date || today();
  const targetPath = await getUniquePostPath(postDir, date, newTitle, extension, post.filePath);
  const content = await fs.readFile(post.filePath, 'utf8');
  const nextContent = updateFrontmatterContent(content, {
    title: newTitle,
    updated: today()
  });

  await fs.writeFile(post.filePath, nextContent, 'utf8');

  if (!samePath(post.filePath, targetPath)) {
    await fs.rename(post.filePath, targetPath);
  }

  return {
    filePath: targetPath,
    relativePath: toRelative(targetPath)
  };
}

export async function deletePostToTrash(post) {
  await fs.mkdir(TRASH_POST_DIR, { recursive: true });

  const backupPath = getUniqueTrashPath(post.fileName);
  const metaPath = getTrashMetaPath(backupPath);
  const metadata = {
    title: post.title,
    originalPath: post.filePath,
    originalRelativePath: post.relativePath,
    deletedAt: new Date().toISOString()
  };

  await fs.copyFile(post.filePath, backupPath);
  await fs.writeFile(metaPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  await fs.unlink(post.filePath);

  return {
    backupPath,
    relativeBackupPath: toRelative(backupPath)
  };
}

export async function readTrashPosts() {
  const files = (await fs.readdir(TRASH_POST_DIR).catch(() => [])).map((fileName) => path.join(TRASH_POST_DIR, fileName));
  const posts = [];

  for (const filePath of files.filter(isPostFile)) {
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = splitFrontmatter(content);
    const metadata = await readTrashMetadata(filePath);

    posts.push({
      filePath,
      relativePath: toRelative(filePath),
      fileName: path.basename(filePath),
      title: metadata.title || String(parsed.data.title || path.basename(filePath, path.extname(filePath))),
      originalPath: metadata.originalPath,
      originalRelativePath: metadata.originalRelativePath,
      deletedAt: metadata.deletedAt || '',
      data: parsed.data
    });
  }

  return posts.sort((a, b) => Date.parse(b.deletedAt || 0) - Date.parse(a.deletedAt || 0));
}

export async function restorePostFromTrash(trashedPost) {
  const fallbackDir = await findPostDir();
  const originalPath = getSafeRestorePath(trashedPost.originalPath, fallbackDir, trashedPost.fileName);
  const targetPath = getUniqueRestoredPath(originalPath);

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.rename(trashedPost.filePath, targetPath);
  await fs.rm(getTrashMetaPath(trashedPost.filePath), { force: true });

  return {
    filePath: targetPath,
    relativePath: toRelative(targetPath)
  };
}

function getSafeRestorePath(originalPath, fallbackDir, fileName) {
  if (originalPath) {
    const resolved = path.resolve(originalPath);
    if (isInsideDirectory(resolved, fallbackDir)) return resolved;
  }

  return path.join(fallbackDir, fileName);
}

export async function readIdeas() {
  try {
    const ideas = JSON.parse(await fs.readFile(IDEAS_PATH, 'utf8'));
    if (Array.isArray(ideas) && ideas.length > 0) return ideas.map(String);
  } catch {
    // Keep the command useful even if the ideas file is edited incorrectly.
  }

  return ['今天想写的一件小事'];
}

export function searchPosts(posts, keyword) {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return [];

  return posts.filter((post) => {
    const haystack = [
      post.title,
      post.category,
      post.tags.join(' '),
      post.fileName,
      post.relativePath,
      post.body
    ]
      .join('\n')
      .toLowerCase();

    return haystack.includes(normalized);
  });
}

export function getStats(posts) {
  const tags = new Set(posts.flatMap((post) => post.tags));
  const categories = new Set(posts.map((post) => post.category).filter(Boolean));
  const drafts = posts.filter((post) => post.draft);

  return {
    total: posts.length,
    published: posts.length - drafts.length,
    drafts: drafts.length,
    categoryCount: categories.size,
    tagCount: tags.size,
    recent: posts.slice(0, 10)
  };
}

export function sortPosts(posts) {
  return [...posts].sort((a, b) => dateSortValue(b.date) - dateSortValue(a.date) || a.title.localeCompare(b.title, 'zh-CN'));
}

export function renderTemplate(template, data) {
  const replacements = {
    title: escapeYamlString(data.title),
    date: data.date,
    updated: data.updated,
    category: escapeYamlString(data.category),
    tags: formatYamlArray(data.tags),
    description: escapeYamlString(data.description),
    cover: escapeYamlString(data.cover),
    draft: String(data.draft)
  };

  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    return Object.hasOwn(replacements, key) ? replacements[key] : match;
  });
}

export async function getUniquePostPath(postDir, date, title, extension = '.md', currentPath = '') {
  const slug = sanitizeFilename(title);
  const baseName = `${date}-${slug}`;
  let suffix = 0;

  while (true) {
    const fileName = suffix === 0 ? `${baseName}${extension}` : `${baseName}-${suffix}${extension}`;
    const filePath = path.join(postDir, fileName);
    if (!existsSync(filePath) || samePath(filePath, currentPath)) return filePath;
    suffix += 1;
  }
}

export function sanitizeFilename(title) {
  const slug = title
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{Letter}\p{Number}_-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'untitled';
}

export function splitTags(value) {
  return value
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function parseBoolean(value, fallback = false) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (['true', 't', 'yes', 'y', '1', '是'].includes(normalized)) return true;
  if (['false', 'f', 'no', 'n', '0', '否'].includes(normalized)) return false;
  return fallback;
}

export function today() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function toRelative(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

export function openInVSCode(filePath) {
  if (!hasCodeCommand()) return false;

  try {
    const child = spawn('code', [filePath], {
      detached: true,
      shell: process.platform === 'win32',
      stdio: 'ignore'
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

async function hasPosts(dir) {
  if (!existsSync(dir)) return false;
  const files = await walk(dir);
  return files.some(isPostFile);
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function isPostFile(filePath) {
  return POST_EXTENSIONS.has(path.extname(filePath));
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map(String);
  if (typeof tags === 'string') return splitTags(tags);
  return [];
}

function stringifyDate(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function dateSortValue(value) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getUniqueTrashPath(fileName) {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  let suffix = 0;

  while (true) {
    const backupName = suffix === 0 ? `${baseName}${extension}` : `${baseName}-${suffix}${extension}`;
    const backupPath = path.join(TRASH_POST_DIR, backupName);
    if (!existsSync(backupPath)) return backupPath;
    suffix += 1;
  }
}

function getUniqueRestoredPath(originalPath) {
  if (!existsSync(originalPath)) return originalPath;

  const dir = path.dirname(originalPath);
  const extension = path.extname(originalPath);
  const baseName = path.basename(originalPath, extension);
  const restoredPath = path.join(dir, `${baseName}-restored${extension}`);

  if (!existsSync(restoredPath)) return restoredPath;

  let suffix = 1;
  while (true) {
    const candidate = path.join(dir, `${baseName}-restored-${suffix}${extension}`);
    if (!existsSync(candidate)) return candidate;
    suffix += 1;
  }
}

async function readTrashMetadata(filePath) {
  try {
    return JSON.parse(await fs.readFile(getTrashMetaPath(filePath), 'utf8'));
  } catch {
    return {};
  }
}

function getTrashMetaPath(filePath) {
  return `${filePath}.meta.json`;
}

function hasCodeCommand() {
  const result =
    process.platform === 'win32'
      ? spawnSync('where', ['code'], { stdio: 'ignore' })
      : spawnSync('sh', ['-lc', 'command -v code'], { stdio: 'ignore' });

  return result.status === 0;
}

function samePath(a, b) {
  if (!a || !b) return false;

  const left = path.resolve(a);
  const right = path.resolve(b);

  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function isInsideDirectory(filePath, directory) {
  const relative = path.relative(path.resolve(directory), path.resolve(filePath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
