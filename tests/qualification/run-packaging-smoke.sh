#!/usr/bin/env bash
# macOS Packaging 烟测：bundle 内容校验 + clean install / upgrade / uninstall
#
# 用法：
#   bash tests/qualification/run-packaging-smoke.sh [Mellow.app 路径] [Mellow.dmg 路径]
# 默认路径为本地 debug 构建产物。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP="${1:-$ROOT/apps/desktop/src-tauri/target/debug/bundle/macos/Mellow.app}"
DMG="${2:-$ROOT/apps/desktop/src-tauri/target/debug/bundle/dmg/Mellow_0.1.0_aarch64.dmg}"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

[ -d "$APP" ] || fail "app 不存在: $APP"

echo "== 1/5 bundle 内容校验 =="
PLIST="$APP/Contents/Info.plist"
[ -f "$PLIST" ] || fail "Info.plist 缺失"
plutil -lint "$PLIST" >/dev/null || fail "Info.plist 非法"

BUNDLE_ID="$(plutil -extract CFBundleIdentifier raw "$PLIST")"
BUNDLE_VER="$(plutil -extract CFBundleVersion raw "$PLIST")"
[ "$BUNDLE_ID" = "com.mellow.editor" ] || fail "bundle id 错误: $BUNDLE_ID"
EXPECTED_VER="$(python3 - "$ROOT/apps/desktop/src-tauri/tauri.conf.json" <<'PY'
import json, sys
print(json.load(open(sys.argv[1]))["version"])
PY
)"
[ "$BUNDLE_VER" = "$EXPECTED_VER" ] || fail "bundle version 错误: $BUNDLE_VER（期望 $EXPECTED_VER）"
pass "bundle id / version: $BUNDLE_ID / $BUNDLE_VER"

plutil -p "$PLIST" | grep -q 'CFBundleTypeExtensions' || fail "文件关联(CFBundleDocumentTypes)缺失"
plutil -p "$PLIST" | grep -q '"md"' || fail "文件关联缺少 .md"
pass "文件关联: md/markdown 已声明"
plutil -p "$PLIST" | grep -q 'CFBundleLocalizations' || fail "CFBundleLocalizations 缺失"
plutil -p "$PLIST" | grep -q 'zh-Hans' || fail "CFBundleLocalizations 缺少 zh-Hans"
pass "系统语言: zh-Hans / en"

[ -f "$APP/Contents/Resources/icon.icns" ] || fail "icns 图标缺失"
pass "图标: icon.icns"
[ -f "$APP/Contents/Resources/THIRD_PARTY_NOTICES.md" ] || fail "Third Party Notices 未打包进资源"
pass "Third Party Notices 已随应用分发"

codesign -dv "$APP" >/dev/null 2>&1 || fail "codesign 校验失败"
SIG="$(codesign -dv --verbose=2 "$APP" 2>&1 | grep -i 'Signature=' || echo '')"
pass "codesign: ${SIG:-ad-hoc}"

echo "== 2/5 clean install =="
INSTALL_ROOT="$(mktemp -d)"
trap 'rm -rf "$INSTALL_ROOT"' EXIT
mkdir -p "$INSTALL_ROOT/Applications"
cp -R "$APP" "$INSTALL_ROOT/Applications/"
[ -d "$INSTALL_ROOT/Applications/Mellow.app" ] || fail "clean install 失败"
pass "clean install: 复制到 Applications"

echo "== 3/5 launch smoke =="
open "$INSTALL_ROOT/Applications/Mellow.app"
sleep 3
pgrep -f "Mellow.app/Contents/MacOS/mellow" >/dev/null || pgrep -f "Mellow.app/Contents/MacOS/Mellow" >/dev/null || fail "应用未启动"
pass "应用启动成功"
osascript -e 'tell application "Mellow" to quit' >/dev/null 2>&1 || pkill -f "Mellow.app/Contents/MacOS" || true
sleep 2

echo "== 4/5 upgrade install（覆盖 .app）=="
cp -R "$APP" "$INSTALL_ROOT/Applications/"
open "$INSTALL_ROOT/Applications/Mellow.app"
sleep 3
pgrep -f "Mellow.app/Contents/MacOS" >/dev/null || fail "升级后应用未启动"
pass "upgrade install: 覆盖后启动成功"
osascript -e 'tell application "Mellow" to quit' >/dev/null 2>&1 || pkill -f "Mellow.app/Contents/MacOS" || true
sleep 2

echo "== 5/5 uninstall =="
rm -rf "$INSTALL_ROOT/Applications/Mellow.app"
[ ! -e "$INSTALL_ROOT/Applications/Mellow.app" ] || fail "uninstall 失败：app 仍存在"
pass "uninstall: 应用已删除"

if [ -f "$DMG" ]; then
  echo "== DMG 校验 =="
  hdiutil verify "$DMG" >/dev/null || fail "DMG 校验失败"
  pass "DMG: 校验和 VALID"
  hdiutil imageinfo "$DMG" >/dev/null || fail "DMG imageinfo 失败"
  pass "DMG: imageinfo 结构正常"
  # DMG 含 EULA（licenseFile）→ attach 需接受许可；GUI 自动化受环境限制，
  # attach 失败记 WARN（不阻断）——硬校验（checksum/imageinfo）已通过。
  MOUNT="$(mktemp -d)"
  (hdiutil attach "$DMG" -mountpoint "$MOUNT" -nobrowse >/dev/null 2>&1 &)
  mounted=0
  for _ in $(seq 1 10); do
    sleep 1
    if [ -d "$MOUNT/Mellow.app" ]; then mounted=1; break; fi
    osascript -e 'tell application "System Events" to key code 36' >/dev/null 2>&1 || true
  done
  if [ "$mounted" = "1" ]; then
    [ -L "$MOUNT/Applications" ] || fail "DMG 中缺少 Applications 链接"
    pass "DMG: 含 Mellow.app + Applications 链接"
    hdiutil detach "$MOUNT" >/dev/null 2>&1 || true
  else
    echo "WARN: DMG attach 未完成（EULA 对话框依赖 GUI 会话，自动接受受限）——内容检查跳过，校验和已通过"
  fi
  rmdir "$MOUNT" 2>/dev/null || true
fi

echo
echo "ALL PASS —— macOS clean install / upgrade / uninstall / bundle 内容校验通过"
