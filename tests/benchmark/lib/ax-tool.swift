#!/usr/bin/env swift
/**
 * ax-tool — WKWebView 内容树的 AX 读写探针（⌘Q 脏门原生验收，审计 §4.358）。
 *
 * 背景（PITFALLS §4.474 沉淀）：AppleScript System Events 看不见 webview 内部树
 * （仅窗口级 8–9 元素），而应用内对话框（保存/放弃更改/取消）与编辑器正文都在
 * WKWebView 树里 ⇒ 必须走 AXUIElement API（§4.356 取证方法沉淀）。
 *
 * 用法：
 *   ax-tool windows                          列出进程窗口标题（含脏标记 ●）
 *   ax-tool textareas                        列出所有 AXTextArea 的 value（编辑器正文）
 *   ax-tool press <titleContains>            深度优先找 AXTitle 含串的可按压元素（按钮）→ AXPress
 *   ax-tool has <titleContains>              打印匹配计数（对话框存在性 / 去重判据）
 * 仅读 + 按压指定按钮，不做任何文件操作。
 */
import AppKit
import ApplicationServices
import Foundation

let args = CommandLine.arguments
guard args.count >= 2 else {
  FileHandle.standardError.write("usage: ax-tool <windows|textareas|press|has> [query] [--proc NAME]\n".data(using: .utf8)!)
  exit(2)
}
var proc = "mellow-desktop"
var positional: [String] = []
var i = 1
while i < args.count {
  if args[i] == "--proc" {
    guard i + 1 < args.count else { exit(2) }
    proc = args[i + 1]; i += 2; continue
  }
  positional.append(args[i]); i += 1
}
guard !positional.isEmpty else {
  FileHandle.standardError.write("usage: ax-tool <windows|textareas|press|has> [query] [--proc NAME]\n".data(using: .utf8)!)
  exit(2)
}
// 位置参数：positional[0]=子命令，positional[1]=query（若有）；--proc 单独覆盖进程名
let cmd = positional[0]
let query = positional.count > 1 ? positional[1] : ""

let appList = NSWorkspace.shared.runningApplications.filter { $0.localizedName == proc || $0.executableURL?.lastPathComponent == proc }
guard let app = appList.first else {
  FileHandle.standardError.write("process not running: \(proc)\n".data(using: .utf8)!)
  exit(1)
}
let appEl = AXUIElementCreateApplication(app.processIdentifier)

func copyAttr(_ el: AXUIElement, _ attr: String) -> CFTypeRef? {
  var v: CFTypeRef?
  return AXUIElementCopyAttributeValue(el, attr as CFString, &v) == .success ? v : nil
}
func str(_ el: AXUIElement, _ attr: String) -> String? {
  guard let v = copyAttr(el, attr) else { return nil }
  if let s = v as? String { return s }
  if let n = v as? NSNumber { return "\(n)" }
  return nil
}
func children(_ el: AXUIElement) -> [AXUIElement] {
  (copyAttr(el, kAXChildrenAttribute as String) as? [AXUIElement]) ?? []
}
func walk(_ el: AXUIElement, _ visit: (AXUIElement) -> Bool) {
  // visit 返回 true = 已找到，提前停止
  if visit(el) { return }
  for c in children(el) { walk(c, visit) }
}
var windows: [AXUIElement] { (copyAttr(appEl, kAXWindowsAttribute as String) as? [AXUIElement]) ?? [] }

switch cmd {
case "windows":
  for w in windows {
    print("WINDOW: \(str(w, kAXTitleAttribute as String) ?? "?")")
  }
  exit(0)
case "textareas":
  for w in windows {
    print("WINDOW: \(str(w, kAXTitleAttribute as String) ?? "?")")
    walk(w) { el in
      if str(el, kAXRoleAttribute as String) == "AXTextArea", let v = str(el, kAXValueAttribute as String) {
        let n = Int(ProcessInfo.processInfo.environment["AX_TOOL_LEN"] ?? "") ?? 2000
        print("  AREA: \(v.prefix(n))")
        return false
      }
      return false
    }
  }
  exit(0)
case "has":
  var n = 0
  for w in windows {
    walk(w) { el in
      if let t = str(el, kAXTitleAttribute as String), t.contains(query) { n += 1 }
      return false
    }
  }
  print("count=\(n)")
  exit(n > 0 ? 0 : 1)
case "press":
  var pressed = false
  outer: for w in windows {
    var stack: [AXUIElement] = [w]
    while let el = stack.popLast() {
      let title = str(el, kAXTitleAttribute as String) ?? ""
      let role = str(el, kAXRoleAttribute as String) ?? ""
      if title.contains(query), role == "AXButton" {
        if AXUIElementPerformAction(el, kAXPressAction as CFString) == .success {
          print("pressed: [\(role)] \(title)")
          pressed = true
          break outer
        }
      }
      stack.append(contentsOf: children(el))
    }
  }
  exit(pressed ? 0 : 1)
default:
  FileHandle.standardError.write("unknown cmd \(cmd)\n".data(using: .utf8)!)
  exit(2)
}
