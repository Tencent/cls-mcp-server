#!/usr/bin/env node
/**
 * 发布前将 README 中的相对路径链接替换为绝对 URL。
 * 支持 GitHub / GitLab / Gitee 等主流 Git 平台。
 * 原始文件会备份为 *.bak，由 restore-readme.js 还原。
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ---------- 获取仓库基准 URL ----------

function getRepoBaseUrl() {
  let remote;
  try {
    remote = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
  } catch {
    console.error('❌ 无法获取 git remote URL，请确认已配置 origin remote');
    process.exit(1);
  }

  // 统一转为 HTTPS 格式并去掉 .git 后缀
  // SSH:   git@github.com:org/repo.git  → https://github.com/org/repo
  // HTTPS: https://github.com/org/repo.git → https://github.com/org/repo
  const baseUrl = remote
    .trim()
    .replace(/\.git$/, '')
    .replace(/^git@([^:]+):(.+)$/, 'https://$1/$2');

  // 获取当前 tag（发布时通常会打 tag），兜底用分支名
  let ref;
  try {
    ref = execSync('git describe --tags --exact-match', { encoding: 'utf8' }).trim();
  } catch {
    ref = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  }

  // 各平台 blob 路径格式
  if (/gitlab\./.test(baseUrl)) {
    return `${baseUrl}/-/blob/${ref}`;
  }
  // GitHub / Gitee / 其他（通用 /blob/ 格式）
  return `${baseUrl}/blob/${ref}`;
}

// ---------- 替换单个文件 ----------

function processFile(filePath, baseUrl) {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  文件不存在，跳过: ${filePath}`);
    return;
  }

  const backupPath = filePath + '.bak';
  fs.copyFileSync(filePath, backupPath);

  let content = fs.readFileSync(filePath, 'utf8');

  // 判断是否为相对路径：
  //   ✅ ./path  ../path  filename.md  dir/file.md
  //   ❌ https://  http://  #anchor  空字符串
  function isRelative(p) {
    return (
      p.length > 0 &&
      !p.startsWith('http://') &&
      !p.startsWith('https://') &&
      !p.startsWith('#') &&
      !p.startsWith('mailto:')
    );
  }

  const toAbsolute = (rel) => {
    // 去掉开头的 ./，路径直接拼接到 baseUrl 后
    const normalized = rel.replace(/^\.\//, '');
    return `${baseUrl}/${normalized}`;
  };

  // Markdown 链接 & 图片: [text](path) 或 ![alt](path)
  // 捕获括号内直到 ) 的全部内容（不含空格，避免匹配带 title 的链接写法）
  content = content.replace(/\]\(([^)\s]+)\)/g, (match, p) => {
    return isRelative(p) ? `](${toAbsolute(p)})` : match;
  });

  // HTML href: <a href="path">
  content = content.replace(/href="([^"]+)"/g, (match, p) => {
    return isRelative(p) ? `href="${toAbsolute(p)}"` : match;
  });

  // HTML src: <img src="path">
  content = content.replace(/src="([^"]+)"/g, (match, p) => {
    return isRelative(p) ? `src="${toAbsolute(p)}"` : match;
  });

  fs.writeFileSync(filePath, content);
  console.log(`✅ ${path.basename(filePath)} 链接已转换 → ${baseUrl}`);
}

// ---------- 主流程 ----------

const ROOT = path.resolve(__dirname, '..');
const README_FILES = ['README.md', 'README_ZH.md'].map((f) => path.join(ROOT, f));

const baseUrl = getRepoBaseUrl();
console.log(`🔗 仓库基准 URL: ${baseUrl}`);

README_FILES.forEach((f) => processFile(f, baseUrl));
