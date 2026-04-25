# 悠的电子手账

一个二次元气质的个人博客，使用 Astro、TypeScript、Tailwind CSS 和 Markdown/MDX 构建，纯静态输出，适合直接部署到 GitHub Pages。

当前仓库：`1564110169/blog`  
线上地址：`https://1564110169.github.io/blog`

## 功能

- 首页 Hero、最新文章、推荐文章、分类统计、标签云和个人信息侧栏
- 全局三栏式桌面布局：左侧导航，中间内容，右侧信息面板
- 文章归档、分类页、标签页、文章详情页、友链、书单、番组、歌单、项目、关于我
- 文章使用 Astro Content Collection，内容目录为 `src/content/blog`
- 支持 Markdown 和 MDX，frontmatter 自动生成文章列表、分类、标签和 SEO 信息
- 阅读时间、代码高亮、上一篇/下一篇、RSS、sitemap、Open Graph
- 左侧网易云歌单播放器，当前歌单 ID 为 `399279457`
- 深色模式、移动端适配、毛玻璃卡片与柔和动效
- GitHub Actions 自动部署到 GitHub Pages

## 本地开发

先安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

因为当前仓库部署在 GitHub Pages 的 `/blog` 子路径下，本地访问地址通常是：

```txt
http://127.0.0.1:4321/blog
```

构建静态文件：

```bash
npm run build
```

预览构建结果：

```bash
npm run preview
```

## 写文章

文章目录固定为：

```txt
src/content/blog
```

在这个目录下新建 `.md` 或 `.mdx` 文件即可。示例：

```md
---
title: 文章标题
description: 文章摘要
date: 2026-04-24
updated: 2026-04-25
category: tech
tags:
  - Astro
  - 日常
cover: /images/covers/default.svg
draft: false
---

正文内容。
```

frontmatter 字段由 `src/content/config.ts` 校验：

- `title`：文章标题，必填
- `description`：文章摘要，必填
- `date`：发布日期，必填
- `updated`：更新日期，可选
- `category`：分类，必填
- `tags`：标签数组，默认空数组
- `cover`：封面图路径，可选
- `draft`：是否草稿，默认为 `false`

当前可用分类：

- `tech`：技术
- `article`：文章
- `thoughts`：随想
- `reviews`：影评

如果 `draft: true`，文章不会出现在列表里。

## 常用修改位置

- 站点名称、作者、开始日期：`src/lib/site.ts`
- 分类名称和导航配置：`src/lib/site.ts`
- 首页头像、封面和 Hero 图：`public/images`
- 友链、书单、番组、歌单、项目数据：`src/data`
- 全局侧边栏和网易云播放器：`src/components/Sidebar.astro`
- 全局样式和三栏布局：`src/styles/global.css`

## 网易云歌单

左下角播放器使用网易云外链播放器，配置在 `src/components/Sidebar.astro`：

```ts
const playlistSrc = 'https://music.163.com/outchain/player?type=0&id=399279457&auto=1&height=430';
const currentTrackTitle = '悠の歌单';
```

如果要换歌单，只需要把 `id=399279457` 改成新的歌单 ID。浏览器可能会限制首次自动播放，通常需要用户点击一次页面或播放器按钮后才会开始播放。

## GitHub Pages 部署

项目已经包含 `.github/workflows/deploy.yml`。推送到 `main` 后，GitHub Actions 会自动：

1. 安装依赖
2. 根据仓库名设置 Astro 的 `SITE` 和 `BASE`
3. 构建到 `dist`
4. 部署到 GitHub Pages

首次使用时，在 GitHub 仓库中打开：

```txt
Settings -> Pages -> Build and deployment -> Source -> GitHub Actions
```

当前 `astro.config.mjs` 默认配置适配 `1564110169/blog`：

```js
const site = process.env.SITE ?? 'https://1564110169.github.io';
const base = process.env.BASE ?? '/blog';
```

如果以后换仓库名，需要同步修改默认 `base`，或者依赖 GitHub Actions 自动注入环境变量。

## 目录结构

```txt
.
├── .github/workflows/deploy.yml
├── public/
│   └── images/
├── src/
│   ├── components/
│   ├── content/blog/
│   ├── data/
│   ├── layouts/
│   ├── lib/
│   ├── pages/
│   └── styles/
├── astro.config.mjs
├── package.json
├── tailwind.config.mjs
└── tsconfig.json
```

占位图片均为项目内 SVG，可替换成自己的头像、封面和 Hero 图。
