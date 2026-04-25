import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

import { link } from '@/lib/paths';
import { sortPosts } from '@/lib/posts';
import { SITE } from '@/lib/site';

export const GET: APIRoute = async (context) => {
  const posts = sortPosts(await getCollection('blog'));
  const site = context.site ?? new URL('https://yourname.github.io');

  return rss({
    title: SITE.title,
    description: SITE.description,
    site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: link(`/posts/${post.slug}`)
    }))
  });
};
