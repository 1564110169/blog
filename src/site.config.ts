/**
 * 站点统一配置文件
 *
 * 常用修改入口：
 * - 修改头像：改 profile.avatar，并把图片放到 public/images 目录下。
 * - 修改歌单：改 music.neteasePlaylistId；歌单页展示歌曲改 music.songs。
 * - 修改昵称/简介：改 profile 和 site。
 * - 修改导航：改 navigation.sidebar 或 navigation.top。
 * - 增加分类：改 categories，同时文章 frontmatter 里的 category 也要匹配对应 slug。
 * - 增加标签：在具体文章 frontmatter 的 tags 里添加；commonTags 只是常用标签参考。
 * - 恢复友链：把 friends.enabled 改成 true，并在 friends.items 里添加友链数据，之后再接回友链页面入口。
 */
export const siteConfig = {
  // 站点基础信息：会影响网页标题、RSS、页脚、SEO 描述等。
  site: {
    // 网站完整名称。
    title: 'yuulog',
    // 网站短名称，顶部品牌会用到。
    shortTitle: '悠',
    // 网站默认描述，首页 Hero 和 SEO 默认描述会用到。
    description: '在电子世界里写点自己的碎碎念',
    // 作者名称，页脚和部分元信息会用到。
    author: '悠',
    // 站点语言。
    locale: 'zh-CN',
    // 建站日期，用于右侧统计里的运行天数。
    startDate: '2026-04-14'
  },

  // 个人资料：头像、昵称、签名、关于页等位置统一从这里读取。
  profile: {
    // 显示昵称。
    name: '悠',
    // 头像路径。图片应放在 public 目录下，例如 public/images/avatar.png 写成 /images/avatar.png。
    avatar: '/images/avatar-placeholder.png',
    // 头像的无障碍说明文字。
    avatarAlt: '悠的头像',
    // 侧边栏头像下方的小签名。
    sign: ' 游戏 / 动漫 / 编程',
    // 关于页头像卡片里的身份/关键词。
    role: 'Frontend / Notes / Anime',
    // 首页大卡片标题。
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

  // 音乐相关配置：左下角浮动播放器和 /playlist 歌单页都会用到。
  music: {
    // 浮动播放器显示的歌单名称。
    title: '悠の歌单',
    // 网易云歌单 ID。打开网易云歌单页面，URL 里的 id=xxxx 就是这个值。
    neteasePlaylistId: '399279457',
    // 是否自动播放。true 会在播放器链接里带 auto=1，false 会带 auto=0。
    autoplay: true,
    // 网易云外链播放器高度参数。
    playerHeight: 430,
    // /playlist 页面展示的歌曲列表，只影响站内展示，不会自动同步网易云歌单。
    songs: [
      {
        // 歌曲名。
        title: '夜に駆ける',
        // 歌手/作者。
        artist: 'YOASOBI',
        // 场景标签。
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

  // 导航配置。
  navigation: {
    // 左侧/手机顶部的主导航。删除或新增这里的项目，会直接影响侧边栏导航。
    sidebar: [
      { label: '首页', href: '/' },
      { label: '归档', href: '/archive' },
      { label: '分类', href: '/categories' },
      { label: '标签', href: '/tags' },
      { label: '关于', href: '/about' }
    ],
    // 顶部导航组件使用的分组导航。目前仪表盘布局主要使用 sidebar。
    top: [
      {
        // label 是显示文字，href 是点击跳转路径。
        label: '首页',
        href: '/'
      },
      {
        label: '归档',
        href: '/archive',
        // children 是下拉菜单项目。
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
    ]
  },

  // 文章分类配置。
  // 注意：如果新增 slug，需要同时更新 src/content/config.ts 里的 category 枚举。
  categories: [
    {
      // slug 是分类路径和文章 frontmatter 里 category 使用的值。
      slug: 'tech',
      // name 是页面上显示的中文名称。
      name: '技术',
      // description 是分类页说明文字。
      description: 'Astro、前端、工具链和工程笔记。',
      // accent 是分类卡片的 Tailwind 渐变色类名。
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

  // 常用标签参考。
  // 真正生成标签页的是每篇文章 frontmatter 里的 tags，这里只是方便你统一查看/复制常用标签。
  commonTags: ['Astro', 'TypeScript', 'Tailwind CSS', 'UI', '动漫', '游戏', '影评', '随想', '日常'],

  // 友链配置预留。
  // 当前友链页面和导航已经删除，所以 enabled 目前不会自动生成页面。
  // 以后要恢复友链时，可以先把数据写在这里，再接回 /friends 页面和导航入口。
  friends: {
    // 是否启用友链功能的开关，当前只是预留配置。
    enabled: false,
    // 友链列表。
    items: [
      // 以后恢复友链页面时，可以按这个格式添加：
      // { name: '朋友名字', description: '一句简介', href: 'https://example.com', avatar: '/images/avatar-placeholder.png' }
    ]
  }
} as const;
