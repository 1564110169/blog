# 悠的电子手账

一个带本地写作后台的 Astro 个人博客。前台是纯静态博客，适合部署到 GitHub Pages；后台只在本机运行，用来新建、编辑、搜索、发布、删除、恢复和统计文章。

当前仓库：`1564110169/blog`  
线上地址：`https://1564110169.github.io/blog`

## 项目特点

- Astro 5 + TypeScript + Tailwind CSS + Markdown/MDX
- 纯静态前台，可部署到 GitHub Pages
- Astro Content Collections 管理文章内容
- 文章目录沿用现有结构：`src/content/blog`
- 首页 Hero、最新文章、推荐文章、归档、分类、标签、文章详情、RSS、sitemap、SEO
- 三栏式桌面布局：左侧导航，中间内容，右侧信息面板
- 书单、番组、歌单、项目、关于我等独立页面
- 深色模式、移动端适配、毛玻璃卡片、柔和动效
- 网易云歌单播放器，当前歌单 ID：`399279457`
- 本地命令行文章管理系统：`npm run blog`
- 本地网页后台 CMS：`http://localhost:4323/admin`
- Windows 双击启动后台：`tools/start-admin.cmd`

## 快速开始

安装依赖：

```bash
npm install
```

启动前台开发环境：

```bash
npm run dev
```

本地访问地址通常是：

```txt
http://127.0.0.1:4321/blog
```

构建静态文件：

```bash
npm run build
```

检查 Astro 类型和内容：

```bash
npm run check
```

预览构建结果：

```bash
npm run preview
```

## 本地网页后台 CMS

最推荐的日常写作方式是双击启动后台：

- 双击 `tools/start-admin.cmd`：显示启动日志，适合排查端口占用

后台地址：

```txt
http://localhost:4323/admin
```

也可以手动启动：

```bash
npm run admin
```

后台功能：

- 仪表盘：总文章数、已发布数、草稿数、分类数、标签数、最近 10 篇文章
- 文章列表：查看、搜索、编辑、删除、发布、设为草稿、重命名、更新 `updated`
- 新建文章：通过表单生成 Markdown 文件
- 草稿箱：只显示 `draft: true` 的文章
- 回收站：恢复文章或永久删除
- 写作灵感：随机抽取选题，一键创建草稿
- 设置：显示文章目录、回收站目录、后台地址和本地运行说明

后台服务只监听本机：

```txt
127.0.0.1:4323
```

它不会监听 `0.0.0.0`，不会暴露到局域网，也不会被 Astro 构建进 `dist`。

## 命令行文章管理

如果想在终端里管理文章，可以使用统一菜单：

```bash
npm run blog
```

菜单包含：

```txt
1. 新建文章
2. 查看全部文章
3. 搜索文章
4. 查看草稿
5. 发布草稿
6. 设为草稿
7. 删除文章
8. 恢复文章
9. 重命名文章
10. 更新 updated 日期
11. 查看博客统计
0. 退出
```

也保留了快捷命令：

```bash
npm run new "文章标题"
npm run posts
npm run search "关键词"
npm run drafts
npm run publish
npm run draft
npm run delete
npm run restore
npm run rename
npm run touch
npm run stats
npm run idea
```

在某些 Windows PowerShell 环境里，如果直接 `npm run ...` 被执行策略拦截，可以改用 `npm.cmd run ...`。

## 文章目录和模板

当前文章目录：

```txt
src/content/blog
```

脚本会优先识别 `src/content/posts`，但因为本项目已经有 `src/content/blog`，所以会沿用现有目录，不会迁移或删除已有文章。

文章模板：

```txt
scripts/templates/post.md
```

模板支持变量：

```txt
{{title}}
{{date}}
{{updated}}
{{category}}
{{tags}}
{{description}}
{{cover}}
{{draft}}
```

新建文章默认 frontmatter：

```md
---
title: "文章标题"
date: "YYYY-MM-DD"
updated: "YYYY-MM-DD"
category: "随笔"
tags: []
description: ""
cover: ""
draft: false
---

# 文章标题

> 这里写一句文章摘要。

## 开头

## 正文

## 结尾
```

文件名规则：

- `YYYY-MM-DD-文章标题.md`
- 保留中文
- 空格转 `-`
- 去掉特殊符号
- 重名自动加 `-1`、`-2`、`-3`

## Frontmatter 字段

字段由 `src/content/config.ts` 校验，兼容字符串日期和 Date：

