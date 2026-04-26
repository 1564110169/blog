#!/usr/bin/env node

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import {
  DEFAULT_CATEGORY,
  createPost,
  deletePostToTrash,
  getStats,
  parseBoolean,
  readIdeas,
  readPosts,
  readTrashPosts,
  renamePost,
  restorePostFromTrash,
  searchPosts,
  splitTags,
  today,
  updatePostFrontmatter
} from './lib/posts.js';

const command = process.argv[2];
const args = process.argv.slice(3);
const rl = createInterface({ input, output });

async function main() {
  if (!command) {
    await runMenu();
    return;
  }

  await runCommand(command, args);
}

async function runMenu() {
  while (true) {
    console.log(`
本地博客写作 + 文章管理系统

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
`);

    const choice = (await ask('请选择操作编号：')).trim();
    if (choice === '0') {
      console.log('已退出。');
      return;
    }

    const mappedCommand = {
      1: 'new',
      2: 'posts',
      3: 'search',
      4: 'drafts',
      5: 'publish',
      6: 'draft',
      7: 'delete',
      8: 'restore',
      9: 'rename',
      10: 'touch',
      11: 'stats'
    }[choice];

    if (!mappedCommand) {
      console.log('请输入菜单里的编号。');
      continue;
    }

    await runCommand(mappedCommand, [], { fromMenu: true });
    await ask('\n按回车返回菜单...');
  }
}

async function runCommand(name, commandArgs, options = {}) {
  switch (name) {
    case 'new':
      await createNewArticle(commandArgs);
      break;
    case 'posts':
      await showPosts();
      break;
    case 'search':
      await searchArticles(commandArgs);
      break;
    case 'drafts':
      await showDrafts();
      break;
    case 'publish':
      await publishDraft();
      break;
    case 'draft':
      await setArticleAsDraft();
      break;
    case 'delete':
      await deleteArticle();
      break;
    case 'restore':
      await restoreArticle();
      break;
    case 'rename':
      await renameArticle();
      break;
    case 'touch':
      await touchArticle();
      break;
    case 'stats':
      await showStats();
      break;
    case 'idea':
      await createIdeaDraft();
      break;
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;
    default:
      if (!options.fromMenu) printHelp();
  }
}

async function createNewArticle(commandArgs) {
  const quickTitle = commandArgs.join(' ').trim();

  if (quickTitle) {
    await createArticle({
      title: quickTitle,
      category: DEFAULT_CATEGORY,
      tags: [],
      draft: false,
      cover: '',
      description: ''
    });
    return;
  }

  const title = await askRequired('文章标题 title');
  const category = await askWithDefault('分类 category', DEFAULT_CATEGORY);
  const tags = splitTags(await askWithDefault('标签 tags，用逗号分隔', ''));
  const draft = parseBoolean(await askWithDefault('是否草稿 draft', 'false'), false);
  const cover = await askWithDefault('封面 cover', '');
  const description = await askWithDefault('摘要 description', '');

  await createArticle({ title, category, tags, draft, cover, description });
}

async function createIdeaDraft() {
  const ideas = await readIdeas();
  const title = ideas[Math.floor(Math.random() * ideas.length)] || '今天想写的一件小事';

  await createArticle({
    title,
    category: DEFAULT_CATEGORY,
    tags: [],
    draft: true,
    cover: '',
    description: ''
  });
}

async function createArticle(article) {
  const result = await createPost(article);

  console.log(`创建成功：${result.relativePath}`);
  console.log(result.openedInVSCode ? '编辑方式：已尝试用 VSCode 打开。' : `编辑方式：手动打开 ${result.relativePath}`);
  console.log('预览命令：npm run dev');
}

async function showPosts() {
  const posts = await readPosts();
  printPostList(posts, '全部文章');
}

async function searchArticles(commandArgs) {
  const keyword = commandArgs.join(' ').trim() || (await askRequired('请输入搜索关键词'));
  const posts = searchPosts(await readPosts(), keyword);

  printPostList(posts, `搜索结果：${keyword}`);
}

async function showDrafts() {
  const posts = (await readPosts()).filter((post) => post.draft);
  printPostList(posts, '草稿文章');
}

async function publishDraft() {
  const drafts = (await readPosts()).filter((post) => post.draft);
  const selected = await choosePost(drafts, '选择要发布的草稿编号');
  if (!selected) return;

  await updatePostFrontmatter(selected, {
    draft: false,
    updated: today()
  });

  console.log(`已发布：${selected.title}`);
  console.log(`文章路径：${selected.relativePath}`);
}

async function setArticleAsDraft() {
  const selected = await choosePost(await readPosts(), '选择要设为草稿的文章编号');
  if (!selected) return;

  await updatePostFrontmatter(selected, {
    draft: true,
    updated: today()
  });

  console.log(`已设为草稿：${selected.title}`);
  console.log(`文章路径：${selected.relativePath}`);
}

