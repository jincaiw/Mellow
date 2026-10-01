/**
 * 视觉采样的「渲染已稳定」等待原语。
 *
 * ## 为什么需要它（2026-10-01 实测，Windows runner）
 *
 * 视觉 Golden 的采样读的是 `getBoundingClientRect()`，而**入场动画会改变这个读数**。
 * 实测：`.settings-backdrop` 带 `animation: mellow-fade 140ms ease`，其 `from` 帧是
 * `transform: translateY(-4px)` → 动画未完成时 `.settings-panel` 的 `y` 读到 **146**，
 * 稳态是 **150**（视口 900 / 面板高 600 → (900-600)/2）。差 4px，恰好越过多像素容差。
 *
 * 原实现用 `sleep(400)` 兜底 140ms 的动画。**在负载高的 runner 上这不成立**：
 * 渲染进程可能尚未产出首帧，动画「还没开始」，墙钟已经走完 ——
 * 于是同一个提交，同一台 runner 镜像，一次读到 150、一次读到 146。
 *
 * **教训：`sleep(N)` 是「等时间」，不是「等状态」。** 只要采样值会被动画影响，
 * 就必须等**动画结束**这个状态，而不是猜一个够大的 N。
 *
 * ## 用法
 *
 * ```js
 * import { waitForAnimationsSettled } from './wait-rendered.mjs';
 * // …打开面板 / 唤出浮层…
 * if (!(await waitForAnimationsSettled(page))) {
 *   throw new Error('入场动画未在超时内结束 —— 采样会读到动画中间值');
 * }
 * const r = await page.evaluate(() => document.querySelector('.settings-panel').getBoundingClientRect());
 * ```
 *
 * 返回 `false` 时**必须让调用方响亮失败**，不要静默继续采样 ——
 * 静默继续正是「读数随 runner 负载漂移」的成因。
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 这个动画是否**值得等**（即：它是否会自己结束）。
 *
 * ⚠️ **不能简单地「等所有动画结束」** —— 页面里可能有**合法的常驻动画**，
 * 它们永远不会 `finished`，等它等于永远等下去。
 *
 * 实测（`/tmp` 探针，2026-10-01）：编辑器 iframe 里**只有一个**动画 ——
 * CodeMirror 6 的光标闪烁 `cm-blink2`（target `div.cm-cursorLayer`、
 * `duration: 1000`、`iterations: Infinity`）。主文档侧为 0 个动画。
 * 若不做区分，对 iframe 调用本函数会**必然超时** —— 那是「把假失败引进来」，
 * 比原来的时序漂移更糟。
 *
 * 判据：**无限迭代（`iterations === Infinity`）⇒ 不等**；其余非 finished ⇒ 等。
 *
 * 抽成**纯函数**（不依赖浏览器）是为了能被测试/护栏直接调用 ——
 * 否则这段判定只能在真实浏览器里验证，护栏拿不到它。
 *
 * @param {{ playState?: string, effect?: { getTiming?: () => { iterations?: number } } }} animation
 * @returns {boolean}
 */
export function isPendingSettlable(animation) {
  const timing = animation?.effect?.getTiming?.();
  if (timing !== undefined && timing !== null && timing.iterations === Infinity) return false;
  return animation?.playState !== 'finished';
}

/**
 * 等待页面上的**入场**动画全部结束（常驻动画被跳过，见 `isPendingSettlable`）。
 *
 * 步骤：① 推 2 帧（确保动画对象已创建并进入 running，避免「动画还没开始」的窗口）；
 * ② 轮询 `document.getAnimations()`，直到没有「值得等且未结束」的动画。
 *
 * @param {{ evaluate: Function }} page Playwright `Page` **或** `Frame`（两者都有 `evaluate`）
 * @param {{ timeoutMs?: number, stepMs?: number }} [opts]
 * @returns {Promise<boolean>} 是否在超时内全部结束（false ⇒ 调用方应报错，不得继续采样）
 */
export async function waitForAnimationsSettled(page, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 3000;
  const stepMs = opts.stepMs ?? 50;

  // ① 推 2 帧：让「刚插入的动画」有机会被创建并启动。
  await page.evaluate(() => new Promise((r) => {
    requestAnimationFrame(() => requestAnimationFrame(() => r(null)));
  }));

  // ② 等状态：没有「值得等且未结束」的动画才算稳定。
  //
  // 判定谓词以**源码字符串**送进浏览器（而非在 evaluate 里另写一份）——
  // 否则「护栏测的谓词」与「浏览器里真正跑的谓词」是两份，会漂移
  // （本仓已实测过的失效模式：canary 测的是副本）。送进去的是**同一个** `isPendingSettlable`。
  const predicateSource = isPendingSettlable.toString();
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const pending = await page.evaluate((src) => {
      if (typeof document.getAnimations !== 'function') return 0;
      // eslint-disable-next-line no-new-func -- 源码来自本模块自身的函数，非外部输入
      const predicate = new Function(`return (${src})`)();
      return document.getAnimations().filter(predicate).length;
    }, predicateSource);
    if (pending === 0) return true;
    if (Date.now() > deadline) return false;
    await sleep(stepMs);
  }
}

/**
 * 等待焦点稳定到指定选择器上（用于「开面板 / 唤出输入框后自动聚焦」的采样）。
 *
 * 为什么需要：Mellow 的 ⌘F 侧栏过滤框在挂载后 **1200ms 内每 60ms 夺回一次焦点**
 * （对抗编辑器 iframe 抢焦点，见 `App.tsx` 的 `treeFilterRef` effect）。
 * 在「输入框刚出现」的瞬间采样 `document.activeElement === el`，
 * 读到的是**争夺中间态** —— 谁赢取决于这一瞬间的调度，同一提交可以一次 false 一次 true。
 * 稳态（用户真正能键入的状态）才是该字段想表达的契约。
 *
 * @param {import('playwright').Page} page
 * @param {string} selector
 * @param {{ timeoutMs?: number, stepMs?: number }} [opts]
 * @returns {Promise<boolean>}
 */
export async function waitForFocusSettled(page, selector, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 3000;
  const stepMs = opts.stepMs ?? 50;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const ok = await page.evaluate(
      (sel) => document.activeElement === document.querySelector(sel),
      selector,
    );
    if (ok) return true;
    if (Date.now() > deadline) return false;
    await sleep(stepMs);
  }
}
