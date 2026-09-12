/**
 * Auto Save 定时保存策略（PRD §101；Typora 1.14.9 对标，G7-FEAT-03）。
 *
 * Typora 官方《Auto Save》支持文档的实测基线：
 * - **macOS**：自动保存是 **NSDocument 系统特性**，始终开启（"auto-save is always
 *   enabled as a system feature"），应用无法关闭；
 * - **Windows / Linux**：偏好设置项，**默认每 5 分钟保存一次**；间隔通过
 *   `conf/conf.user.json` 的 `autoSaveTimer`（Double，单位 minute，默认 5）改写，
 *   且**不在 GUI 暴露**（需「Open Advanced Settings」手改 JSON）。
 *
 * Mellow 的决策（D-G = ① 对齐 Typora 实测默认）：
 * - 三平台统一启用 5 分钟定时保存（规则 10：产品语义三平台共享）；
 * - 仍受既有 `mellow.file.autosave` 开关控制（Typora Win/Linux 同样可关闭）；
 * - 间隔 **在 GUI 暴露**（Typora 需手改 JSON）—— 判定为 **B（更优）**，
 *   因 Typora 该配置对普通用户不可达，属官方承认的能力但体验缺失。
 *
 * 纯函数、零依赖：便于单元测试与三平台复用，宿主侧只负责起停定时器。
 */

/** Typora Win/Linux 默认间隔（分钟）—— 官方 `autoSaveTimer` 默认值。 */
export const DEFAULT_AUTOSAVE_MINUTES = 5;

/** 允许的最小间隔（分钟）：低于 1 分钟会与用户输入/IME 抢 IO，不做无意义保护。 */
export const MIN_AUTOSAVE_MINUTES = 1;

/** 允许的最大间隔（分钟）：24 小时，超过即视为配置错误回退默认。 */
export const MAX_AUTOSAVE_MINUTES = 60 * 24;

/**
 * 解析自动保存间隔（分钟）。
 *
 * - `null` / 空串 / 非有限数 / 非正数 / 超上限 → 回退 `DEFAULT_AUTOSAVE_MINUTES`；
 * - 小于 `MIN_AUTOSAVE_MINUTES` 的正数 → 夹紧到 `MIN_AUTOSAVE_MINUTES`（不回退：
 *   用户显式表达了「更频繁」的意图，回退到 5 分钟反而违背意图）。
 */
export function parseAutosaveMinutes(raw: string | null | undefined): number {
  if (raw === null || raw === undefined) return DEFAULT_AUTOSAVE_MINUTES;
  const trimmed = String(raw).trim();
  if (trimmed === '') return DEFAULT_AUTOSAVE_MINUTES;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_AUTOSAVE_MINUTES) {
    return DEFAULT_AUTOSAVE_MINUTES;
  }
  return Math.max(MIN_AUTOSAVE_MINUTES, value);
}

/** 自动保存开关：默认开启（Typora macOS 始终开；Win/Linux 可关，默认即开）。 */
export function isAutosaveEnabled(raw: string | null | undefined): boolean {
  return raw !== '0';
}

/** 间隔 → 毫秒（供 setTimeout / setInterval 使用）。 */
export function autosaveIntervalMs(minutes: number): number {
  return parseAutosaveMinutes(String(minutes)) * 60_000;
}
