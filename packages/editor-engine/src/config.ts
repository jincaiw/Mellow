/**
 * Engine Feature Config（PRD §94 Markdown 设置）。
 *
 * 语法特性开关在编辑器加载时生效（bundle loader 读取 localStorage['mellow.engine.features']）。
 * 宿主（设置 UI）写入 JSON；变更后需重新加载编辑器（PRD §K.2：显示「重新加载编辑器」提示）。
 * 全部默认开启（与 Typora 默认行为一致）。
 */

export interface EngineFeatureConfig {
  /** ==高亮== */
  highlight: boolean;
  /** ^上标^ / ~下标~ */
  supSub: boolean;
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
  highlight: true,
  supSub: true,
  emoji: true,
  alerts: true,
  math: true,
  mermaid: true,
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
 */
export function readEngineFeaturesFromStorage(): Partial<EngineFeatureConfig> | null {
  try {
    const raw = localStorage.getItem('mellow.engine.features');
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<EngineFeatureConfig>;
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}
