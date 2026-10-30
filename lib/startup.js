// dsh-road-building-materials - startup plugin.
//
// Registers the `road-building-materials` skill into ctx.skills. The skill body and its
// 60 capability cards live in this package's own skills/ directory and carry a directory
// resourceBase, so every references/... path in SKILL.md resolves against the bundle.
//
// Dependency-free by design (node:fs / node:path / node:url only).
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_REL = 'skills/road-building-materials';
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Read the leading `---` block of a SKILL.md into a Map.
 *
 * Handles plain scalars as well as YAML block scalars (`key: |` / `key: >`). This skill's
 * `description` is a block scalar; a parser that only understands plain scalars reads it back
 * as the literal string "|".
 */
function readFrontmatter(text) {
  if (!text.startsWith('---')) return null;
  const closing = text.indexOf('\n---', 3);
  if (closing === -1) return null;

  const block = text.slice(3, closing).split('\n');
  const fields = new Map();

  for (let i = 0; i < block.length; i++) {
    const line = block[i];
    const first = line.charAt(0);
    if (line.trim() === '' || first === ' ' || first === '\t' || first === '#') continue;
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    if (fields.has(key)) continue;

    let value = line.slice(separator + 1).trim();
    const isBlock = /^[|>][-+]?$/.test(value);
    if (isBlock) {
      const folded = value.startsWith('>');
      const collected = [];
      let j = i + 1;
      while (j < block.length) {
        const next = block[j];
        if (next.trim() !== '' && next.charAt(0) !== ' ' && next.charAt(0) !== '\t') break;
        if (next.trim() !== '') collected.push(next.trim());
        j++;
      }
      value = (folded ? collected.join(' ') : collected.join('\n')).trim();
      i = j - 1;
    } else {
      value = value.replace(/^(['"])(.*)\1$/, '$2');
    }
    fields.set(key, value);
  }
  return fields;
}

/** Load one skill directory relative to this package, or null if unusable. */
function loadSkill(relativeDir) {
  const skillDir = join(PACKAGE_ROOT, relativeDir);
  const manifest = join(skillDir, 'SKILL.md');
  if (!existsSync(manifest) || !statSync(manifest).isFile()) return null;

  const text = readFileSync(manifest, 'utf8');
  const fields = readFrontmatter(text);
  if (!fields) return null;

  const name = fields.get('name');
  const description = fields.get('description');
  if (typeof name !== 'string' || !SKILL_NAME.test(name)) return null;
  if (typeof description !== 'string' || description.length === 0) return null;

  const bodyStart = text.indexOf('\n---', 3) + 4;
  return {
    name,
    description,
    content: text.slice(bodyStart).replace(/^\n/, ''),
    resourceBase: { kind: 'directory', path: skillDir },
  };
}

export default function apply(ctx) {
  if (!ctx?.skills) {
    console.warn('[dsh-road-building-materials] ctx.skills unavailable - skill not registered');
    return;
  }
  const skill = loadSkill(SKILL_REL);
  if (!skill) {
    console.warn(`[dsh-road-building-materials] failed to load ${SKILL_REL}/SKILL.md`);
    return;
  }
  ctx.skills.register({ ...skill, source: 'runtime' });
  console.log(`[dsh-road-building-materials] registered skill ${skill.name}`);
}
