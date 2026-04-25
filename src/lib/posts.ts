import type { CollectionEntry } from 'astro:content';

import { getCategoryName } from './site';

export type BlogPost = CollectionEntry<'blog'>;

export function sortPosts(posts: BlogPost[]) {
  return posts
    .filter((post) => !post.data.draft)
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function getReadingTime(body = '') {
  const chineseChars = body.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const latinWords = body
    .replace(/[\u4e00-\u9fff]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const minutes = Math.ceil(chineseChars / 420 + latinWords / 220);
  return Math.max(1, minutes);
}

export function getAllTags(posts: BlogPost[]) {
  return Array.from(new Set(posts.flatMap((post) => post.data.tags))).sort((a, b) =>
    a.localeCompare(b, 'zh-CN')
  );
}

export function getCategoryCounts(posts: BlogPost[]) {
  return posts.reduce<Record<string, number>>((counts, post) => {
    counts[post.data.category] = (counts[post.data.category] ?? 0) + 1;
    return counts;
  }, {});
}

export function getTagCounts(posts: BlogPost[]) {
  return posts.reduce<Record<string, number>>((counts, post) => {
    for (const tag of post.data.tags) {
      counts[tag] = (counts[tag] ?? 0) + 1;
    }
    return counts;
  }, {});
}

export function slugify(value: string) {
  const slug = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || encodeURIComponent(value);
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

export function postDescription(post: BlogPost) {
  return `${getCategoryName(post.data.category)} · ${formatDate(post.data.date)} · ${getReadingTime(post.body)} 分钟阅读`;
}