- `title`：文章标题
- `date`：发布日期
- `updated`：更新日期，可选
- `category`：分类，默认 `随笔`
- `tags`：标签数组，默认空数组
- `description`：文章摘要，默认空字符串
- `cover`：封面图路径，可选，空字符串会被视为未设置
- `draft`：是否草稿，默认 `false`

如果 `draft: true`，文章不会出现在前台列表和详情页里。

当前分类配置在根目录 `site.ts`：

- `tech`：技术
- `article`：文章
- `thoughts`：随想
- `reviews`：影评
- `随笔`：随笔

## 删除和恢复

后台和命令行都不会直接永久删除文章。

删除文章时会先移动到：

```txt
.trash/posts/
```

同时保存原路径信息，恢复时会尽量回到原文章目录。如果原目录已经存在同名文件，会自动加 `-restored` 或数字后缀。

永久删除只在网页后台的「回收站」里提供，并且会二次确认，提示“此操作不可恢复”。

## 写作灵感

选题文件：

```txt
scripts/ideas.json
```

当前内置 20 个个人博客选题。后台「写作灵感」可以随机抽取一个选题，并一键创建为草稿文章。

命令行也可以使用：

```bash
npm run idea
```

## 统一配置中心

大多数站点信息集中在根目录：

```txt
site.ts
```

常改内容包括：

- 网站标题、作者、描述、语言、建站日期、线上地址
- 首页 Hero、最新文章区、推荐文章区
- 左侧导航、移动端导航、顶部导航
- 默认封面、默认标签、推荐分类、阅读时间文案
- 网易云歌单 ID、播放器文案、歌单页歌曲
- 深色模式默认策略、按钮图标和提示文案
- SEO 默认图、favicon、RSS 标题和路径
- 页脚版权和链接
- 归档、分类、标签、书单、番组、歌单、项目、关于页文案
- 分类列表 `categories` 和常用标签 `commonTags`

其它内容位置：

- 文章正文：`src/content/blog`
- 书单、番组、项目数据：`src/data`
- 图片资源：`public/images`
- 全局样式：`src/styles`
- 页面路由：`src/pages`
- 组件：`src/components`
- 布局：`src/layouts`

## GitHub Pages 部署

项目包含 GitHub Actions：

```txt
.github/workflows/deploy.yml
```

推送到 `main` 后会自动：

1. 安装依赖
2. 设置 Astro 的 `SITE` 和 `BASE`
3. 构建到 `dist`
4. 部署到 GitHub Pages

首次使用时，在 GitHub 仓库中打开：

```txt
Settings -> Pages -> Build and deployment -> Source -> GitHub Actions
```

当前 `astro.config.mjs` 默认适配 `1564110169/blog`：

```js
const site = process.env.SITE ?? 'https://1564110169.github.io';
const base = process.env.BASE ?? '/blog';
```

如果以后更换仓库名，需要同步修改默认 `base`，或依赖 GitHub Actions 注入环境变量。

## 为什么后台不能部署到 GitHub Pages

GitHub Pages 只能托管静态文件，不能运行本地 Node 服务。

本项目的后台 CMS 需要：

- 监听 `localhost:4323`
- 读取和写入本机 Markdown 文件
- 移动文章到 `.trash/posts/`
- 恢复或永久删除本地文件
- 调用本地接口完成文章管理

这些能力只能在本机 Node 环境里运行，不应该也不能部署到 GitHub Pages。线上网站只部署 Astro 构建出的静态前台。

## 目录结构

```txt
.
├── .github/workflows/deploy.yml
├── public/
│   └── images/
├── scripts/
│   ├── admin-server.js
│   ├── blog-manager.js
│   ├── ideas.json
│   ├── lib/
│   │   ├── frontmatter.js
│   │   └── posts.js
│   └── templates/
│       └── post.md
├── src/
│   ├── components/
│   ├── content/
│   │   ├── blog/
│   │   └── config.ts
│   ├── data/
│   ├── layouts/
│   ├── lib/
│   ├── pages/
│   └── styles/
├── tools/
│   ├── start-all.cmd
│   ├── start-admin.cmd
│   └── start-frontend.cmd
├── astro.config.mjs
├── package.json
├── site.ts
├── tailwind.config.mjs
└── tsconfig.json
```

## 推荐日常流程

1. 双击 `tools/start-admin.cmd`
2. 浏览器打开 `http://localhost:4323/admin`
3. 在「新建文章」创建草稿或正式文章
4. 在「文章列表」编辑正文并保存
5. 使用 `npm run dev` 预览前台效果
6. 写完后在后台发布草稿
7. 发布前运行 `npm run build`
8. 推送到 GitHub，交给 GitHub Actions 部署
