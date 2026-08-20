#!/bin/bash
# Mellow QuickLook appex 构建（B4 / PRD §82）：
#   1. swiftc 编译 PreviewViewController（Quartz QLPreviewingController + WebKit WKWebView）；
#   2. 组装 qlmarkdown.appex（MacOS/qlmarkdown + Info.plist + Resources/quicklook.html）；
#   3. 可选：嵌入目标 .app 的 Contents/PlugIns/（参数 1 = .app 路径）。
# 依赖：Xcode 工具链（swiftc）；quicklook.html 由 build-quicklook-bundle.mjs 预生成。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/quicklook"
BUILD="$SRC/build"
APPEX="$BUILD/qlmarkdown.appex"
TARGET_APP="${1:-}"

# 0. 前置检查
if [ ! -f "$SRC/Resources/quicklook.html" ]; then
  echo "error: quicklook/Resources/quicklook.html 缺失，先运行: node apps/desktop/scripts/build-quicklook-bundle.mjs" >&2
  exit 1
fi
command -v swiftc >/dev/null || { echo "error: swiftc not found（需 Xcode 工具链）" >&2; exit 1; }

# 1. 编译（appex 主类：NSViewController 子类；链接 Quartz/WebKit）
rm -rf "$BUILD"
mkdir -p "$APPEX/Contents/MacOS" "$APPEX/Contents/Resources"
swiftc \
  -target "$(uname -m)-apple-macos13.0" \
  -framework Cocoa -framework Quartz -framework WebKit \
  -o "$APPEX/Contents/MacOS/qlmarkdown" \
  "$SRC/Sources/PreviewViewController.swift"

# 2. 组装 bundle
cp "$SRC/Info.plist" "$APPEX/Contents/Info.plist"
cp "$SRC/Resources/quicklook.html" "$APPEX/Contents/Resources/quicklook.html"
codesign --force --sign - --timestamp=none "$APPEX" >/dev/null 2>&1 || true

echo "appex built: $APPEX"

# 3. 嵌入 .app（Contents/PlugIns/；macOS QuickLook 扫描宿主 app 的 PlugIns）
if [ -n "$TARGET_APP" ] && [ -d "$TARGET_APP" ]; then
  PLUGINS_DIR="$TARGET_APP/Contents/PlugIns"
  mkdir -p "$PLUGINS_DIR"
  rm -rf "$PLUGINS_DIR/qlmarkdown.appex"
  cp -R "$APPEX" "$PLUGINS_DIR/qlmarkdown.appex"
  # 重签宿主（嵌入后 invalidate 签名；ad-hoc 本地验证）
  codesign --force --sign - --deep --timestamp=none "$TARGET_APP" >/dev/null 2>&1 || true
  echo "embedded into: $PLUGINS_DIR/qlmarkdown.appex"
fi
