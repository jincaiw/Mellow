/**
 * 生成 Mellow editor bundle：apps/desktop/public/editor/index.html
 *
 * 输入：
 *   1. packages/editor-core/CoreEditor/dist/index.html（MarkEdit 上游构建产物）
 *   2. packages/editor-engine/dist/*.js（Mellow Live Markdown Engine）
 *
 * 处理（平台无关注入由 editor-core 规范实现 buildBundleHtml）：
 *   1. 替换 "{{EDITOR_CONFIG}}" / "{{USER_SETTINGS}}" → 配置 JSON；
 *   2. 注入桥接脚本（webkit.messageHandlers.bridge → window.__MELLOW_BRIDGE__ 契约）；
 *   3. **注入 Tauri 适配器**（desktop 专属：把 __MELLOW_BRIDGE__ 接到 __TAURI__.core）；
 *      —— editor-core 不包含任何 Tauri 知识，Tauri 适配只存在于本 Adapter 层；
 *   4. 复制引擎到 public/editor/engine/ 并补 .js 扩展名（浏览器 ESM 要求）；
 *   5. 注入引擎 loader（MarkEdit.addExtension）。
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// editor-core 平台无关 bundle 构建模块（tsc 产物，CJS）
// eslint-disable-next-line import/no-unresolved
import { buildBundleHtml, DEFAULT_CONFIG } from '../../../packages/editor-core/dist/bundle.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, '../../packages/editor-core/CoreEditor/dist/index.html');
const engineDist = resolve(root, '../../packages/editor-engine/dist');
const targetDir = resolve(root, 'public/editor');
const target = resolve(targetDir, 'index.html');

// V6-P0 渲染层交付可信化：以 app 版本作为 bundle 资产指纹。core-main.js 与
// engine/ 目录名携带版本（core-main-1.5.0.js / engine-1.5.0/），升级后
// WKWebView 无法再命中旧版本缓存（此前文件名固定，真机升级后可能继续加载
// 旧渲染层 —— v1.4.8 真机截图审计确认了该混合态）。构建前清理旧版本产物，
// 保证 frontendDist 只打包当前版本。
const appVersion = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
const assetVersion = `v${appVersion}`;
const coreMainName = `core-main-${assetVersion}.js`;
const engineDirName = `engine-${assetVersion}`;

// Desktop 使用写作优先的产品默认值。CoreEditor 的 DEFAULT_CONFIG 同时承担
// 上游开发/调试入口，因此仍会显示行号、不可见字符并使用等宽字体；这些值不应
// 泄漏到 Mellow 的首次启动体验（PRD §68 / Desktop UI Spec §16）。用户设置会在
// EditorHost ready 后继续覆盖字体、字号与行号。
const desktopEditorConfig = {
  ...DEFAULT_CONFIG,
  fontFace: { family: 'system-ui' },
  showLineNumbers: false,
  showActiveLineIndicator: false,
  invisiblesBehavior: 'never',
  // V5-B 排版真值：Typora Github 主题标题阶梯 2.25/1.75/1.5/1.25/1/1 em
  //（×16px = 36/28/24/20/16/16px）。此 config 在运行时覆盖 CoreEditor
  // heading.ts 的同名默认值 —— V5 曾只改 heading.ts 导致真机阶梯未生效
  //（v1.4.8 截图审计定位）。两处必须保持一致，verify-release-bundle.mjs 锁定。
  headerFontSizeDiffs: [20, 12, 8, 4, 0, 0],
};

// 与 packages/editor-core/src/bridge-injection.ts BRIDGE_INJECTION 保持一致（由 buildBundleHtml 注入）

/**
 * Tauri 适配器（desktop Adapter 层专属）：
 * 把 editor-core 的 __MELLOW_BRIDGE__ 契约接到 Tauri 2 的 __TAURI__.core.invoke。
 * 这是 editor-core 与 Tauri 之间唯一的知识边界 —— 存在于本脚本，不在 editor-core。
 */