async function deleteArticle() {
  const selected = await choosePost(await readPosts(), '选择要删除的文章编号');
  if (!selected) return;

  console.log(`\n即将删除文章：${selected.title}`);
  console.log(`文章路径：${selected.relativePath}`);
  console.log('删除前会先备份到 .trash/posts/，不会永久删除。');

  const confirmed = await confirmYes('确认删除吗？只有输入 y 或 yes 才会执行');
  if (!confirmed) {
    console.log('已取消删除。');
    return;
  }

  const result = await deletePostToTrash(selected);

  console.log(`已删除并备份：${result.relativeBackupPath}`);
}

async function restoreArticle() {
  const selected = await chooseTrashPost(await readTrashPosts(), '选择要恢复的文章编号');
  if (!selected) return;

  const result = await restorePostFromTrash(selected);

  console.log(`已恢复：${selected.title}`);
  console.log(`恢复路径：${result.relativePath}`);
}

async function renameArticle() {
  const selected = await choosePost(await readPosts(), '选择要重命名的文章编号');
  if (!selected) return;

  const newTitle = await askRequired('请输入新标题');
  const result = await renamePost(selected, newTitle);

  console.log(`已重命名：${newTitle}`);
  console.log(`新路径：${result.relativePath}`);
}

async function touchArticle() {
  const selected = await choosePost(await readPosts(), '选择要更新 updated 日期的文章编号');
  if (!selected) return;

  await updatePostFrontmatter(selected, {
    updated: today()
  });

  console.log(`已更新 updated：${selected.title}`);
  console.log(`文章路径：${selected.relativePath}`);
}

async function showStats() {
  const posts = await readPosts();
  const stats = getStats(posts);

  console.log('博客统计');
  console.log(`总文章数：${stats.total}`);
  console.log(`已发布文章数：${stats.published}`);
  console.log(`草稿数：${stats.drafts}`);
  console.log(`分类数量：${stats.categoryCount}`);
  console.log(`标签数量：${stats.tagCount}`);
  console.log('\n最近 10 篇文章：');

  if (stats.recent.length === 0) {
    console.log('暂无文章。');
    return;
  }

  stats.recent.forEach((post, index) => {
    console.log(`${index + 1}. ${post.title} | ${post.date || '-'} | ${post.draft ? 'draft: true' : 'draft: false'}`);
    console.log(`   ${post.relativePath}`);
  });
}

async function choosePost(posts, prompt) {
  if (posts.length === 0) {
    console.log('没有找到可选择的文章。');
    return null;
  }

  printPostList(posts, '可选择文章');

  while (true) {
    const answer = (await ask(`${prompt}（0 取消）：`)).trim();
    if (answer === '0') return null;

    const index = Number(answer);
    if (Number.isInteger(index) && index >= 1 && index <= posts.length) {
      return posts[index - 1];
    }

    console.log(`请输入 1-${posts.length} 之间的数字，或输入 0 取消。`);
  }
}

async function chooseTrashPost(posts, prompt) {
  if (posts.length === 0) {
    console.log('回收站里没有可恢复的文章。');
    return null;
  }

  console.log('已删除文章');
  posts.forEach((post, index) => {
    console.log(`${index + 1}. ${post.title}`);
    console.log(`   删除时间：${post.deletedAt || '-'}`);
    console.log(`   原路径：${post.originalRelativePath || '-'}`);
    console.log(`   备份路径：${post.relativePath}`);
  });

  while (true) {
    const answer = (await ask(`${prompt}（0 取消）：`)).trim();
    if (answer === '0') return null;

    const index = Number(answer);
    if (Number.isInteger(index) && index >= 1 && index <= posts.length) {
      return posts[index - 1];
    }

    console.log(`请输入 1-${posts.length} 之间的数字，或输入 0 取消。`);
  }
}

function printPostList(posts, title) {
  console.log(title);

  if (posts.length === 0) {
    console.log('没有找到文章。');
    return;
  }

  posts.forEach((post, index) => {
    console.log(`${index + 1}. ${post.title}`);
    console.log(`   日期：${post.date || '-'}`);
    console.log(`   updated：${post.updated || '-'}`);
    console.log(`   分类：${post.category || '-'}`);
    console.log(`   标签：${post.tags.length ? post.tags.join(', ') : '[]'}`);
    console.log(`   draft：${post.draft}`);
    console.log(`   路径：${post.relativePath}`);
  });
}

async function ask(question) {
  return rl.question(question);
}

async function askRequired(question) {
  while (true) {
    const answer = (await ask(`${question}：`)).trim();
    if (answer) return answer;
    console.log('这里不能为空。');
  }
}

async function askWithDefault(question, defaultValue) {
  const hint = defaultValue ? `（默认：${defaultValue}）` : '（默认留空）';
  const answer = (await ask(`${question}${hint}：`)).trim();
  return answer || defaultValue;
}

async function confirmYes(question) {
  const answer = (await ask(`${question}：`)).trim().toLowerCase();
  return answer === 'y' || answer === 'yes';
}

function printHelp() {
  console.log(`博客管理命令

统一入口：
  npm run blog

快捷命令：
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
  npm run stats`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    rl.close();
  });
