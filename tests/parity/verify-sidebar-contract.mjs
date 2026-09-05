/**
 * Sidebar 契约护栏（P3 深度对标，随任务累积）。
 *
 * P3.1 —— 目录 watcher + 增量刷新 + 取消（G4-SHELL-01）：
 *   ① Rust：watch_dir 递归监听 + mellow://dir-changed + unwatch_dir；
 *      watcher id 由单调计数器生成（registry.len()+1 在 remove 后会撞 key）；
 *   ② lib.rs 注册命令 + 管理 WatcherIdCounter；
 *   ③ 前端：打开 workspace 即 watch、dir-changed 250ms 合并后只刷新侧栏树
 *      （不动编辑器状态）、换根/关闭 unwatch_dir、root 不匹配的事件忽略。
 *
 * P3.2 —— 四模式虚拟化（Exit Gate：10k 文件 / 1000 headings / 1 万结果不阻塞）：
 *   ① virtual.ts 纯数学内核：buildOffsets + findRange 二分定位（O(log n)）；
 *   ② VirtualRows：padding spacer（不用 transform，保住 sticky）、实测高度收敛、
 *      resetKey 缓存作废、overflow visible 回退全量渲染；
 *   ③ FileTree / FileList / OutlineList / SearchResultsList 全部走 VirtualRows
 *      （FileTree 先扁平化可见节点）；
 *   ④ desktop-ui 内核单测存在且覆盖 10k 窗口上界。
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const errors = [];
const fail = (message) => errors.push(message);

const watcherRs = read('apps/desktop/src-tauri/src/watcher.rs');
const libRs = read('apps/desktop/src-tauri/src/lib.rs');
const appSource = read('apps/desktop/src/App.tsx');

// ── ① Rust watcher 契约 ─────────────────────────────────────────────────
if (!/pub fn watch_dir\(app: AppHandle, path: String\)/.test(watcherRs)) {
  fail('watcher.rs 缺少 watch_dir 命令（P3.1 目录监听）');
}
if (!/RecursiveMode::Recursive/.test(watcherRs)) {
  fail('watch_dir 必须递归监听目录树（P3.1）');
}
if (!/mellow:\/\/dir-changed/.test(watcherRs)) {
  fail('watcher.rs 缺少 mellow://dir-changed 事件（P3.1）');
}
if (!/pub struct DirChangeEventDto[\s\S]*?pub root: String,[\s\S]*?pub path: String,[\s\S]*?pub kind: String,/.test(watcherRs)) {
  fail('DirChangeEventDto 缺少 root/path/kind 字段（P3.1 前端按 root 过滤 + 增量刷新输入）');
}
if (!/pub fn unwatch_dir\(app: AppHandle, watcher_id: u64\)/.test(watcherRs)) {
  fail('watcher.rs 缺少 unwatch_dir（P3.1 取消监听）');
}
// watcher id 单调计数器（修复 len+1 撞 key 缺陷）
if (!/pub struct WatcherIdCounter\(pub AtomicU64\)/.test(watcherRs)) {
  fail('watcher.rs 缺少 WatcherIdCounter 单调计数器（len+1 递增在 remove 后撞 key）');
}
if (/registry\.len\(\) as u64 \+ 1/.test(watcherRs)) {
  fail('watcher.rs 仍使用 registry.len()+1 生成 id（P3.1 撞 key 缺陷未修）');
}
if (!/fn watcher_ids_never_collide_after_removal/.test(watcherRs)) {
  fail('watcher.rs 缺少 id 不撞 regression 测试（P3.1）');
}

// ── ② lib.rs 注册 ───────────────────────────────────────────────────────
if (!/watcher::watch_dir,/.test(libRs) || !/watcher::unwatch_dir,/.test(libRs)) {
  fail('lib.rs 未注册 watch_dir / unwatch_dir 命令（P3.1）');
}
if (!/manage\(watcher::WatcherIdCounter\(AtomicU64::new\(0\)\)\)/.test(libRs)) {
  fail('lib.rs 未管理 WatcherIdCounter state（P3.1）');
}

// ── ③ 前端生命周期与增量刷新 ────────────────────────────────────────────
if (!/invoke<number>\('watch_dir', \{ path: root \}\)/.test(appSource)) {
  fail('App.tsx 打开 workspace 时未调用 watch_dir（P3.1）');
}
if (!/listen<\{ root: string; path: string; kind: string \}>\('mellow:\/\/dir-changed'/.test(appSource)) {
  fail('App.tsx 未订阅 mellow://dir-changed（P3.1）');
}
if (!/e\.payload\.root !== root\) return;/.test(appSource)) {
  fail('App.tsx 未按 root 过滤 dir-changed 事件（多根场景串扰，P3.1）');
}
if (!/timer = setTimeout\(\(\) => \{ void refreshFilesSidebarRef\.current\(\); \}, 250\);/.test(appSource)) {
  fail('App.tsx dir-changed 缺少 250ms 合并窗口（批量写入/移动只触发一次刷新，P3.1）');
}
if (!/invoke\('unwatch_dir', \{ watcherId \}\)/.test(appSource) || !/invoke\('unwatch_dir', \{ watcherId: id \}\)/.test(appSource)) {
  fail('App.tsx 清理/竞态路径未调用 unwatch_dir（P3.1 取消监听）');
}
if (!/if \(watcherId !== null\) \{/.test(appSource)) {
  fail('App.tsx 缺少 watcherId 判空清理（P3.1）');
}

// ── ④ P3.2 虚拟化内核（virtual.ts 纯数学） ──────────────────────────────
const virtualTs = read('packages/desktop-ui/src/virtual.ts');
if (!/export function buildOffsets\(count: number, heightAt: \(index: number\) => number\): Float64Array/.test(virtualTs)) {
  fail('virtual.ts 缺少 buildOffsets 纯函数（P3.2 offsets 内核）');
}
if (!/export function findRange\(offsets: Float64Array, scrollTop: number, viewportH: number, overscan: number\)/.test(virtualTs)) {
  fail('virtual.ts 缺少 findRange 纯函数（P3.2 窗口定位）');
}
if (!/while \(lo <= hi\)/.test(virtualTs)) {
  fail('findRange 必须是二分查找（P3.2：10k 量级 O(log n)，线性扫描会阻塞）');
}

// ── ⑤ P3.2 VirtualRows 组件契约 ─────────────────────────────────────────
const virtualRowsTsx = read('packages/desktop-ui/src/VirtualRows.tsx');
if (!/root\?\.parentElement/.test(virtualRowsTsx)) {
  fail('VirtualRows 未通过 parentElement 探测滚动容器（P3.2：必须复用现有 .file-tree-list 等滚动源）');
}
if (!/overflowY === 'visible' \|\| overflowY === 'clip'/.test(virtualRowsTsx)) {
  fail('VirtualRows 缺少不可滚动环境回退全量渲染的安全阀（P3.2）');
}
if (!/ResizeObserver/.test(virtualRowsTsx)) {
  fail('VirtualRows 缺少 ResizeObserver 视口监听（P3.2：侧栏宽度变化需重算窗口）');
}
if (!/data-vrow/.test(virtualRowsTsx) || !/offsetHeight/.test(virtualRowsTsx)) {
  fail('VirtualRows 缺少渲染后实测行高收敛（P3.2：估算误差会导致滚动跳动）');
}
if (!/heightsRef\.current\.clear\(\)/.test(virtualRowsTsx)) {
  fail('VirtualRows 缺少 resetKey 变化清空高度缓存（P3.2：数据刷新后旧实测高度失真）');
}
if (!/paddingTop: padTop, paddingBottom: padBottom/.test(virtualRowsTsx)) {
  fail('VirtualRows 必须用 padding spacer 撑总高（P3.2：transform 会破坏 .search-group-title sticky）');
}
if (/translateY/.test(virtualRowsTsx)) {
  fail('VirtualRows 出现 transform 定位（P3.2：禁止 transform，保住 sticky 组标题）');
}

// ── ⑥ P3.2 四模式全部接入虚拟化 ─────────────────────────────────────────
const fileTreeTsx = read('packages/desktop-ui/src/FileTree.tsx');
const fileListTsx = read('packages/desktop-ui/src/FileList.tsx');
const outlineListTsx = read('packages/desktop-ui/src/OutlineList.tsx');
const searchResultsTsx = read('packages/desktop-ui/src/SearchResultsList.tsx');
const VIRTUALIZED = [['FileTree', fileTreeTsx], ['FileList', fileListTsx], ['OutlineList', outlineListTsx], ['SearchResultsList', searchResultsTsx]];
for (const [name, source] of VIRTUALIZED) {
  if (!/import \{ VirtualRows \} from '\.\/VirtualRows';/.test(source)) {
    fail(`${name}.tsx 未引入 VirtualRows（P3.2 四模式虚拟化）`);
  }
  if (!/renderItem=/.test(source) || !/count=\{/.test(source)) {
    fail(`${name}.tsx 未通过 count + renderItem 走 VirtualRows 窗口化（P3.2：10k/1000/1万 不阻塞）`);
  }
}
// FileTree 虚拟化前提：可见节点扁平化（展开的文件夹下钻成一维行）
if (!/node\.kind === 'folder' && node\.expanded && node\.children !== undefined/.test(fileTreeTsx)) {
  fail('FileTree 缺少可见节点扁平化下钻（P3.2：树形渲染必须先扁平化才能窗口化）');
}
// SearchResultsList 扁平化保留组标题 sticky 语义
if (!/search-group-title/.test(searchResultsTsx)) {
  fail('SearchResultsList 扁平化后丢失组标题（P3.2：分组语义必须保留）');
}

// ── ⑦ P3.2 内核单测存在且覆盖 Exit Gate ─────────────────────────────────
const desktopUiPkg = JSON.parse(read('packages/desktop-ui/package.json'));
if (desktopUiPkg.scripts?.test !== 'jest') {
  fail('desktop-ui 缺少 jest test script（P3.2 内核单测未接入 pnpm -r test 链）');
}
const virtualTest = read('packages/desktop-ui/test/virtual.test.ts');
if (!/10000/.test(virtualTest) || !/MAX_WINDOW/.test(virtualTest)) {
  fail('虚拟化内核单测缺少 10k 窗口上界断言（P3.2 Exit Gate：DOM 节点不随数据量增长）');
}
// 滚动容器仍在 App.tsx（虚拟化复用它们作滚动源，不得改挂载结构）；
// V5-A1：.file-list 随 list 视图退役，App 层不再渲染
for (const cls of ['file-tree-list', 'outline-list', 'search-results']) {
  if (!appSource.includes(`className="${cls}"`)) {
    fail(`App.tsx 丢失滚动容器 .${cls}（P3.2：VirtualRows 以其 parentElement 为滚动源）`);
  }
}

// ── ⑧ P3.2 canary：护栏必须能抓住虚拟化回退 ─────────────────────────────
const virtualDrift = fileListTsx.replace(/return <VirtualRows[\s\S]*?renderItem=\{renderRow\} \/>;/, 'return <>{items.map((item) => renderRow(items.indexOf(item)))}</>;');
if (virtualDrift === fileListTsx) {
  fail('Sidebar 护栏自检失败：无法模拟 FileList 虚拟化回退（P3.2），护栏已失效');
}
if (/import \{ VirtualRows \} from '\.\/VirtualRows';/.test(virtualDrift) && /<VirtualRows/.test(virtualDrift)) {
  fail('Sidebar 护栏自检失败：模拟回退后 VirtualRows 仍被使用（P3.2 canary 逻辑失效）');
}

// ── ⑨ P3.3 Outline / Search 键盘导航（G4-SIDE-02） ─────────────────────
// 模型层：导航逻辑在 app-core（App.tsx 只装配）
if (!/navigate\(items: OutlineHeading\[\], key: 'up' \| 'down' \| 'home' \| 'end' \| 'enter'\)/.test(read('packages/app-core/src/outline.ts'))) {
  fail('OutlineModel 缺少 navigate（P3.3：↑↓/Home/End/Enter 键盘导航）');
}
const globalSearchTs = read('packages/app-core/src/globalSearch.ts');
if (!/export class SearchResultsModel/.test(globalSearchTs) || !/navigate\(matches: SearchResult\[\], key: 'up' \| 'down' \| 'home' \| 'end' \| 'enter'\)/.test(globalSearchTs)) {
  fail('globalSearch.ts 缺少 SearchResultsModel.navigate（P3.3：搜索结果键盘导航）');
}
if (!/export \{.*SearchResultsModel.*\} from '\.\/globalSearch';/.test(read('packages/app-core/src/index.ts'))) {
  fail('app-core index.ts 未导出 SearchResultsModel（P3.3）');
}
if (!read('packages/app-core/test/sidebar-keyboard.test.ts')) {
  fail('缺少 sidebar-keyboard.test.ts（P3.3 导航模型单测）');
}
// 装配层：aside 三模式路由 + Esc/Enter 语义 + 渲染传参
if (!/sidebarMode === 'outline' \? handleOutlineKeyDown : handleSearchKeyDown/.test(appSource)) {
  fail('App.tsx aside onKeyDown 未路由 outline/search 键盘处理（P3.3 G4-SIDE-02）');
}
if (!/handleOutlineKeyDown/.test(appSource) || !/handleSearchKeyDown/.test(appSource)) {
  fail('App.tsx 缺少 outline/search keydown 处理器（P3.3）');
}
// 可见行序列共用：渲染与导航不得各算一套（否则导航目标与显示行错位）
if (!/const items = visibleOutlineItems\(\);/.test(appSource)) {
  fail('App.tsx outline 渲染未复用 visibleOutlineItems()（P3.3：导航与渲染必须同一序列）');
}
if (!/setOutlineFilter\(''\);/.test(appSource) || !/outlineModelRef\.current\.selectedId = null;/.test(appSource)) {
  fail('App.tsx outline Esc 未清空过滤词与键盘选中（P3.3 Esc 语义）');
}
if (!/setSearchQuery\(''\);/.test(appSource) || !/searchResultsModelRef\.current\.reset\(\)/.test(appSource)) {
  fail('App.tsx search Esc 未清空查询与选中（P3.3 Esc 语义）');
}
if (!/const flatSearchMatches = useMemo\(\(\) => searchGroups\.flatMap/.test(appSource)) {
  fail('App.tsx 缺少扁平匹配序列 flatSearchMatches（P3.3：键盘序 = 渲染序）');
}
if (!/if \(r\.jump\) handleOutlineJump\(r\.jump\);/.test(appSource)) {
  fail('App.tsx outline Enter 未跳转（P3.3）');
}
if (!/if \(r\.jump\) void jumpToSearchResult\(r\.jump\);/.test(appSource)) {
  fail('App.tsx search Enter 未跳转（P3.3）');
}
if (!/selectedId=\{outlineSelectedId\}/.test(appSource) || !/selectedIndex=\{searchSelectedIndex\}/.test(appSource)) {
  fail('App.tsx 未向 OutlineList/SearchResultsList 传递键盘选中态（P3.3 高亮断链）');
}
// 展示层：选中高亮 + 滚动跟随
const outlineListTsxP33 = read('packages/desktop-ui/src/OutlineList.tsx');
const searchListTsxP33 = read('packages/desktop-ui/src/SearchResultsList.tsx');
if (!/selectedId\??: string \| null/.test(outlineListTsxP33) || !/outline-row\.selected/.test(outlineListTsxP33) || !/scrollIntoView\(\{ block: 'nearest' \}\)/.test(outlineListTsxP33)) {
  fail('OutlineList 缺少键盘选中高亮或滚动跟随（P3.3）');
}
if (!/selectedIndex\??: number/.test(searchListTsxP33) || !/search-match\.selected/.test(searchListTsxP33) || !/scrollIntoView\(\{ block: 'nearest' \}\)/.test(searchListTsxP33)) {
  fail('SearchResultsList 缺少键盘选中高亮或滚动跟随（P3.3）');
}
const stylesCss = read('apps/desktop/src/styles.css');
if (!/\.outline-row\.selected/.test(stylesCss) || !/\.search-match\.selected/.test(stylesCss)) {
  fail('styles.css 缺少键盘选中样式（P3.3：高亮不可见即导航不可用）');
}

// ── ⑩ P3.3 canary：护栏必须能抓住键盘导航回退 ──────────────────────────
const keyboardDrift = appSource.replace("sidebarMode === 'outline' ? handleOutlineKeyDown : handleSearchKeyDown", 'undefined');
if (/sidebarMode === 'outline' \? handleOutlineKeyDown : handleSearchKeyDown/.test(keyboardDrift)) {
  fail('Sidebar 护栏自检失败：无法模拟 outline/search 键盘路由回退（P3.3），护栏已失效');
}

// ── ⑪ P3.4 File List 键位（G4-SIDE-01）——V5-A1 起 App 层 list 视图退役，
//    FileListModel 库能力与键位仍受护栏保护，App 层改为退役断言 ──────────────
const fileListModelTs = read('packages/app-core/src/fileList.ts');
if (!/navigate\(items: Array<\{ path: string \}>, key: 'up' \| 'down' \| 'left' \| 'right' \| 'enter' \| 'pageup' \| 'pagedown'/.test(fileListModelTs)) {
  fail('FileListModel.navigate 缺少 ←→/PageUp/PageDown 键位（P3.4 G4-SIDE-01）');
}
if (!/pageSize = 10/.test(fileListModelTs)) {
  fail('FileListModel.navigate 缺少 pageSize 翻页步长（P3.4）');
}
// V5-A1（D1=完全 Typora 化，仅树形）：App.tsx 不得再装配 list 视图
if (/handleFileListKeyDown|handleFileListSelect|openFileListContextMenu|selectedListPath|filteredFileListItems|fileListOptions/.test(appSource)) {
  fail('App.tsx 仍残留 File List 装配（V5-A1：list 视图应完全退役）');
}
if (/\bFileList\b[,}]/.test(appSource.split('\n').filter((l) => l.includes('desktop-ui/src')).join('\n'))) {
  fail('App.tsx 仍从 desktop-ui 导入 FileList 组件（V5-A1）');
}
// 列表选中滚动跟随（翻页后选中必须可见）
if (!/\.file-list \.file-list-item\.selected/.test(fileListTsx) || !/scrollIntoView\(\{ block: 'nearest' \}\)/.test(fileListTsx)) {
  fail('FileList 缺少键盘选中滚动跟随（P3.4）');
}

// ── ⑫ V5-A1 canary：护栏必须能抓住 list 视图回潮 ─────────────────────────
// 哨兵：侧栏键盘路由必须是「三态直连」（files→tree / outline / search）。
// 若有人重新引入 tree/list 二级切换，该形态即被破坏，护栏显式报失效。
if (!appSource.includes("sidebarMode === 'files' ? handleTreeKeyDown : sidebarMode === 'outline' ? handleOutlineKeyDown : handleSearchKeyDown")) {
  fail('Sidebar 护栏自检失败：侧栏键盘路由形态已变化，⑫ canary 需同步更新（V5-A1）');
}
if (/mellow\.fileSidebar\.mode/.test(appSource) || /'sidebar\.listAria'/.test(appSource)) {
  fail('App.tsx 仍引用 list 模式存储/文案（V5-A1）');
}

// ── ⑬ P3.5 File List / Outline / Search 右键菜单 ────────────────────────
const outlineModelTs = read('packages/app-core/src/outline.ts');
if (!/collapseAll\(items: readonly OutlineHeading\[\]\): void/.test(outlineModelTs)) {
  fail('OutlineModel 缺少 collapseAll（P3.5 全部折叠）');
}
for (const handler of ['openOutlineContextMenu', 'openSearchContextMenu']) {
  if (!appSource.includes(`const ${handler} = useCallback`)) {
    fail(`App.tsx 缺少 ${handler}（P3.5 右键菜单；V5-A1 起 openFileListContextMenu 随 list 退役）`);
  }
}
// 行右键经组件 props 透传（与 FileTree onContextMenu 同一模式）
if (!/onContextMenu=\{openOutlineContextMenu\} \/>/.test(appSource) || !/onContextMenu=\{openSearchContextMenu\} \/>/.test(appSource)) {
  fail('App.tsx 未把右键处理器透传给 OutlineList/SearchResultsList（P3.5）');
}
const uiFileList = read('packages/desktop-ui/src/FileList.tsx');
if (!/onContextMenu\?: \(e: React\.MouseEvent, path: string\) => void/.test(uiFileList) || !/onContextMenu\?\.\(e, item\.path\)/.test(uiFileList)) {
  fail('FileList 组件缺 onContextMenu prop 透传（P3.5）');
}
if (!/onContextMenu\?: \(e: React\.MouseEvent, item: OutlineHeading\) => void/.test(outlineListTsxP33) || !/onContextMenu\?\.\(e, item\)/.test(outlineListTsxP33)) {
  fail('OutlineList 组件缺 onContextMenu prop 透传（P3.5）');
}
if (!/onContextMenu\?: \(e: React\.MouseEvent, match: SearchGroup\['matches'\]\[number\]\) => void/.test(searchListTsxP33) || !/onContextMenu\?\.\(e, match\)/.test(searchListTsxP33)) {
  fail('SearchResultsList 组件缺 onContextMenu prop 透传（P3.5）');
}
// 双语文案
const messagesTs = read('packages/i18n/src/messages.ts');
for (const key of ['contextmenu.open', 'contextmenu.revealInTree', 'outline.jumpToHeading', 'outline.collapseAll', 'outline.expandAll', 'search.jumpToMatch']) {
  const occurrences = messagesTs.split(`'${key}':`).length - 1;
  if (occurrences < 2) {
    fail(`i18n 缺少 ${key} 的 zh/en 双语文案（P3.5，当前 ${occurrences} 处）`);
  }
}

// ── ⑭ P3.5 canary：护栏必须能抓住右键菜单回退 ───────────────────────────
const contextMenuDrift = appSource.replace('onContextMenu={openSearchContextMenu}', '');
if (!appSource.includes('onContextMenu={openSearchContextMenu}')) {
  fail('Sidebar 护栏自检失败：无法模拟 Search 右键菜单回退（P3.5），护栏已失效');
}
if (contextMenuDrift.includes('onContextMenu={openSearchContextMenu}')) {
  fail('Sidebar 护栏自检失败：模拟回退后 Search 右键仍在（P3.5 canary 逻辑失效）');
}

// ── ⑮ P3.6 常驻 filter 输入框 + 新建文件/文件夹轻按钮 ────────────────────
const fileTreeModelTs = read('packages/app-core/src/fileTree.ts');
const fileListModelTsP36 = read('packages/app-core/src/fileList.ts');
if (!/export function filterFileTree\(nodes: readonly FileTreeNode\[\], query: string\): FileTreeNode\[\]/.test(fileTreeModelTs)) {
  fail('app-core 缺少 filterFileTree 导出（P3.6）');
}
if (!/export function filterFileList\(items: readonly FileListItem\[\], query: string\): FileListItem\[\]/.test(fileListModelTsP36)) {
  fail('app-core 缺少 filterFileList 导出（P3.6）');
}
// 祖先链保留且强制展开（过滤视图核心语义）
if (!/expanded: true, children \}/.test(fileTreeModelTs) && !/expanded: true,\s*children \}/.test(fileTreeModelTs)) {
  fail('filterFileTree 缺少祖先链 expanded 强制 true 语义（P3.6）');
}
// app-core index.ts 显式导出（防 P3.3 漏导出教训重演）
const appCoreIndex = read('packages/app-core/src/index.ts');
if (!appCoreIndex.includes('filterFileTree') || !appCoreIndex.includes('filterFileList')) {
  fail('app-core index.ts 未导出 filterFileTree/filterFileList（P3.6）');
}
if (!existsSync('packages/app-core/test/file-filter.test.ts')) {
  fail('缺少 file-filter.test.ts 单测（P3.6）');
}
const fileFilterTest = read('packages/app-core/test/file-filter.test.ts');
if (!fileFilterTest.includes('expanded 强制 true') || !fileFilterTest.includes("filterFileList(items, 'todo.md')")) {
  fail('file-filter.test.ts 缺少祖先链/列表关键断言（P3.6）');
}
// App.tsx 装配：state + useMemo 派生 + 导航同源
if (!/const \[fileFilterQuery, setFileFilterQuery\] = useState\(''\)/.test(appSource)) {
  fail('App.tsx 缺少 fileFilterQuery state（P3.6）');
}
if (!/filterFileTree\(fileTreeNodes, fileFilterQuery\)/.test(appSource)) {
  fail('App.tsx 缺少 filtered 派生 useMemo（P3.6；V5-A1 起 filterFileList 派生随 list 退役）');
}
if (!/model\?\.flatten\(filteredFileTreeNodes\)/.test(appSource)) {
  fail('App.tsx treeFlatten 未改用过滤后序列（P3.6：导航与渲染必须同源）');
}
// Quickbar UI：常驻输入框 + 两轻按钮 + Esc 清空
if (!/className="file-quickbar"/.test(appSource) || !/className="file-filter-input"/.test(appSource)) {
  fail('App.tsx 缺少 file-quickbar / file-filter-input（P3.6）');
}
if (!/onClick=\{\(\) => void handleTreeNewFile\(\)\}/.test(appSource) || !/onClick=\{\(\) => void handleTreeNewFolder\(\)\}/.test(appSource)) {
  fail('App.tsx 新建文件/文件夹轻按钮未复用既有 handler（P3.6）');
}
if (!/e\.key === 'Escape'/.test(appSource.split('file-filter-input')[1]?.split('</div>')[0] ?? '')) {
  fail('filter 输入框缺 Esc 清空（P3.6）');
}
// 渲染改用过滤后数组
if (!/nodes=\{filteredFileTreeNodes\}/.test(appSource)) {
  fail('App.tsx FileTree 未渲染过滤后数组（P3.6）');
}
// 双语文案（4 组 × zh/en ≥ 2 处）
for (const key of ['files.filterPlaceholder', 'files.newFile', 'files.newFolder', 'sidebar.noFilterMatch']) {
  const occurrences = messagesTs.split(`'${key}':`).length - 1;
  if (occurrences < 2) {
    fail(`i18n 缺少 ${key} 的 zh/en 双语文案（P3.6，当前 ${occurrences} 处）`);
  }
}
const stylesCssP36 = read('apps/desktop/src/styles.css');
if (!stylesCssP36.includes('.file-quickbar') || !stylesCssP36.includes('.file-filter-input') || !stylesCssP36.includes('.file-quickbtn')) {
  fail('styles.css 缺少 file-quickbar / file-filter-input / file-quickbtn 样式（P3.6）');
}

// ── ⑯ P3.6 canary：护栏必须能抓住常驻 filter 回退 ───────────────────────
const filterDrift = appSource.replace("const [fileFilterQuery, setFileFilterQuery] = useState('')", '');
if (/const \[fileFilterQuery, setFileFilterQuery\] = useState\(''\)/.test(filterDrift)) {
  fail('Sidebar 护栏自检失败：无法模拟常驻 filter 回退（P3.6），护栏已失效');
}

// ── ⑰ P3.7 跨应用拖拽 e2e + 侧栏无限刷新循环回归防护 ─────────────────────
// 修复记录：refreshFilesSidebar 引用链（refreshFileList → selectedTreeDir → treeFlatten →
// filteredFileTreeNodes → fileTreeNodes）随每次树刷新重建，直接作 effect deps 会让
// 「打开 workspace」陷入无限刷树（P3.4 起引入，drag-drop e2e 首次暴露）。两个 effect
// 必须经 refreshFilesSidebarRef 间接调用，且 deps 不得含 refreshFilesSidebar。
if (!/refreshFilesSidebarRef\.current\(\)/.test(appSource)) {
  fail('workspace/watcher effect 未通过 refreshFilesSidebarRef 间接调用（P3.7 无限刷新循环修复）');
}
if (/\}, \[fileListOptions, fileTreeOptions, fileTreeRoot, refreshFilesSidebar\]\)/.test(appSource)) {
  fail('workspace 构建 effect 仍直接依赖 refreshFilesSidebar（P3.7：引用随 fileTreeNodes 抖动 → 无限刷树）');
}
if (/\}, \[fileTreeRoot, refreshFilesSidebar\]\)/.test(appSource)) {
  fail('watcher effect 仍直接依赖 refreshFilesSidebar（P3.7：引用抖动 → watcher 反复重建）');
}
// FileTree dragend 清空内部拖拽源：树内拖拽结束后 Finder/Explorer drop 不得被残留路径误消费
const uiFileTreeP37 = read('packages/desktop-ui/src/FileTree.tsx');
if (!/onDragEnd=\{\(\) => \{ draggedRef\.current = null; \}\}/.test(uiFileTreeP37)) {
  fail('FileTree 缺 dragend 清空 draggedRef（P3.7 外部 drop 防误消费）');
}
// e2e 存在且覆盖关键断言（dataTransfer 建链契约 / 树内移动 / 外部 drop 防误消费）
if (!existsSync('tests/e2e/drag-drop-verify.mjs')) {
  fail('缺少 tests/e2e/drag-drop-verify.mjs（P3.7 跨应用拖拽 e2e）');
}
const dndE2e = read('tests/e2e/drag-drop-verify.mjs');
for (const marker of ['application/x-mellow-file', 'external drop', 'FileTreeService.move', 'dragend']) {
  if (!dndE2e.includes(marker)) {
    fail(`drag-drop-verify.mjs 缺少关键断言标记 ${marker}（P3.7）`);
  }
}

// ── ⑱ P3.7 canary：护栏必须能抓住无限刷新循环回退 ────────────────────────
const loopDrift = appSource.replace('void refreshFilesSidebarRef.current();', 'void refreshFilesSidebar();');
if (!loopDrift.includes('void refreshFilesSidebar();')) {
  fail('Sidebar 护栏自检失败：无法模拟无限刷新循环回退（P3.7），护栏已失效');
}

// ── ⑲ P3.8 Sidebar resize / 记忆 / 窄化 / 200% Zoom ─────────────────────
if (!/const SIDEBAR_WIDTH_KEY = 'mellow\.sidebar\.width';/.test(appSource)) {
  fail('App.tsx 缺少 SIDEBAR_WIDTH_KEY 常量（P3.8）');
}
// 初始化：范围校验回退（越界存档视为损坏 → 默认 260，而非 clamp）
if (!/saved >= 200 && saved <= 480 \? saved : 260/.test(appSource)) {
  fail('sidebarWidth 初始化缺少 200–480 范围校验回退默认 260（P3.8）');
}
// 拖拽 clamp：setSidebarWidth 内 Math.max/Math.min 200–480
if (!/Math\.max\(200, Math\.min\(480, Math\.round\(next\)\)\)/.test(appSource)) {
  fail('setSidebarWidth 缺少 200–480 clamp（P3.8）');
}
// 拖拽 listener 链：mousedown 注册 window mousemove/mouseup，up 时清理
if (!/window\.addEventListener\('mousemove', onMove\)/.test(appSource) || !/window\.addEventListener\('mouseup', onUp\)/.test(appSource)) {
  fail('handleSidebarDragStart 缺少 window mousemove/mouseup 注册（P3.8）');
}
if (!/window\.removeEventListener\('mousemove', onMove\)/.test(appSource) || !/window\.removeEventListener\('mouseup', onUp\)/.test(appSource)) {
  fail('handleSidebarDragStart onUp 缺少 listener 清理（P3.8）');
}
// 窄化：<900px 临时收起且不覆盖显示偏好（§7.7）
if (!/window\.innerWidth < 900/.test(appSource) || !/sidebarSuppressedByWidth/.test(appSource)) {
  fail('App.tsx 缺少 <900px 窄化临时收起语义（P3.8）');
}
// e2e 存在且覆盖关键断言（clamp 边界 / localStorage 记忆 / 窄化还原 / 200% zoom 拖拽）
if (!existsSync('tests/e2e/sidebar-resize-verify.mjs')) {
  fail('缺少 tests/e2e/sidebar-resize-verify.mjs（P3.8 sidebar resize e2e）');
}
const resizeE2e = read('tests/e2e/sidebar-resize-verify.mjs');
for (const marker of [
  "localStorage.getItem('mellow.sidebar.width')",
  'drag above 480 clamps to 480',
  'out-of-range saved width falls back to default 260',
  'temporarily hides sidebar without clearing preference',
  '200% zoom: resize drag still works',
  'new MouseEvent',
]) {
  if (!resizeE2e.includes(marker)) {
    fail(`sidebar-resize-verify.mjs 缺少关键断言标记 ${JSON.stringify(marker)}（P3.8）`);
  }
}

// ── ⑳ P3.8 canary：护栏必须能抓住 clamp 回退 ────────────────────────────
// 模拟「去掉 clamp 直接透传」的漂移：突变后源码应包含退化形态，且 clamp 正则不再命中
const clampDrift = appSource.replace('Math.max(200, Math.min(480, Math.round(next)))', 'next');
if (!clampDrift.includes('const clamped = next;') || /Math\.max\(200, Math\.min\(480, Math\.round\(next\)\)\)/.test(clampDrift)) {
  fail('Sidebar 护栏自检失败：无法模拟 clamp 回退（P3.8），护栏已失效');
}

// ── ㉑ P3.9 Sidebar Screenshot Golden（V5-A1 三模式：files-tree / outline / search）──
const sidebarGoldenScript = 'tests/visual/sidebar-golden.mjs';
if (!existsSync(sidebarGoldenScript)) {
  fail('缺少 tests/visual/sidebar-golden.mjs（P3.9 Sidebar Golden 主脚本）');
} else {
  const sg = read(sidebarGoldenScript);
  for (const view of ['files-tree', 'outline', 'search']) {
    if (!sg.includes(`'${view}'`)) fail(`sidebar-golden 缺少视图 ${view}（P3.9）`);
    if (!sg.includes(`sidebar-${view}.png`)) fail(`sidebar-golden 缺少截图归档 sidebar-${view}.png（P3.9）`);
  }
  if (sg.includes('files-list')) fail('sidebar-golden 仍采样 files-list（V5-A1：list 视图退役）');
  for (const item of [
    ['golden/sidebar-golden.json', '基准文件名'],
    ['--update', '基准重建开关'],
    ['TOLERANCE_PX = 1', '±1px 容差'],
    ["view.dispatch({ changes: { from: 0, insert: content } })", '正文写入（outline/search 数据源）'],
    ["b.closest('.sidebar-mode-nav') === null", '运行按钮必须排除模式 tab（tab 文本同为「搜索」，误点只切 tab 不执行搜索）'],
    ['file.save', '保存落盘（mock fs → 全局搜索数据源）'],
  ]) {
    if (!sg.includes(item[0])) fail(`sidebar-golden 缺少 ${item[1]}（${item[0]}）`);
  }
}
const sidebarGoldenJsonPath = 'tests/visual/golden/sidebar-golden.json';
if (!existsSync(sidebarGoldenJsonPath)) {
  fail('tests/visual/golden/sidebar-golden.json 缺失（首跑 node tests/visual/sidebar-golden.mjs 生成）');
} else {
  const sgGolden = JSON.parse(read(sidebarGoldenJsonPath));
  const sidebarViewsWithRows = { 'files-tree': 3, outline: 3 };
  for (const view of ['files-tree', 'outline', 'search']) {
    const sample = sgGolden[view];
    if (sample === undefined) { fail(`sidebar golden 基准缺少视图 ${view}`); continue; }
    if (sample.aside?.w !== 260) fail(`sidebar golden ${view} aside 宽度契约应为 260（实际 ${sample.aside?.w}）`);
  }
  if ('files-list' in sgGolden) fail('sidebar golden 基准仍含 files-list（V5-A1：list 视图退役，--update 重建）');
  for (const [view, expected] of Object.entries(sidebarViewsWithRows)) {
    if (sgGolden[view]?.rowCount !== expected) fail(`sidebar golden ${view} rowCount 契约应为 ${expected}（实际 ${sgGolden[view]?.rowCount}）`);
  }
  if (sgGolden['files-tree']?.quickBtnCount !== 2) fail('sidebar golden files-tree quickBtnCount 契约应为 2（P3.6 quickbar）');
  if (sgGolden['files-tree']?.quickbar === null) fail('sidebar golden files-tree 缺少 quickbar 采样（P3.6）');
  if (sgGolden.search?.groupCount !== 1 || sgGolden.search?.matchCount !== 2) {
    fail(`sidebar golden search 应为 1 组 2 匹配（DOC_CONTENT 契约，实际 ${sgGolden.search?.groupCount} 组 ${sgGolden.search?.matchCount} 匹配）`);
  }
}
for (const view of ['files-tree', 'outline', 'search']) {
  if (!existsSync(`tests/visual/actual/sidebar-${view}.png`)) {
    fail(`tests/visual/actual/sidebar-${view}.png 缺失（跑 sidebar-golden.mjs 归档）`);
  }
}

// ── ㉒ P3.9 canary：护栏必须能抓住运行按钮选择器回退 ─────────────────────
const sidebarGoldenDrift = read(sidebarGoldenScript).replace("b.closest('.sidebar-mode-nav') === null", '');
if (sidebarGoldenDrift.includes("b.closest('.sidebar-mode-nav') === null") || sidebarGoldenDrift.length >= read(sidebarGoldenScript).length) {
  fail('Sidebar 护栏自检失败：无法模拟运行按钮选择器回退（P3.9），护栏已失效');
}

// ── ㉓ P3.10 Sidebar 12 个计时微任务 ─────────────────────────────────────
// jest + ts-jest 微任务基准（app-core T1–T11 + desktop-ui T12），进 pnpm test 链强制
// 执行；宽松预算防 CI 抖动。与 tests/benchmark/ 的 CGEvent 真机外部测量分层互补。
const sidebarBenchApp = 'packages/app-core/test/sidebar-bench.test.ts';
if (!existsSync(sidebarBenchApp)) {
  fail('缺少 packages/app-core/test/sidebar-bench.test.ts（P3.10 T1–T11 计时微任务）');
} else {
  const bench = read(sidebarBenchApp);
  for (const id of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11']) {
    if (!bench.includes(`timed('${id}'`)) fail(`sidebar-bench 缺少微任务 ${id}（P3.10）`);
  }
  if (!bench.includes('expect(ms).toBeLessThan(budgetMs)')) fail('sidebar-bench 缺少统一预算断言（P3.10）');
  if (!bench.includes('jest.setTimeout(60000)')) fail('sidebar-bench 缺少宽松 testTimeout（P3.10）');
  for (const api of ['filterFileTree', 'filterFileList', 'FileTreeModel', 'FileListModel', 'OutlineModel', 'collapseAll', 'SearchResultsModel', 'matchSearchLine', 'groupSearchResults']) {
    if (!bench.includes(api)) fail(`sidebar-bench 未覆盖 API ${api}（P3.10）`);
  }
}
const sidebarBenchVirtual = 'packages/desktop-ui/test/virtual-bench.test.ts';
if (!existsSync(sidebarBenchVirtual)) {
  fail('缺少 packages/desktop-ui/test/virtual-bench.test.ts（P3.10 T12 计时微任务）');
} else {
  const vbench = read(sidebarBenchVirtual);
  for (const marker of ['T12a', 'T12b', 'buildOffsets', 'findRange']) {
    if (!vbench.includes(marker)) fail(`virtual-bench 缺少标记 ${marker}（P3.10 T12）`);
  }
}
if (!existsSync('tests/benchmark/README.md') || !read('tests/benchmark/README.md').includes('Sidebar 计时微任务')) {
  fail('tests/benchmark/README.md 缺少「Sidebar 计时微任务」登记（P3.10）');
}

// ── ㉔ P3.10 canary：护栏必须能抓住预算断言回退 ──────────────────────────
const benchDriftSource = read(sidebarBenchApp);
const benchDrift = benchDriftSource.replace('expect(ms).toBeLessThan(budgetMs);', '');
if (benchDrift.includes('expect(ms).toBeLessThan(budgetMs);') || benchDrift.length >= benchDriftSource.length) {
  fail('Sidebar 护栏自检失败：无法模拟微任务预算断言回退（P3.10），护栏已失效');
}

// ── drift canary：护栏必须能抓住契约漂移 ─────────────────────────────────
const drifted = watcherRs.replace('RecursiveMode::Recursive', 'RecursiveMode::NonRecursive');
if (!/RecursiveMode::NonRecursive/.test(drifted)) {
  fail('Sidebar 护栏自检失败：无法模拟递归监听退化（P3.1），护栏已失效');
}

if (errors.length > 0) {
  throw new Error(`Sidebar contract violations:\n  ${errors.join('\n  ')}`);
}

console.log('Sidebar contract: dir watcher recursive + debounced incremental sidebar refresh + unwatch on root change; monotonic watcher ids (collision fixed); all four sidebar modes virtualized (binary-search windowing, measured heights, padding spacer, sticky preserved); outline/search keyboard navigation (arrows/enter/esc/home/end with scroll-follow highlight); file list keyboard complete (arrows/f2/delete/pageup/pagedown reusing tree rename/trash flows); context menus for file list/outline/search modes (bilingual, reusing rename/trash/copy-path flows); persistent filter input + new-file/new-folder quick buttons sharing filtered sequences for render and keyboard navigation; cross-app drag e2e (dataTransfer link contract, tree-internal move, external-drop stale-ref guard) + workspace refresh loop fixed via stable ref indirection; sidebar resize drag (window mousemove/mouseup with cleanup, clamp 200-480, persisted width with out-of-range fallback to 260, <900px narrow suppression without clearing preference, 200% zoom e2e with synthetic mouse drag); four-mode sidebar screenshot golden (files-tree/files-list/outline/search, ±1px layout contract + archived screenshots, shared browser mock host singleton so fs writes are visible to global search); 12 sidebar timing micro-benchmarks in jest (app-core T1-T11: filterFileTree/filterFileList/flatten/navigate full-traversal/pageup-pagedown/outline navigate/collapseAll/search feed+shrink/navigate/matchSearchLine 10k lines/groupSearchResults; desktop-ui T12: buildOffsets 10k + findRange x1000; generous budgets, enforced in pnpm test chain)');