const tauriBridgeAdapter = `<script>
(function () {
  if (window.parent && window.parent.__TAURI__) {
    try { window.__TAURI__ = window.parent.__TAURI__; } catch (e) {}
  }
  if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
    window.__MELLOW_BRIDGE__ = {
      invoke: function (message) {
        return window.__TAURI__.core.invoke('bridge_call', { message: message });
      }
    };
    // 图片资源 URL 解析（本地绝对路径 → asset:// URL；URL/data 原样）
    try {
      var convertFileSrc = window.__TAURI__.core.convertFileSrc;
      window.__MELLOW_ASSET_RESOLVER__ = function (src) {
        if (/^[a-zA-Z][a-zA-Z0-9+.-]*:[/]{2}/.test(src) || src.indexOf('data:') === 0) return src;
        try { return typeof convertFileSrc === 'function' ? convertFileSrc(src) : src; } catch (e) { return src; }
      };
    } catch (e) {}
    // 拖拽路径缓冲（desktop 宿主经 webview onDragDropEvent 写入；engine drop 时消费）
    if (typeof window.__MELLOW_DROP_PATHS__ === 'undefined') {
      window.__MELLOW_DROP_PATHS__ = [];
    }
  }
})();
</script>`;

/**
 * 按键同步桥（iframe → 宿主）：编辑器 iframe 聚焦时 keydown 不跨 frame 传播，
 * 宿主 window 级快捷键（Win/Linux 无原生菜单加速键：保存/缩放/查找/切换类全量）
 * 依赖此通道。同源 iframe 直接同步调用 window.parent.__MELLOW_SHORTCUT_API__.dispatch：
 *   - 命中命令 → 返回 true → 立即 preventDefault（WKWebView 对未被菜单拦截的
 *     ⌘ 组合会明文插入字符，如 ⇧⌘= 插入 '='；postMessage 异步回程无法阻止）；
 *   - 未命中 → 返回 false → 事件自然放行（CodeMirror keymap 已在捕获链消费的
 *     defaultPrevented 不进入本桥；IME 组合中不派发，PRD §13 IME 优先）；
 *   - 携带 e.code（物理键位：⌥ 组合在 mac 上 e.key 为特殊字符如 '∫'，
 *     宿主侧优先用 code 归一，布局无关）。
 */
const keyForwarder = `<script>
(function () {
  if (window.parent === window) return;
  // MarkEdit's built-in indentation binding consumes Tab before extensions
  // appended with MarkEdit.addExtension() on WKWebView. Keep the product
  // rule in editor-engine, but invoke it from this earliest iframe capture
  // boundary so a table cell never receives a literal indentation tab.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    try {
      var engine = window.MellowEditorEngine;
      var editor = window.editor;
      var handled = engine && editor && typeof engine.handleTableTab === 'function' &&
          engine.handleTableTab(editor, e.shiftKey);
      if (handled) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    } catch (err) { /* engine not ready / non-table: leave native editor behavior intact */ }
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.isComposing || e.key === 'Process') return;
    if (!e.metaKey && !e.ctrlKey) return;
    try {
      var api = window.parent.__MELLOW_SHORTCUT_API__;
      if (api && typeof api.dispatch === 'function' &&
          api.dispatch(e.key, e.code || '', {
            ctrlKey: e.ctrlKey, metaKey: e.metaKey,
            altKey: e.altKey, shiftKey: e.shiftKey
          })) {
        e.preventDefault();
        e.stopPropagation();
      }
    } catch (err) { /* 宿主不可达时静默放行 */ }
  });
})();
</script>`;

/**
 * 滚轮缩放桥（iframe → 宿主）：Cmd/Ctrl + 滚轮 → 字号缩放（Typora 偏好→通用）。
 * 宿主侧 __MELLOW_WHEEL_API__.zoom 由 App.tsx 挂载（读 mellow.editor.cmdWheelZoom
 * 开关后调 adjustFontSize，与 ⇧⌘= 单一真源 editor.fontSize）。
 * 仅修饰滚轮触发并 preventDefault（阻止 WKWebView 浏览器级缩放）；无修饰自然放行。
 */
const wheelForwarder = `<script>
(function () {
  if (window.parent === window) return;
  document.addEventListener('wheel', function (e) {
    if (!e.ctrlKey && !e.metaKey) return;
    try {
      var api = window.parent.__MELLOW_WHEEL_API__;
      if (api && typeof api.zoom === 'function') {
        api.zoom(e.deltaY > 0 ? -1 : 1);
        e.preventDefault();
        e.stopPropagation();
      }
    } catch (err) { /* 宿主不可达时静默放行 */ }
  }, { passive: false });
})();
</script>`;

