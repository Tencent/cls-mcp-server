#!/usr/bin/env node
/**
 * 发布后将 README 从备份文件还原，恢复相对路径链接。
 * 配合 prepare-readme.js 使用。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const README_FILES = ['README.md', 'README_ZH.md'].map((f) => path.join(ROOT, f));

let restored = 0;

README_FILES.forEach((filePath) => {
  const backupPath = filePath + '.bak';
  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, filePath);
    fs.unlinkSync(backupPath);
    console.log(`✅ ${path.basename(filePath)} 已还原`);
    restored++;
  } else {
    console.warn(`⚠️  备份不存在，跳过: ${path.basename(filePath)}.bak`);
  }
});

if (restored === 0) {
  console.warn('⚠️  未找到任何备份文件，README 可能未被修改');
}
