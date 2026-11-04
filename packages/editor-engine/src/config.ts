/**
 * Engine Feature Config（PRD §94 Markdown 设置）。
 *
 * 语法特性开关在编辑器加载时生效（bundle loader 读取 localStorage['mellow.engine.features']）。
 * 宿主（设置 UI）写入 JSON；变更后需重新加载编辑器（PRD §K.2：显示「重新加载编辑器」提示）。
 *
 * 默认值 = Typora 1.14.9 默认（ADR-0034 裁决，2026-11-03，用户拍板「全部翻转对齐 Typora」）：
 * highlight / subscript / superscript / mermaid 默认 **false**（Typora `frame.js`
 * DEFAULT_OPTIONS 实测均 `!1`）；其余开关维持开启（不改变普通文本渲染的显式语法）。
 * ⚠️ `supSub` 已拆分为 `subscript` / `superscript` 两路（Typora 是两个独立偏好）。
 */

export interface EngineFeatureConfig {
  /** ==高亮== */
  highlight: boolean;
  /** ~下标~（Typora enableSubscript） */
  subscript: boolean;
  /** ^上标^（Typora enableSuperscript） */
  superscript: boolean;
  /** :smile: emoji 补全 */
  emoji: boolean;
  /** > [!NOTE] GitHub Alerts */
  alerts: boolean;
  /** $...$ / $$...$$ 数学渲染 */
  math: boolean;
  /** mermaid 代码块渲染 */
  mermaid: boolean;
  /** [TOC] */
  toc: boolean;
  /** 脚注 */
  footnote: boolean;
  /** [[wikilink]] */
  wikilink: boolean;
  /** 安全 HTML 渲染 */
  html: boolean;
  /** YAML front matter */
  yaml: boolean;
}

export const DEFAULT_ENGINE_FEATURES: EngineFeatureConfig = {
  highlight: false,
  subscript: false,
  superscript: false,
  emoji: true,
  alerts: true,
  math: true,
  mermaid: false,
  toc: true,
  footnote: true,
  wikilink: true,
  html: true,
  yaml: true,
};

export function mergeEngineFeatures(features?: Partial<EngineFeatureConfig>): EngineFeatureConfig {
  return { ...DEFAULT_ENGINE_FEATURES, ...(features ?? {}) };
}

/**
 * 从 localStorage 读取引擎特性配置（bundle loader 使用）。
 * 返回 null 表示未配置（走默认）。
 *
 * ADR-0034 Q2/Q3（2026-11-03）：`supSub` 拆分为 `subscript` / `superscript` ——
 * 老配置里的 `supSub` 就地迁移到两个新键（仅当新键缺席时），并删除已失效的旧键，
 * 保证「开过 supSub 的老用户」不会因拆分而静默回到默认（关）。
 */
export function readEngineFeaturesFromStorage(): Partial<EngineFeatureConfig> | null {
  try {
    const raw = localStorage.getItem('mellow.engine.features');
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<EngineFeatureConfig> & { supSub?: boolean };
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { supSub, ...rest } = parsed;
    if (supSub !== undefined) {
      if (rest.subscript === undefined) rest.subscript = supSub;
      if (rest.superscript === undefined) rest.superscript = supSub;
      try { localStorage.setItem('mellow.engine.features', JSON.stringify(rest)); } catch { /* noop */ }
    }
    return rest;
  } catch {
    return null;
  }
}