/**
 * 引擎 loader：等待 MarkEdit 就绪后注入引擎扩展。
 * 放在 CoreEditor bundle script 之后（模块按文档顺序执行）：
 * bundle 顶层同步执行 initMarkEditModules → MarkEdit 已存在 → addExtension 推入扩展存储；
 * resetEditor（window.onload）创建编辑器时自动包含用户扩展。
 */
const engineLoader = `<script type="module">
import * as MellowEngine from './${engineDirName}/index.js';
window.MellowEditorEngine = MellowEngine;
window.__MELLOW_BUNDLE_VERSION__ = '${assetVersion}';
(function () {
  function tryInit() {
    if (window.MarkEdit && typeof window.MarkEdit.addExtension === 'function') {
      try {
        // image 扩展（桥接 host：fs 经 __MELLOW_BRIDGE__、资源 URL 经 __MELLOW_ASSET_RESOLVER__）
        window.MarkEdit.addExtension(MellowEngine.buildImageExtensions(MellowEngine.createBridgeImageHost()));
      } catch (e) {
        console.error('[mellow] image extensions install failed', e);
      }
      try {
        // 语法特性开关（PRD §94）：localStorage['mellow.engine.features']（设置 UI 写入）
        const features = MellowEngine.readEngineFeaturesFromStorage();
        window.MarkEdit.addExtension(MellowEngine.install(undefined, features));
      } catch (e) {
        console.error('[mellow] engine install failed', e);
      }
    } else {
      setTimeout(tryInit, 100);
    }
  }
  tryInit();
})();
</script>`;

/** 复制引擎 dist → public/editor/engine-<version>/（递归，保留子目录；浏览器 ESM 要求显式 .js 扩展名） */
function copyEngine() {
  const engineTargetDir = resolve(targetDir, engineDirName);
  mkdirSync(engineTargetDir, { recursive: true });

  const copied = [];
  const walk = (dir, rel = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const srcPath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        walk(srcPath, `${rel}${entry.name}/`);
        continue;
      }
      if (!entry.name.endsWith('.js')) {
        continue;
      }
      const relPath = `${rel}${entry.name}`;
      const targetFile = resolve(engineTargetDir, relPath);
      mkdirSync(dirname(targetFile), { recursive: true });
      let content = readFileSync(srcPath, 'utf8');
      // 浏览器 ESM 要求显式扩展名（tsc 默认不带）：./foo、../foo、../../foo
      // → 补 .js（文件）或 /index.js（目录）。修复：旧正则只匹配 ./ 前缀，
      // 漏掉 table/columnWidth.js 等子目录文件对上级模块（../composition、
      // ../mode）的导入 → iframe 内 404 → 引擎加载失败（Aug 19 白屏评估发现）。
      content = content.replace(/((?:from|import)\s*['"])((?:\.\.?\/)+[^'"]+)(['"])/g, (m, pre, rel, q) => {
        const jsPath = resolve(dir, `${rel}.js`);
        const idxPath = resolve(dir, rel, 'index.js');
        if (existsSync(jsPath)) return `${pre}${rel}.js${q}`;
        if (existsSync(idxPath)) return `${pre}${rel}/index.js${q}`;
        return m; // 保持原样（非本地相对导入或无法解析，交由运行时处理）
      });
      // CoreEditor bundles CodeMirror internally and exposes the exact module
      // instances through window.require. Browser ESM cannot resolve bare
      // @codemirror specifiers, so bridge named imports to that registry rather
      // than bundling a second (incompatible) CodeMirror copy.
      content = content.replace(/import\s+\{([^}]+)\}\s+from\s+['"](@(?:codemirror|lezer)\/[^'"]+)['"];?/g, (_m, names, pkg) =>
        `const {${names}} = window.require('${pkg}');`);
      writeFileSync(targetFile, content, 'utf8');
      copied.push(relPath);
    }
  };
  walk(engineDist);

  if (copied.length === 0) {
    throw new Error('editor-engine dist is empty, run `npm run build` in packages/editor-engine first');
  }
  console.log(`engine copied: ${copied.join(', ')}`);
}

