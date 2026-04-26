import { defineCollection, z } from 'astro:content';
import { ARTICLE_DEFAULTS } from '@/lib/site';

const dateField = z.coerce.date();

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: dateField,
    updated: dateField.optional(),
    category: z.string().default('随笔'),
    tags: z.array(z.string()).default([...ARTICLE_DEFAULTS.defaultTags]),
    description: z.string().default(''),
    cover: z
      .string()
      .optional()
      .transform((value) => (value?.trim() ? value : undefined)),
    draft: z.boolean().default(ARTICLE_DEFAULTS.draft)
  })
});

export const collections = { blog };
