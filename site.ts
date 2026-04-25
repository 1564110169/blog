/**
 * 站点统一配置中心
 *
 * 这里是博客最常改的入口。以后想改站点名称、首页文案、导航、头像、歌单、
 * SEO、页脚或页面标题，优先改这个文件；组件和页面只负责展示，不再散落写死内容。
 *
 * 路径书写规则：
 * - 站内页面路径写成 `/about`、`/archive` 这样的根路径，代码会自动加上 Astro 的 base。
 * - public 里的静态资源写成 `/images/xxx.png`，例如头像文件放在
 *   `public/images/avatar.png`，这里就写 `/images/avatar.png`。
 * - 外部链接必须写完整 URL，例如 `https://github.com/xxx`。
 *
 * 常见修改入口：
 * - 修改网站标题、描述、作者、建站日期：改 `site`。
 * - 修改首页 Hero 和首页分区文案：改 `home`。
 * - 修改左侧/手机顶部导航：改 `navigation.sidebar`。
 * - 修改桌面顶部导航：改 `navigation.top`。
 * - 修改头像、昵称、关于页个人介绍：改 `profile`。
 * - 修改文章封面默认图、推荐文章数量、阅读文案：改 `articleDefaults`。
 * - 修改音乐卡片、网易云歌单 ID、歌单页歌曲：改 `music`。
 * - 修改白天/黑夜模式按钮文案和主题默认策略：改 `theme`。
 * - 修改 SEO 默认图、favicon、RSS 信息：改 `seo`。
 * - 修改页脚版权和页脚链接：改 `footer`。
 * - 新增分类时：改 `categories`，文章 frontmatter 的 `category` 也要使用同一个 slug。
 * - 新增标签时：在文章 frontmatter 的 `tags` 里添加；`commonTags` 只是常用参考。
 */