/**
 * 编辑区留白契约 CSS（P2-2.2）：Top Padding 56px / Bottom Space ≥30vh，跨主题一致。
 *
 * 注入位置 = desktop Adapter 层（CoreEditor vendored 源码只读，见 UPSTREAM.md；
 * 上游 sharedStyles .cm-content padding-top 仅 2px）。Reader 侧同值见
 * desktop styles.css .mellow-reader（padding: 56px 32px 30vh）。
 * !important 需覆盖 EditorView.theme 的 style-mod 规则；typewriter 模式的
 * 50vh padding-top stylesheet 运行时后置且同为 !important，按文档顺序胜出。
 */
const typographyContract = `<style data-mellow-typography="P2-2.2">
.cm-content { padding-top: 56px !important; }
</style>`;

function build() {
  const html = readFileSync(source, 'utf8');

  // 1-3. 平台无关注入（config 占位符替换 + 桥接注入）—— editor-core 规范实现
  let out = buildBundleHtml(html, { config: desktopEditorConfig });

  // P2-2.2 留白契约（必须在 head 内、styleAdoptShim 观察范围内）
  out = out.replace('</head>', `${typographyContract}\n</head>`);

  // TEMP→FIX(j17-3): tauri:// WKURLSchemeHandler（macOS WKWebView / Linux WebKitGTK）
  //  下动态插入的 <style> 的 CSSOM 永不建立（sheet===null、规则不生效、不可恢复，
  //  与插入时机无关）；adoptedStyleSheets 通道正常（2026-08-22 style-probe 实测）。
  //  本 shim 观察文档内 <style> 插入/更新，确认其 CSSOM 死亡后镜像到
  //  adoptedStyleSheets；正常环境（sheet 建立）不接管，双通道零影响。
  const styleAdoptShim = `<script>
(function () {
  if (typeof CSSStyleSheet === 'undefined' || !('adoptedStyleSheets' in document)) return;
  var mirror = new Map();  // style 元素 -> CSSStyleSheet
  var retry = new Map();   // style 元素 -> 已尝试次数
  var disabledIntent = new WeakMap(); // style 元素 -> 期望 disabled（见下方原型包裹）
  function isDisabled(el) {
    return disabledIntent.has(el) ? disabledIntent.get(el) : !!el.disabled;
  }
  // 规范陷阱：style.disabled 的 getter/setter 代理关联样式表的 disabled —— sheet 为
  // null（本协议下的常态）时读恒为 false、写为 no-op，MarkEdit 的特性开关（如
  // Typewriter Mode 的 50vh padding）会完全失效。此处包裹原型属性记录“意图值”，
  // 使开关语义恢复（shim 先于 CoreEditor 加载，覆盖全部调用方）。
  try {
    var proto = HTMLStyleElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'disabled');
    if (desc && desc.get && desc.set) {
      Object.defineProperty(proto, 'disabled', {
        configurable: true,
        get: function () {
          return disabledIntent.has(this) ? disabledIntent.get(this) : desc.get.call(this);
        },
        set: function (v) {
          disabledIntent.set(this, !!v);
          try { desc.set.call(this, v); } catch (e) { /* sheet null 时 no-op */ }
          if (mirror.has(this)) syncAdopted();
        },
      });
    }
  } catch (e) { /* 原型不可改时退化为原生行为 */ }
  function syncAdopted() {
    var sheets = [];
    // 按 DOM 顺序收集镜像（保持级联相对顺序与文档一致）；disabled 样式不参与
    // （style.disabled 是 MarkEdit 的特性开关，如 Typewriter Mode 的 50vh padding）
    document.querySelectorAll('style').forEach(function (s) {
      var cs = mirror.get(s);
      if (cs && !isDisabled(s)) sheets.push(cs);
    });
    try { document.adoptedStyleSheets = sheets; } catch (e) { /* 不支持赋值 */ }
  }
  function adopt(el) {
    if (mirror.has(el) || !el.isConnected) return;
    try {
      var cs = new CSSStyleSheet();
      cs.replaceSync(el.textContent || '');
      mirror.set(el, cs);
      syncAdopted();
    } catch (e) { /* replaceSync 失败（如 @import）则放弃该样式 */ }
  }
  function update(el) {
    var cs = mirror.get(el);
    if (!cs) return;
    try { cs.replaceSync(el.textContent || ''); } catch (e) { /* noop */ }
  }
  function check(el) {
    if (!el.isConnected) { mirror.delete(el); retry.delete(el); syncAdopted(); return; }
    if (el.sheet !== null) { retry.delete(el); return; } // 正常环境：CSSOM 已建立，不接管
    var n = (retry.get(el) || 0) + 1;
    retry.set(el, n);
    if (n <= 8) { setTimeout(function () { check(el); }, 40 + n * 20); return; }
    adopt(el); // 确认死亡（~1.5s 无 CSSOM）→ 镜像接管
  }
  function watch(el) {
    if (el.__adoptWatched) return;
    el.__adoptWatched = true;
    check(el);
  }
  var mo = new MutationObserver(function (muts) {
    var touched = false;
    muts.forEach(function (m) {
      m.addedNodes.forEach(function (n) {
        if (n.nodeName === 'STYLE') { watch(n); touched = true; }
        else if (n.nodeType === 1 && n.querySelectorAll) {
          n.querySelectorAll('style').forEach(function (s) { watch(s); touched = true; });
        }
      });
      m.removedNodes.forEach(function (n) {
        if (n.nodeName === 'STYLE' && mirror.has(n)) { mirror.delete(n); retry.delete(n); touched = true; }
        else if (n.nodeType === 1 && n.querySelectorAll) {
          n.querySelectorAll('style').forEach(function (s) {
            if (mirror.has(s)) { mirror.delete(s); retry.delete(s); touched = true; }
          });
        }
      });
      // textContent 变化（style-mod 运行时重写规则）
      var target = m.type === 'characterData' ? m.target.parentNode : m.target;
      if (target && target.nodeName === 'STYLE') { update(target); touched = true; }
      // disabled 属性变化（特性开关，如 Typewriter Mode）
      if (m.type === 'attributes' && m.target.nodeName === 'STYLE') touched = true;
    });
    if (touched) syncAdopted();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled'] });
  // 已存在的样式（如静态 HTML 内的）也检查
  document.querySelectorAll('style').forEach(watch);
})();
</script>`;

  // 3c. Tauri 适配器注入（desktop Adapter 层，editor-core 无 Tauri 知识）
  //     styleAdoptShim 必须最先注入（观察后续所有 <style> 插入）
  out = out.replace('</head>', `${styleAdoptShim}\n${tauriBridgeAdapter}\n${keyForwarder}\n${wheelForwarder}\n</head>`);

  // 4. 引擎 loader（放在 body 尾部，CoreEditor bundle script 之后）
  out = out.replace('</body>', `${engineLoader}\n</body>`);

  // 5. WebKit 竞态防护：CoreEditor 的 642KB inline module script 使 iframe 主文档
  //    长期处于 parsing/pending 状态；tauri:// WKURLSchemeHandler 下，此窗口内
  //    注入的动态 <style> 的 CSSOM 建立会被永久丢弃（sheet === null，且此后
  //    新插入的 style 也不再获得 CSSOM，不可恢复）→ 大文档白屏（2026-08-22
  //    j17 排查：主窗口样式正常、仅 iframe 死亡、render0 显示 dispatch 前已死）。
  //    外部化后主文档体积极小、parsing 瞬时 complete，动态样式注入发生在
  //    文档稳定期（module defer 语义保序，行为不变）。
  const moduleMatch = out.match(/<script type="module" crossorigin>([\s\S]*?)<\/script>/);
  if (moduleMatch && moduleMatch[1].length > 100_000) {
    writeFileSync(resolve(targetDir, coreMainName), moduleMatch[1], 'utf8');
    out = out.replace(moduleMatch[0], `<script type="module" crossorigin src="./${coreMainName}"></script>`);
    console.log(`core-main extracted: ${coreMainName} (${moduleMatch[1].length} bytes)`);
  }

  // V6-P0：清理旧版本资产（engine-* / core-main-*.js），frontendDist 只打包当前版本
  for (const name of readdirSync(targetDir)) {
    if (name === 'index.html' || name === coreMainName || name === engineDirName) continue;
    if (name.startsWith('engine') || /^core-main.*\.js$/.test(name)) {
      rmSync(resolve(targetDir, name), { recursive: true, force: true });
    }
  }

  mkdirSync(targetDir, { recursive: true });
  writeFileSync(target, out, 'utf8');
  console.log(`editor bundle written: ${target} (${out.length} bytes)`);
}

copyEngine();
build();
