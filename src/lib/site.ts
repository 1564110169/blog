export const SITE = {
  title: '悠的电子手账',
  shortTitle: '悠',
  description: '在电子世界里写点自己的碎碎念',
  author: '悠',
  locale: 'zh-CN',
  startDate: '2026-04-24'
};

export const categories = [
  {
    slug: 'tech',
    name: '技术',
    description: 'Astro、前端、工具链和工程笔记。',
    accent: 'from-yume-400 to-sakura-300'
  },
  {
    slug: 'article',
    name: '文章',
    description: '稍微认真一点的长文与观察。',
    accent: 'from-sky-300 to-yume-300'
  },
  {
    slug: 'thoughts',
    name: '随想',
    description: '生活里的短句、碎片和温柔噪声。',
    accent: 'from-sakura-300 to-rose-300'
  },
  {
    slug: 'reviews',
    name: '影评',
    description: '电影、动画与故事里的余温。',
    accent: 'from-amber-200 to-sakura-300'
  }
] as const;

export type CategorySlug = (typeof categories)[number]['slug'];

export const navGroups = [
  {
    label: '首页',
    href: '/'
  },
  {
    label: '归档',
    href: '/archive',
    children: [
      { label: '技术', href: '/archive/tech' },
      { label: '文章', href: '/archive/article' },
      { label: '随想', href: '/archive/thoughts' },
      { label: '影评', href: '/archive/reviews' }
    ]
  },
  {
    label: '清单',
    href: '/books',
    children: [
      { label: '书单', href: '/books' },
      { label: '番组', href: '/anime' },
      { label: '歌单', href: '/playlist' }
    ]
  },
  {
    label: '友链',
    href: '/friends'
  },
  {
    label: '关于',
    href: '/about'
  }
];

export function getCategory(slug: string) {
  return categories.find((category) => category.slug === slug);
}

export function getCategoryName(slug: string) {
  return getCategory(slug)?.name ?? slug;
}
