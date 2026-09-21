/**
 * YAML front matter 边界提取（**无依赖**纯函数）。
 *
 * 为什么单独成文件：`yamlFrontMatter.ts` 的解析器依赖 CodeMirror，而**宿主侧**
 * （如 Reader / 导出的图片解析）也需要读 front matter（`typora-root-url`），
 * 不应为一次字符串扫描把 CodeMirror 拉进宿主 bundle。
 *
 * 边界规则与 `parseYamlFrontMatter` **完全一致**（由单测交叉比对锁定，防两套扫描器漂移）：
 * 文档必须以 `---\n` 开头，结束于后续的 `\n---`。
 */

export interface FrontMatterBounds {
  /** yaml 正文起点（含开头 `---\n` 之后） */
  yamlFrom: number;
  /** yaml 正文终点（结束分隔符的 `\n` 之前） */
  yamlTo: number;
  /** front matter 整体终点（结束行之后；无换行则到文末） */
  to: number;
}

/** 提取 front matter 边界；无 front matter → null。 */
export function frontMatterBounds(doc: string): FrontMatterBounds | null {
  if (!doc.startsWith('---\n')) return null;
  const close = doc.indexOf('\n---', 4);
  if (close === -1) return null;
  const closeLineEnd = doc.indexOf('\n', close + 1);
  const to = closeLineEnd === -1 ? doc.length : closeLineEnd;
  return { yamlFrom: 4, yamlTo: close, to };
}

/** 提取 front matter 的 yaml 正文；无 front matter → null。 */
export function frontMatterYaml(doc: string): string | null {
  const bounds = frontMatterBounds(doc);
  return bounds === null ? null : doc.slice(bounds.yamlFrom, bounds.yamlTo);
}
