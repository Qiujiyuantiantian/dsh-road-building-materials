// Load-test the materials plugin the way DSH would: register it, then resolve every path SKILL.md mentions.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PKG = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(PKG, 'skills', 'road-building-materials');

const registered = [];
const ctx = { skills: { register: (s) => registered.push(s) } };

const mod = await import(pathToFileURL(join(PKG, 'lib', 'startup.js')).href);
mod.default(ctx);

let fail = 0;
const say = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail++; };

say(registered.length === 1, `注册了 ${registered.length} 个 skill（应为 1）`);
if (registered.length === 1) {
  const s = registered[0];
  say(s.name === 'road-building-materials', `name = ${s.name}`);
  say(typeof s.description === 'string' && s.description.length > 200,
      `description 长度 ${s.description?.length}`);
  say(!s.description.startsWith('|') && !s.description.startsWith('>'),
      'description 不是未解析的块标量标记');
  say(typeof s.content === 'string' && s.content.includes('照抄就会判错'),
      `content 含三处硬事实（${s.content?.length} 字符）`);
  say(s.resourceBase?.kind === 'directory' && existsSync(s.resourceBase.path),
      'resourceBase 指向真实目录');

  // SKILL.md 与 BOOK-MAP.md 里出现的每个 cards/... 路径都必须落地
  const docs = ['SKILL.md', 'BOOK-MAP.md', 'README.md']
    .map((f) => join(SKILL_DIR, f))
    .filter(existsSync)
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  const paths = [...docs.matchAll(/`?(cards\/[A-Za-z0-9._\/-]+)`?/g)].map((m) => m[1]);
  const uniq = [...new Set(paths.map((p) => p.replace(/\/$/, '')))];
  const missing = uniq.filter(
    (p) => !existsSync(join(SKILL_DIR, p)) && !existsSync(join(SKILL_DIR, p + '.md')));
  say(missing.length === 0, `文档引用 ${uniq.length} 个路径，缺失 ${missing.length}`);
  for (const m of missing.slice(0, 5)) console.log(`       缺: ${m}`);

  // 索引与磁盘必须一一对应
  const idx = JSON.parse(readFileSync(join(SKILL_DIR, '_index.json'), 'utf8'));
  const onDisk = [];
  for (const ch of readdirSync(join(SKILL_DIR, 'cards'))) {
    for (const f of readdirSync(join(SKILL_DIR, 'cards', ch))) {
      if (f.endsWith('.md')) onDisk.push(`cards/${ch}/${f}`);
    }
  }
  say(idx.length === onDisk.length, `索引 ${idx.length} 条 vs 磁盘 ${onDisk.length} 个文件`);
  const ghost = idx.filter((c) => !existsSync(join(SKILL_DIR, c.path)));
  say(ghost.length === 0, `索引里指向不存在文件的条目 ${ghost.length}`);
}

console.log(fail === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
