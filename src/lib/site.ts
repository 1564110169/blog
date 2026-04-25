import { siteConfig } from '@/site.config';

export type NavItem = {
  readonly label: string;
  readonly href: string;
  readonly children?: readonly NavItem[];
};

export const SITE = siteConfig.site;
export const PROFILE = siteConfig.profile;
export const MUSIC = {
  ...siteConfig.music,
  embedSrc: `https://music.163.com/outchain/player?type=0&id=${siteConfig.music.neteasePlaylistId}&auto=${
    siteConfig.music.autoplay ? 1 : 0
  }&height=${siteConfig.music.playerHeight}`
};
export const FRIENDS = siteConfig.friends;
export const commonTags = siteConfig.commonTags;
export const sidebarNavItems: readonly NavItem[] = siteConfig.navigation.sidebar;
export const categories = siteConfig.categories;

export type CategorySlug = (typeof categories)[number]['slug'];

export const navGroups: readonly NavItem[] = siteConfig.navigation.top;

export function getCategory(slug: string) {
  return categories.find((category) => category.slug === slug);
}

export function getCategoryName(slug: string) {
  return getCategory(slug)?.name ?? slug;
}
