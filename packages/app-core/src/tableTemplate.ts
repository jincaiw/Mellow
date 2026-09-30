/**
 * 表格模板生成（`table-editing-spec` §3 的 **Create Dialog**）。
 *
 * ## 口径全部来自一手证据（本机 Typora 1.14.9），不是推测
 *
 * 1. **默认值**：`TypeMark/html/content.html` 的 `#table-insert-dialog` ——
 *    `#table-insert-col`（label `Columns`）`value="3"`、`#table-insert-row`（label `Rows`）`value="4"`。
 *    文案见 `zh-Hans.lproj/Front.strings`：`Insert Table=插入表格` / `Columns=列` / `Rows=行`。
 * 2. **「Rows 是否含表头行」= 含**（两条独立路径互相印证）：
 *    - `appsrc/main.js` 的 `h.verify(table, col, row)`：`for (s = children.length; s < row; s++)`
 *      把表节点补到**恰好 `row` 行**；同一函数用 `children.at(0)` 取列数 → 第 0 行即表头。
 *    - resize 路径：`#md-grid-height` 取 `tr.prevAll().length + 1`，应用时
 *      `for (; c || u < l;)` 精确保留 **`l` 行**，且 `c = s.getFirstChild()`。
 *    → `Rows = 4` 表示 **1 表头 + 3 数据行**（不是「表头 + 4 行」）。
 * 3. **空值兜底**（一手，同上文件）：列输入框 blur 时空 → **2**；行输入框 blur 时空 → **1**；
 *    两者最小均为 **1**。
 *
 * ## ⚠️ 上限是 Mellow 自定（如实声明）
 *
 * Typora 的两个上限常量（源码里的 `u` / `d`）**没有**从压缩产物中提取到，
 * 故本实现自定 30 列 / 100 行 —— 与 `table-editing-spec` §9 的「**100 × 30 target**」一致。
 * **不得**把这两个数写成「Typora 的值」。
 */

/** 列上限（Mellow 自定，见文件头；对齐 spec §9 的 100×30 target） */
export const TABLE_TEMPLATE_MAX_COLUMNS = 30;
/** 行上限（含表头行；Mellow 自定，见文件头） */
export const TABLE_TEMPLATE_MAX_ROWS = 100;
/** 默认列数（一手：Typora `#table-insert-col` value="3"） */
export const TABLE_TEMPLATE_DEFAULT_COLUMNS = 3;
/** 默认行数（含表头行；一手：Typora `#table-insert-row` value="4"） */
export const TABLE_TEMPLATE_DEFAULT_ROWS = 4;
/** 列输入框**留空**时的兜底（一手：Typora 列框 blur 时空 → 2） */
export const TABLE_TEMPLATE_EMPTY_COLUMNS = 2;
/** 行输入框**留空**时的兜底（一手：Typora 行框 blur 时空 → 1） */
export const TABLE_TEMPLATE_EMPTY_ROWS = 1;

/**
 * 解析对话框里的数字字段（一手兜底语义）。
 *
 * 一手证据：Typora 对两个输入框分别 `blur` 时做了不同兜底 ——
 * 列空 → **2**、行空 → **1**（见 `appsrc/main.js` 的 `#table-insert-col` / `#table-insert-row`
 * 的 `blur` handler）；非法输入由输入框自身拦截（`keypress` 只接受数字），故这里只兜底「空 / 非数字」。
 */
export function parseTableCount(raw: string | undefined, emptyFallback: number): number {
  const text = (raw ?? '').trim();
  if (text === '') return emptyFallback;
  const parsed = Number.parseInt(text, 10);
  return Number.isNaN(parsed) ? emptyFallback : parsed;
}

/** 夹取为整数（非数字 / NaN → 取 min；越界 → 夹到边界） */
function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** 单元格占位（与 Mellow 既有模板一致：`|  |  |` 两空格空单元格） */
const CELL = '  ';
const DELIMITER_CELL = '---';

/**
 * 生成 GFM 表格源码。
 *
 * @param rows **含表头行**的总行数（一手口径，见文件头）
 * @param columns 列数
 *
 * 例（默认 4 行 3 列）：
 * ```text
 * |  |  |  |
 * |---|---|---|
 * |  |  |  |
 * |  |  |  |
 * |  |  |  |
 * ```
 * `rows = 1` 时只产出表头 + 分隔行（GFM 合法：表头 + 分隔行即最简表格）。
 */
export function buildGfmTable(rows: number, columns: number): string {
  const cols = clampInt(columns, 1, TABLE_TEMPLATE_MAX_COLUMNS);
  const totalRows = clampInt(rows, 1, TABLE_TEMPLATE_MAX_ROWS);

  const header = `|${`${CELL}|`.repeat(cols)}`;
  const delimiter = `|${`${DELIMITER_CELL}|`.repeat(cols)}`;
  const body = Array.from({ length: totalRows - 1 }, () => header);
  return [header, delimiter, ...body].join('\n');
}
