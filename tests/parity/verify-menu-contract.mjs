import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const source = readFileSync(resolve(root, 'apps/desktop/src-tauri/src/menu.rs'), 'utf8');
const appSource = readFileSync(resolve(root, 'apps/desktop/src/App.tsx'), 'utf8');
const expectedPushes = [
  'subs.push(file_menu);',
  'subs.push(edit_menu);',
  'subs.push(paragraph_menu);',
  'subs.push(format_menu);',
  'subs.push(view_menu);',
  'subs.push(theme_menu);',
  'subs.push(window_menu);',
  'subs.push(help_menu);',
];

let previous = -1;
for (const push of expectedPushes) {
  const index = source.indexOf(push);
  if (index === -1) throw new Error(`Native menu misses required top-level menu: ${push}`);
  if (index < previous) throw new Error(`Native menu top-level order violates Typora contract at: ${push}`);
  previous = index;
}
if (source.includes('subs.push(insert_menu);') || /let insert_menu\s*=/.test(source)) {
  throw new Error('Native menu must not expose Insert as a top-level menu');
}
if (/split\.(open|toggle)|Split\s*\(Source\s*\|\s*Preview\)/.test(source)) {
  throw new Error('V1 native menu must not expose removed Split Mode');
}
const nativeCommandIds = [...source.matchAll(/(?:MenuItem|CheckMenuItem)::with_id\(app,\s*"([^"]+)"/g)].map((match) => match[1]);
const desktopCommandIds = new Set([...appSource.matchAll(/\{ id: '([^']+)'/g)].map((match) => match[1]));
const unhandledNativeCommands = nativeCommandIds.filter((id) => !desktopCommandIds.has(id));
if (unhandledNativeCommands.length > 0) {
  throw new Error(`Native menu commands missing from CommandRegistry: ${unhandledNativeCommands.join(', ')}`);
}
for (const required of ['&i_table', '&i_mermaid', '&i_image']) {
  if (!source.includes(required)) throw new Error(`Merged insertion command missing from native menu: ${required}`);
}
const themeSource = readFileSync(resolve(root, 'packages/themes/src/index.ts'), 'utf8');
const themeIds = [...themeSource.matchAll(/id: '([a-z-]+)'/g)].map((match) => match[1]);
const nativeThemeIds = [...(source.match(/let theme_ids = \[([^\]]+)\]/)?.[1] ?? '').matchAll(/"([a-z-]+)"/g)].map((match) => match[1]);
for (const id of themeIds) {
  if (!nativeThemeIds.includes(id)) throw new Error(`Native Theme menu misses registry theme: ${id}`);
}
console.log(`Native menu contract: File → Edit → Paragraph → Format → View → Theme → Window → Help; ${nativeCommandIds.length} native command IDs dispatch through CommandRegistry`);