export const siteConfig = {
  // 网站基础信息：会影响网页标题、RSS、页脚、SEO 默认描述和右侧统计。
  site: {
    // 网站完整名称，浏览器标题和 RSS 会使用它。
    title: 'yuulog',
    // 网站短名称，顶部品牌、Logo 小字等位置会使用它。
    shortTitle: '悠',
    // 线上网站域名。RSS fallback 和文档说明会用到，Astro 构建仍以 astro.config.mjs 为准。
    url: 'https://1564110169.github.io',
    // GitHub Pages 子路径。当前仓库部署在 /blog 下。
    base: '/blog',
    // 默认描述。首页 Hero、SEO 默认描述和 RSS 描述都会读取它。
    description: '在电子世界里写点自己的碎碎念',
    // 作者名称。页脚、RSS 或其它作者信息会读取它。
    author: '悠',
    // 站点语言和日期格式 locale。页面 html lang、日期排序/显示会读取它。
    locale: 'zh-CN',
    // 建站日期。右侧统计里的“运行天数”会以这个日期计算。
    startDate: '2026-04-14'
  },

  // 个人资料：头像、昵称、签名、右侧关于卡片和关于页都会读取这里。
  profile: {
    // 显示昵称。
    name: '悠',
    // 头像路径。图片放在 public/images 下时，这里写 /images/文件名。
    avatar: '/images/avatar-placeholder.png',
    // 头像 alt 文案，主要给无障碍和图片加载失败时使用。
    avatarAlt: '悠的头像',
    // 侧边栏头像下方的小签名。
    sign: ' 游戏 / 动漫 / 编程',
    // 关于页头像卡片中的身份/关键词。
    role: 'Frontend / Notes / Anime',
    // 首页 Hero 主标题。
    heroTitle: 'Hi，我是悠',
    // 右侧关于卡片的小标题。
    aboutCardLabel: '关于我',
    // 右侧关于卡片正文。
    aboutCardText: '喜欢把游戏、动漫、代码和夜里的灵感收进博客。这里会放技术笔记，也会放没有结论的碎碎念。',
    // 关于页顶部描述。
    aboutPageDescription: '一个喜欢把日常折成小纸条的人。',
    // 关于页头像卡片正文。
    aboutPageBio: '白天和代码打交道，夜里把灵感、故事和一点点情绪收进博客。'
  },

  // 首页文案：Hero、最新文章区和推荐文章区都会读取这里。
  home: {
    // 首页页面标题。
    title: '首页',
    hero: {
      // Hero 左上角的小标签。
      kicker: 'Yuu no Digital Room',
      // Hero 背景图。图片在 public/images 下。
      backgroundImage: '/images/hero-yume.svg',
      // 主按钮文案和链接。
      primaryLabel: '开始阅读',
      primaryHref: '#latest',
      // 次按钮文案和链接。
      secondaryLabel: '关于我',
      secondaryHref: '/about'
    },
    latest: {
      // section id 用于 Hero 的锚点跳转。
      id: 'latest',
      eyebrow: 'Latest Posts',
      title: '最新文章',
      linkLabel: '查看归档',
      href: '/archive'
    },
    recommended: {
      eyebrow: 'Recommended',
      title: '推荐文章',
      linkLabel: '浏览分类',
      href: '/categories'
    }
  },

  // 导航菜单配置。
  navigation: {
    // 左侧桌面导航、手机顶部导航都会使用这组菜单。
    sidebar: [
      { label: '首页', href: '/' },
      { label: '归档', href: '/archive' },
      { label: '分类', href: '/categories' },
      { label: '标签', href: '/tags' },
      { label: '关于', href: '/about' }
    ],
    // 普通顶部导航组件使用的分组菜单。当前主页布局主要使用 sidebar。
    top: [
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
        label: '关于',
        href: '/about'
      }
    ],
    labels: {
      // nav 元素的 aria-label。
      mainAria: '主导航',
      // 移动端顶部折叠菜单的屏幕阅读器文案。
      mobileMenu: '打开导航'
    }
  },

  // 社交链接配置。当前 UI 没有单独展示社交入口，先集中放在这里，后续要展示时直接读取。
  socialLinks: [
    // 示例：
    // { label: 'GitHub', href: 'https://github.com/1564110169', ariaLabel: '访问 GitHub 主页' }
  ],

  // 文章默认设置：文章卡片、文章详情、首页列表和 content schema 都会读取这里。
  articleDefaults: {
    // 没有设置 cover 时使用的默认封面图。
    defaultCover: '/images/covers/default.svg',
    // frontmatter 没有 tags 时的默认标签。
    defaultTags: [],
    // frontmatter 没有 draft 时的默认草稿状态。
    draft: false,
    // 首页最新文章展示数量。
    latestLimit: 6,
    // 首页推荐文章展示数量。
    recommendedLimit: 3,
    // 首页推荐文章优先从这些分类里取。
    recommendedCategories: ['tech', 'reviews'],
    // 阅读时间估算参数。中文按字符数，英文按单词数估算。
    readingTime: {
      chineseCharsPerMinute: 420,
      latinWordsPerMinute: 220
    },
    labels: {
      readAriaPrefix: '阅读',
      readMore: 'Read',
      minute: '分钟',
      minuteReading: '分钟阅读',
      viewsPrefix: '阅读',
      postSideLabel: 'Article',
      postSideUnit: 'min',
      postSideNote: '慢慢读，咖啡还热着。',
      previousPost: '上一篇',
      nextPost: '下一篇'
    }
  },

  // 音乐卡片配置：左下角/手机端浮动播放器和 /playlist 页面都会读取这里。
  music: {
    // 浮动播放器显示的歌单名称。
    title: '悠の歌单',
    // 网易云歌单 ID。打开网易云歌单页面，URL 里的 id=xxxx 就是这个值。
    neteasePlaylistId: '399279457',
    // 是否自动播放。true 会在播放器链接里带 auto=1，false 会带 auto=0。
    autoplay: true,
    // 网易云外链播放器高度参数。侧栏 iframe 会在此基础上多留一点空间。
    playerHeight: 430,
    // iframe 标题，主要给无障碍和浏览器识别使用。
    iframeTitle: '网易云音乐歌单播放器',
    // 打开/收起歌单面板按钮的无障碍文案。
    toggleLabel: '打开或收起网易云歌单播放器',
    // JS 找不到当前歌单名时使用的兜底文案。
    fallbackTrackTitle: '当前歌曲',
    labels: {
      playing: 'Now Playing',
      paused: 'Paused',
      playPrefix: '播放',
      pausePrefix: '暂停'
    },
    // /playlist 页面展示的歌曲列表，只影响站内展示，不会自动同步网易云歌单。
    songs: [
      {
        title: '夜に駆ける',
        artist: 'YOASOBI',
        mood: '夜间写代码'
      },
      {
        title: '花の塔',
        artist: 'さユり',
        mood: '通勤路上'
      },
      {
        title: 'Katawaredoki',
        artist: 'RADWIMPS',
        mood: '雨后黄昏'
      }
    ]
  },

  // 主题外观配置：白天/黑夜模式按钮和首次进入页面的主题策略会读取这里。
  theme: {
    // 可选：'system' 跟随系统，'light' 默认白天，'dark' 默认黑夜。
    defaultMode: 'system',
    // localStorage 使用的 key。改名会让旧用户的主题偏好失效。
    storageKey: 'theme',
    // 普通 CSS 过渡的兜底时长，单位毫秒。
    transitionFallbackMs: 420,
    icons: {
      // 未进入黑夜模式时显示的图标。
      light: '☾',
      // 黑夜模式下显示的图标。
      dark: '☀'
    },
    labels: {
      // 首次服务端渲染时按钮的默认文案。
      initial: '切换深色模式',
      // 当前是白天模式时，按钮提示切换到黑夜。
      switchToDark: '切换到黑暗模式',
      // 当前是黑夜模式时，按钮提示切换到白天。
      switchToLight: '切换到白天模式'
    }
  },

  // SEO 配置：BaseHead、RSS 和 Open Graph 默认信息会读取这里。
  seo: {
    // 页面没有传入 image 时使用的默认分享图。
    defaultImage: '/images/og-card.svg',
    // 页面没有传入 type 时使用的 Open Graph 类型。
    defaultType: 'website',
    // Twitter/X 卡片类型。
    twitterCard: 'summary_large_image',
    // favicon 路径。
    favicon: '/favicon.svg',
    // RSS 文件路径。
    rssPath: '/rss.xml',
    // RSS link 标签标题。
    rssTitle: 'yuulog RSS'
  },

  // 页脚信息：版权文案和页脚链接都会读取这里。
  footer: {
    // 版权符号。
    copyrightMark: '©',
    // 版权后面的说明文字。作者名会从 site.author 读取。
    poweredBy: 'Powered by Astro, Markdown and a little daydream.',
    links: [
      { label: 'RSS', href: '/rss.xml' },
      { label: 'Sitemap', href: '/sitemap-index.xml' },
      { label: 'About', href: '/about' }
    ]
  },

  // 右侧信息面板文案。
  rightPanel: {
    tagLimit: 18,
    categoriesTitle: '分类统计',
    categoriesLinkLabel: '全部',
    tagsTitle: '标签云',
    tagsLinkLabel: '更多',
    statsLabels: {
      posts: '文章',
      tags: '标签',
      days: '天'
    }
  },

  // 独立页面文案：列表页、关于页、归档页等页面标题和说明都在这里改。
  pages: {
    about: {
      title: '关于我',
      description: '关于站长悠和这个博客。',
      eyebrow: 'About',
      content: {
        heading: '你好，这里是悠的电子手账',
        intro: '这个博客用于记录技术笔记、阅读感想、追番清单和日常碎碎念。它是纯静态的 Astro 项目，部署到 GitHub Pages 后不需要后端服务。',
        writingTitle: '我会写些什么',
        writingItems: [
          '前端工程、Astro、TypeScript 和工具链笔记。',
          '书、电影、动画和音乐带来的灵感。',
          '一些不一定有答案，但很想留下来的生活片段。'
        ],
        keywordsTitle: '最近的关键词',
        keywordsText: '静态站点、深夜电台、纸质书、季节限定饮料，以及那些看完之后还会想很久的动画。'
      }
    },
    archive: {
      title: '文章归档',
      description: '所有文章按时间排列，也可以按分类继续浏览。',
      eyebrow: 'Archive',
      headerTitle: '文章归档',
      headerDescription: '把写过的东西按时间收好，像给电子抽屉贴上标签。',
      categoryEyebrow: 'Category',
      categoryTitleSuffix: '归档',
      emptyCategoryText: '这个分类还在等第一篇文章。'
    },
    categories: {
      title: '分类',
      description: '按主题浏览所有文章。',
      eyebrow: 'Categories',
      headerTitle: '分类',
      headerDescription: '给文章找一个温柔的小格子。',
      detailEyebrow: 'Category',
      detailTitleSuffix: '分类'
    },
    tags: {
      title: '标签',
      description: '按标签浏览文章。',
      eyebrow: 'Tags',
      headerTitle: '标签云',
      headerDescription: '那些反复出现的关键词，会慢慢变成站点的纹理。',
      detailEyebrow: 'Tag',
      detailDescriptionPrefix: '标签 ',
      detailDescriptionSuffix: ' 下的文章。',
      detailCountPrefix: '共 ',
      detailCountSuffix: ' 篇文章与这个标签有关。'
    },
    books: {
      title: '书单',
      description: '正在读、读完了和想读的书。',
      eyebrow: 'Books',
      headerTitle: '书单',
      headerDescription: '把书页里遇见的句子，先临时停在这里。'
    },
    anime: {
      title: '番组',
      description: '追番记录和简短感想。',
      eyebrow: 'Anime',
      headerTitle: '番组',
      headerDescription: '看过的故事会留下弹幕一样的回声。'
    },
    playlist: {
      title: '歌单',
      description: '适合写博客时循环播放的歌。',
      eyebrow: 'Playlist',
      headerTitle: '歌单',
      headerDescription: '给不同时间段准备一点背景音乐。'
    },
    projects: {
      title: '项目',
      description: '一些项目、实验和正在打磨的小东西。',
      eyebrow: 'Projects',
      headerTitle: '项目',
      headerDescription: '这里放作品，也放还没完全长大的实验。'
    }
  },

  // 文章分类配置。slug 会参与 URL 和文章 frontmatter 校验，name 是页面显示名称。
  categories: [
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
  ],

  // 常用标签参考。真正生成标签页的是每篇文章 frontmatter 里的 tags。
  commonTags: ['Astro', 'TypeScript', 'Tailwind CSS', 'UI', '动漫', '游戏', '影评', '随想', '日常'],

  // 友链配置预留。当前友链页面和导航已经删除，所以这里只保留数据入口。
  friends: {
    // 以后要恢复友链功能时，可以先改成 true，再接回 /friends 页面和导航入口。
    enabled: false,
    // 友链数据示例：
    // { name: '朋友名字', description: '一句简介', href: 'https://example.com', avatar: '/images/avatar-placeholder.png' }
    items: []
  }
} as const;
