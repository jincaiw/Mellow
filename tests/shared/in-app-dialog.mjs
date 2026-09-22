/**
 * 应用内输入对话框驱动（G7-EDIT-10 迁移后的**唯一**正确姿势）。
 *
 * ## 背景（2026-09-22 定性，真实回归）
 *
 * `fileTree.newFile` / `fileTree.newFolder` 等命令原先弹 `window.prompt`，
 * 测试用 `page.on('dialog', (d) => d.accept(name))` 应答。
 *
 * commit `5cb37df`（2026-09-17，G7-EDIT-10 收尾）把 9 处 `window.prompt` 全部迁到
 * 应用内 `askInput()`（`.confirm-modal-input` + `.confirm-modal-actions`）后，
 * `page.on('dialog')` **永不触发** —— 名字从未输入 → 条目从未创建。
 * 该提交新增了 `tests/e2e/in-app-input-dialog-verify.mjs` 与护栏，
 * 却**漏改两个既有消费者**：
 *
 *   - `tests/visual/sidebar-golden.mjs` → Linux/Windows 采集报
 *     `Error: mock workspace 构建失败`（`P0-LAYOUT-002` 长期缺基线）
 *   - `tests/e2e/drag-drop-verify.mjs` → 拖拽用例失去前置工作区
 *
 * 两者都不在 CI 主链上（视觉采集只在 Runtime Qualification、e2e 不进 CI），
 * 因此静默腐烂数天而无人发现 —— 与「护栏必须与提交形成硬依赖」同源教训。
 *
 * ## 用法
 *
 * ```js
 * import { createWorkspaceEntry } from '../shared/in-app-dialog.mjs';
 * await createWorkspaceEntry(page, 'fileTree.newFile', 'a.md');
 * ```
 *
 * 断言「**没有**原生面板」时不要用本模块：那种场景应保留
 * `page.on('dialog', …)` 作为**负向**记录器（见 `dirty-leave-dialog-verify.mjs`）。
 */

/** 应用内输入对话框的 DOM 契约（与 App.tsx 的 askUser/askInput 渲染一致） */
export const INPUT_DIALOG_SELECTORS = Object.freeze({
  backdrop: '.confirm-modal-backdrop',
  input: '.confirm-modal-input',
  actions: '.confirm-modal-actions',
  primary: '.confirm-modal-actions .confirm-modal-primary',
});

/**
 * 通过命令 + **应用内**输入对话框在 mock workspace 中创建文件 / 文件夹。
 *
 * @param {import('playwright').Page} page
 * @param {string} commandId 例如 `fileTree.newFile` / `fileTree.newFolder`
 * @param {string} name 输入的名称（Enter = 主按钮「确定」）
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<boolean>} 是否确实走完了「出现输入框 → 填名 → 确定 → 对话框关闭」
 */
export async function createWorkspaceEntry(page, commandId, name, options = {}) {
  const timeoutMs = options.timeoutMs ?? 8000;
  await page.evaluate((id) => window.__MELLOW_COMMANDS__.dispatch(id), commandId);
  const input = page.locator(INPUT_DIALOG_SELECTORS.input);
  try {
    await input.waitFor({ state: 'visible', timeout: timeoutMs });
  } catch {
    // 命令没有弹出输入框：要么命令不存在，要么仍走原生面板（后者说明迁移被回退）。
    // 返回 false 让调用方给出**指名**的失败，而不是继续跑到「工作区不完整」的模糊断言。
    return false;
  }
  // Playwright 的 fill 内部用原生 value setter + input 事件，满足 React 受控组件要求。
  await input.fill(name);
  await input.press('Enter');
  // 等对话框关闭，确保命令真正落盘到 mock fs 后才返回。
  await page
    .locator(INPUT_DIALOG_SELECTORS.backdrop)
    .waitFor({ state: 'detached', timeout: timeoutMs })
    .catch(() => undefined);
  return true;
}
