import { defineCollection, z } from 'astro:content';
import { ARTICLE_DEFAULTS, categorySlugs } from '@/lib/site';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    category: z.enum(categorySlugs),
    tags: z.array(z.string()).default([...ARTICLE_DEFAULTS.defaultTags]),
    cover: z.string().optional(),
    draft: z.boolean().default(ARTICLE_DEFAULTS.draft)
  })
});

export const collections = { blog };
