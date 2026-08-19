#!/usr/bin/env swift
/**
 * ScreenTiming — Mellow Performance Benchmark 统一外部测量 helper
 * （performance-benchmark-spec §6）。
 *
 * 对 Mellow 与 Typora 使用完全相同的测量路径：
 *   CGEventPost 合成事件（键盘 / 滚动）
 *   + ScreenCaptureKit 捕获目标窗口 ROI
 *   + 像素变化检测（含光标闪烁自动校准）
 *
 * 时间基准：CACurrentMediaTime()（mach host clock）与
 * CMSampleBuffer presentationTimeStamp（host clock）同基准。
 *
 * 子命令：
 *   check                       权限自检（Accessibility + Screen Recording）
 *   window-list                 列出 on-screen 窗口（owner/pid/bounds/title）
 *   wait-window  --pid N --timeout T    等窗口出现，输出 bounds + elapsed ms
 *   startup-probe --pid N --roi x,y,w,h --timeout T
 *                               单键测量：post 'a' → ROI 首帧变化延迟（open-to-editable）
 *   keypress-latency --pid N --roi x,y,w,h --key K --count C --interval MS --timeout T
 *                               逐键测量延迟序列（含自动校准）
 *   scroll-frames --pid N --roi x,y,w,h --count C --delta D --interval MS --timeout T
 *                               滚动期间帧时间戳序列（runner 计算帧间隔统计）
 *
 * ROI 坐标为窗口相对坐标（左上原点，points）。
 * 编译：swiftc -O screen-timing.swift -o screen-timing
 */
import Foundation
import CoreGraphics
import CoreMedia
import ScreenCaptureKit
import ApplicationServices
import AppKit

// MARK: - JSON 输出

func out(_ obj: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys])
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data("\n".utf8))
}
func fail(_ msg: String) -> Never {
  out(["ok": false, "error": msg])
  exit(1)
}
func nowMs() -> Double { CACurrentMediaTime() * 1000.0 }

// MARK: - 参数解析

func argVal(_ args: [String], _ key: String) -> String? {
  guard let i = args.firstIndex(of: key), i + 1 < args.count else { return nil }
  return args[i + 1]
}
struct Roi { let x: Double; let y: Double; let w: Double; let h: Double }
func parseRoi(_ s: String) -> Roi {
  let p = s.split(separator: ",").map { Double($0) ?? 0 }
  guard p.count == 4 else { fail("bad roi: \(s)") }
  return Roi(x: p[0], y: p[1], w: p[2], h: p[3])
}

// MARK: - 合成事件

func postKeyDown(_ code: CGKeyCode) {
  CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: true)?.post(tap: .cghidEventTap)
}
func postKeyUp(_ code: CGKeyCode) {
  CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: false)?.post(tap: .cghidEventTap)
}
func postKey(_ code: CGKeyCode) { postKeyDown(code); postKeyUp(code) }
func postScroll(deltaY: Int32) {
  if let e = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: deltaY, wheel2: 0, wheel3: 0) {
    e.post(tap: .cghidEventTap)
  }
}

/// 组合键：mods = cmd / shift / option / ctrl（逗号分隔）
func postCombo(mods: String, key: CGKeyCode) {
  var flags: CGEventFlags = []
  for m in mods.split(separator: ",") {
    switch m {
    case "cmd": flags.insert(.maskCommand)
    case "shift": flags.insert(.maskShift)
    case "option": flags.insert(.maskAlternate)
    case "ctrl": flags.insert(.maskControl)
    default: break
    }
  }
  guard let down = CGEvent(keyboardEventSource: nil, virtualKey: key, keyDown: true) else { return }
  down.flags = flags
  down.post(tap: .cghidEventTap)
  guard let up = CGEvent(keyboardEventSource: nil, virtualKey: key, keyDown: false) else { return }
  up.flags = flags
  up.post(tap: .cghidEventTap)
}

// MARK: - 窗口

func windowList() -> [[String: Any]] {
  guard let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return [] }
  return info.compactMap { w -> [String: Any]? in
    let layer = w[kCGWindowLayer as String] as? Int ?? -1
    guard layer == 0 else { return nil }
    guard let pid = w[kCGWindowOwnerPID as String] as? Int else { return nil }
    let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
    return [
      "pid": pid,
      "owner": w[kCGWindowOwnerName as String] as? String ?? "",
      "title": w[kCGWindowName as String] as? String ?? "",
      "x": b["X"] as? Double ?? 0,
      "y": b["Y"] as? Double ?? 0,
      "w": b["Width"] as? Double ?? 0,
      "h": b["Height"] as? Double ?? 0,
    ]
  }
}

// MARK: - 像素 diff

func pixelDiff(_ a: CVPixelBuffer, _ b: CVPixelBuffer) -> Int {
  CVPixelBufferLockBaseAddress(a, .readOnly)
  CVPixelBufferLockBaseAddress(b, .readOnly)
  defer {
    CVPixelBufferUnlockBaseAddress(a, .readOnly)
    CVPixelBufferUnlockBaseAddress(b, .readOnly)
  }
  guard let pa = CVPixelBufferGetBaseAddress(a), let pb = CVPixelBufferGetBaseAddress(b) else { return Int.max }
  let h = CVPixelBufferGetHeight(a)
  let w = CVPixelBufferGetWidth(a)
  let sa = CVPixelBufferGetBytesPerRow(a)
  let sb = CVPixelBufferGetBytesPerRow(b)
  let ab = pa.assumingMemoryBound(to: UInt8.self)
  let bb = pb.assumingMemoryBound(to: UInt8.self)
  var changed = 0
  for y in 0..<h {
    let oa = y * sa, ob = y * sb
    for x in 0..<(w * 4) {
      let d = abs(Int(ab[oa + x]) - Int(bb[ob + x]))
      if d > 24 { changed += 1 }
    }
  }
  return changed
}


/// 行采样 diff（每 4 行 × 每 4 列）——waitStable 用，锁内耗时 ~1/16
func pixelDiffSampled(_ a: CVPixelBuffer, _ b: CVPixelBuffer) -> Int {
  CVPixelBufferLockBaseAddress(a, .readOnly)
  CVPixelBufferLockBaseAddress(b, .readOnly)
  defer {
    CVPixelBufferUnlockBaseAddress(a, .readOnly)
    CVPixelBufferUnlockBaseAddress(b, .readOnly)
  }
  guard let pa = CVPixelBufferGetBaseAddress(a), let pb = CVPixelBufferGetBaseAddress(b) else { return Int.max }
  let h = CVPixelBufferGetHeight(a)
  let w = CVPixelBufferGetWidth(a)
  let sa = CVPixelBufferGetBytesPerRow(a)
  let sb = CVPixelBufferGetBytesPerRow(b)
  let ab = pa.assumingMemoryBound(to: UInt8.self)
  let bb = pb.assumingMemoryBound(to: UInt8.self)
  var changed = 0
  var y = 0
  while y < h {
    let oa = y * sa, ob = y * sb
    var x = 0
    while x < w * 4 {
      let d = abs(Int(ab[oa + x]) - Int(bb[ob + x]))
      if d > 24 { changed += 1 }
      x += 4
    }
    y += 4
  }
  return changed
}

// MARK: - Probe（SCStream 输出）

final class Probe: NSObject, SCStreamOutput {
  enum Mode { case calibrate, detect, collect }
  private let lock = NSLock()
  private let queue = DispatchQueue(label: "screen-timing.probe")
  private var stream: SCStream?
  private var mode: Mode = .collect
  private var latest: CVPixelBuffer?
  private var base: CVPixelBuffer?
  private var threshold = 60
  private var calibMax = 0
  private var changedFlag = false
  private var changedTime = 0.0
  private var frameTimesArr: [Double] = []
  private var ready = false
  private let readySema = DispatchSemaphore(value: 0)

  func start(window: SCWindow, roi: Roi) async throws {
    let config = SCStreamConfiguration()
    config.width = Int(roi.w)
    config.height = Int(roi.h)
    config.sourceRect = CGRect(x: roi.x, y: roi.y, width: roi.w, height: roi.h)
    config.showsCursor = false
    config.capturesAudio = false
    config.minimumFrameInterval = CMTime(value: 1, timescale: 60)
    let filter = SCContentFilter(desktopIndependentWindow: window)
    let s = SCStream(filter: filter, configuration: config, delegate: nil)
    try s.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
    try await s.startCapture()
    stream = s
    _ = readySema.wait(timeout: .now() + 5)
    guard ready else { fail("capture: 首帧超时") }
  }
  func stop() async {
    try? await stream?.stopCapture()
  }

  func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
    guard outputType == .screen, let buf = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    let t = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer)) * 1000.0
    lock.lock()
    ready = true
    readySema.signal()
    switch mode {
    case .collect:
      frameTimesArr.append(t)
      latest = buf
    case .calibrate:
      if let prev = latest {
        let d = pixelDiff(prev, buf)
        if d > calibMax { calibMax = d }
      }
      latest = buf
    case .detect:
      if let b = base, !changedFlag {
        let d = pixelDiff(b, buf)
        if d >= threshold {
          changedFlag = true
          changedTime = t
        }
      }
      latest = buf
    }
    lock.unlock()
  }

  /// 校准：观察 0.8s 相邻帧 diff 峰值（捕捉光标闪烁 / 动画噪声），设定阈值
  func calibrate(durationMs: Double = 800) -> (max: Int, threshold: Int) {
    lock.lock(); mode = .calibrate; calibMax = 0; lock.unlock()
    Thread.sleep(forTimeInterval: durationMs / 1000.0)
    lock.lock()
    threshold = max(calibMax * 3, 60)
    let result = (calibMax, threshold)
    lock.unlock()
    return result
  }

  /// 校准重试：渲染/动画噪声大时（calibMaxDiff 异常）等待后重试，防阈值污染
  func calibrateRetry(attempts: Int = 4, settleMs: Double = 1000) -> (max: Int, threshold: Int) {
    var cal = calibrate()
    for _ in 1..<attempts where cal.max >= 800 {
      Thread.sleep(forTimeInterval: settleMs / 1000.0)
      cal = calibrate()
    }
    return cal
  }

  /// 检测模式：以当前最新帧为基准，等待 ROI 变化帧
  func detectChange(timeoutMs: Double) -> (changed: Bool, latencyMs: Double) {
    lock.lock()
    mode = .detect
    changedFlag = false
    changedTime = 0
    base = latest
    lock.unlock()
    let deadline = Date().addingTimeInterval(timeoutMs / 1000.0)
    while Date() < deadline {
      lock.lock(); let f = changedFlag; let t = changedTime; lock.unlock()
      if f { return (true, t) }
      Thread.sleep(forTimeInterval: 0.002)
    }
    return (false, 0)
  }

  func collectFrameTimes() -> [Double] {
    lock.lock(); defer { lock.unlock() }
    return frameTimesArr
  }
  func setModeCollect() { lock.lock(); mode = .collect; lock.unlock() }

  /// 等待渲染稳定：连续 stableMs 无帧间显著变化（文档加载 / 动画完成后返回），返回等待耗时 ms
  func waitStable(stableMs: Double = 600, timeoutMs: Double = 15000) -> Double {
    lock.lock(); mode = .collect; lock.unlock()
    let start = nowMs()
    var lastChange = start
    var prev: CVPixelBuffer?
    var framesSeen = 0
    while nowMs() - start < timeoutMs {
      var stable = false
      var changed = false
      lock.lock()
      if let cur = latest {
        framesSeen += 1
        if let p = prev {
          if pixelDiffSampled(p, cur) < 24 { stable = true } else { changed = true; lastChange = nowMs() }
        }
        prev = cur
      }
      lock.unlock()
      if stable && nowMs() - lastChange >= stableMs { break }
      Thread.sleep(forTimeInterval: 0.03)
    }
    FileHandle.standardError.write(Data("waitStable: \(framesSeen) frames, \(nowMs() - start)ms\n".utf8))
    return nowMs() - start
  }
}

// MARK: - 获取窗口（SCShareableContent）

func findWindow(pid: Int32) async throws -> SCWindow {
  let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
  guard let w = content.windows.first(where: { $0.owningApplication?.processID == pid && $0.frame.width > 50 }) else {
    fail("找不到 pid=\(pid) 的可捕获窗口（检查 Screen Recording 权限与窗口状态）")
  }
  return w
}

/// 测量前把目标 app 激活到前台（合成按键需要投递到目标窗口）
func activateApp(pid: Int32) {
  if let app = NSRunningApplication(processIdentifier: pid) {
    app.activate(options: [.activateIgnoringOtherApps])
  }
  Thread.sleep(forTimeInterval: 0.4)
}

/// 模拟鼠标点击 ROI 中心，强制编辑器聚焦（Tauri 窗口重新激活后焦点可能落在侧边栏等非编辑器区域）
func clickToFocus(_ window: SCWindow, roi: Roi) {
  let cx = window.frame.origin.x + roi.x + roi.w / 2
  let cy = window.frame.origin.y + roi.y + roi.h / 2
  let pt = CGPoint(x: cx, y: cy)
  CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: pt, mouseButton: .left)?.post(tap: .cghidEventTap)
  CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: pt, mouseButton: .left)?.post(tap: .cghidEventTap)
  Thread.sleep(forTimeInterval: 0.8)
}

/// 启动 SCK 捕获（带重试，规避偶发 SCStreamErrorDomain -3812）
func startCapture(probe: Probe, pid: Int32, roi: Roi) async -> Bool {
  for attempt in 0..<5 {
    do {
      let window = try await findWindow(pid: pid)
      try await probe.start(window: window, roi: roi)
      return true
    } catch {
      if attempt == 4 { return false }
      Thread.sleep(forTimeInterval: 3.0)
    }
  }
  return false
}

// MARK: - 命令实现

func cmdCheck() async {
  let ax = AXIsProcessTrusted()
  var sc = false
  do {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
    sc = !content.windows.isEmpty
  } catch { sc = false }
  out(["ok": true, "accessibility": ax, "screenRecording": sc])
}

func cmdWaitWindow(pid: Int, timeoutMs: Double) {
  let t0 = nowMs()
  let deadline = Date().addingTimeInterval(timeoutMs / 1000.0)
  while Date() < deadline {
    for w in windowList() where (w["pid"] as? Int) == pid {
      out([
        "ok": true, "pid": pid,
        "elapsedMs": round((nowMs() - t0) * 10) / 10,
        "wallMs": Date().timeIntervalSince1970 * 1000,
        "x": w["x"]!, "y": w["y"]!, "w": w["w"]!, "h": w["h"]!,
        "title": w["title"]!,
      ])
      return
    }
    Thread.sleep(forTimeInterval: 0.05)
  }
  out(["ok": false, "error": "窗口 \(timeoutMs)ms 内未出现", "elapsedMs": round((nowMs() - t0) * 10) / 10])
}

func cmdStartupProbe(pid: Int32, roi: Roi, timeoutMs: Double, clickFocus: Bool = true) async {
  guard AXIsProcessTrusted() else { fail("辅助功能权限未授予（System Settings → Privacy → Accessibility）") }
  activateApp(pid: pid)
  let probe = Probe()
  guard await startCapture(probe: probe, pid: pid, roi: roi) else { fail("SCK 捕获启动失败（重试 3 次后）") }
  let loadMs = probe.waitStable()
  // 强制聚焦编辑器（点击后光标闪烁被 calibrate 吸收）。
  // --no-click：WKWebView（Mellow）下合成点击会破坏 WebView 焦点协议，导致后续
  // 键盘事件全部丢失（2026-08-19 诊断）；WebView 启动自动持有焦点，无需点击。
  // 原生 app（Typora）光标默认在文档末尾，仍需点击把光标放到 ROI 顶部区域。
  if clickFocus {
    if let w = try? await findWindow(pid: pid) { clickToFocus(w, roi: roi) }
  }
  let cal = probe.calibrateRetry()
  let t0 = nowMs()
  postKey(0x00) // 'a'
  let r = probe.detectChange(timeoutMs: timeoutMs)
  await probe.stop()
  if r.changed {
    let latency = r.latencyMs - t0
    out(["ok": true, "latencyMs": round(latency * 100) / 100, "loadMs": round(loadMs * 10) / 10, "calibMaxDiff": cal.max, "threshold": cal.threshold])
  } else {
    out(["ok": false, "error": "按键后 \(timeoutMs)ms 内 ROI 无变化", "loadMs": round(loadMs * 10) / 10])
  }
}

func cmdKeypressLatency(pid: Int32, roi: Roi, key: CGKeyCode, count: Int, intervalMs: Double, timeoutMs: Double) async {
  guard AXIsProcessTrusted() else { fail("辅助功能权限未授予") }
  activateApp(pid: pid)
  let probe = Probe()
  guard await startCapture(probe: probe, pid: pid, roi: roi) else { fail("SCK 捕获启动失败（重试 3 次后）") }
  _ = probe.waitStable()
  if let w = try? await findWindow(pid: pid) { clickToFocus(w, roi: roi) }
  let cal = probe.calibrateRetry()
  var latencies: [Double] = []
  var consecutiveTimeout = 0
  for i in 0..<count {
    let t0 = nowMs()
    postKey(key)
    let r = probe.detectChange(timeoutMs: timeoutMs)
    if r.changed {
      latencies.append(round((r.latencyMs - t0) * 100) / 100)
      consecutiveTimeout = 0
    } else {
      latencies.append(-1)
      consecutiveTimeout += 1
      // SCK 偶发停流时快速失败，避免 100 键 × timeout 长时间卡死
      if consecutiveTimeout >= 8 { break }
    }
    let elapsed = nowMs() - t0
    if elapsed < intervalMs { Thread.sleep(forTimeInterval: (intervalMs - elapsed) / 1000.0) }
    if i % 10 == 9 {
      out(["ok": true, "phase": "progress", "i": i + 1, "count": count, "last": latencies.count > 0 ? latencies[latencies.count - 1] : 0])
    }
  }
  await probe.stop()
  out(["ok": true, "truncated": consecutiveTimeout >= 8, "calibMaxDiff": cal.max, "threshold": cal.threshold, "latencies": latencies])
}

func cmdScrollFrames(pid: Int32, roi: Roi, count: Int, delta: Int32, intervalMs: Double, timeoutMs: Double) async {
  guard AXIsProcessTrusted() else { fail("辅助功能权限未授予") }
  activateApp(pid: pid)
  let probe = Probe()
  guard await startCapture(probe: probe, pid: pid, roi: roi) else { fail("SCK 捕获启动失败（重试 3 次后）") }
  _ = probe.waitStable()
  probe.setModeCollect()
  Thread.sleep(forTimeInterval: 0.5) // warm 帧
  let t0 = nowMs()
  for _ in 0..<count {
    postScroll(deltaY: delta)
    Thread.sleep(forTimeInterval: intervalMs / 1000.0)
  }
  Thread.sleep(forTimeInterval: 0.5)
  let times = probe.collectFrameTimes()
  await probe.stop()
  let start = t0 - 400
  let end = nowMs() + 400
  let sel = times.filter { $0 >= start && $0 <= end }
  out(["ok": true, "postStartMs": round(t0 * 100) / 100, "frames": sel])
}

// MARK: - main

func mainAsync(_ args: [String]) async {
  guard let cmd = args.first else { fail("用法: screen-timing <command> ...") }
  switch cmd {
  case "check":
    await cmdCheck()
  case "window-list":
    out(["ok": true, "windows": windowList()])
  case "wait-window":
    guard let pidStr = argVal(args, "--pid"), let pid = Int(pidStr) else { fail("--pid 必填") }
    let timeout = Double(argVal(args, "--timeout") ?? "15000") ?? 15000
    cmdWaitWindow(pid: pid, timeoutMs: timeout)
  case "post-combo":
    let key = CGKeyCode(argVal(args, "--key") ?? "1") ?? 1 // 's' = 1
    let mods = argVal(args, "--mods") ?? "cmd"
    if let pidStr = argVal(args, "--pid"), let pid = Int32(pidStr) {
      activateApp(pid: pid)
    }
    postCombo(mods: mods, key: key)
    out(["ok": true, "combo": mods + "+" + String(key)])
  case "focus-type":
    // 不依赖 SCK：CGWindowList 定位窗口 → 鼠标点击聚焦编辑器 → post 'a'
    let pid = Int32(argVal(args, "--pid") ?? "") ?? -1
    let roi = parseRoi(argVal(args, "--roi") ?? "0,0,100,50")
    guard AXIsProcessTrusted() else { fail("辅助功能权限未授予") }
    activateApp(pid: pid)
    guard let w = windowList().first(where: { ($0["pid"] as? Int) == Int(pid) }) else {
      fail("window-list 找不到 pid=\(pid) 的窗口")
    }
    let cx = (w["x"] as! Double) + roi.x + roi.w / 2
    let cy = (w["y"] as! Double) + roi.y + roi.h / 2
    let pt = CGPoint(x: cx, y: cy)
    CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: pt, mouseButton: .left)?.post(tap: .cghidEventTap)
    CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: pt, mouseButton: .left)?.post(tap: .cghidEventTap)
    Thread.sleep(forTimeInterval: 0.6)
    postKey(0x00) // 'a'
    out(["ok": true, "click": [cx, cy]])
  case "startup-probe":
    let pid = Int32(argVal(args, "--pid") ?? "") ?? -1
    let roi = parseRoi(argVal(args, "--roi") ?? "0,0,100,50")
    let timeout = Double(argVal(args, "--timeout") ?? "8000") ?? 8000
    let noClick = args.contains("--no-click")
    await cmdStartupProbe(pid: pid, roi: roi, timeoutMs: timeout, clickFocus: !noClick)
  case "keypress-latency":
    let pid = Int32(argVal(args, "--pid") ?? "") ?? -1
    let roi = parseRoi(argVal(args, "--roi") ?? "0,0,100,50")
    let key = CGKeyCode(argVal(args, "--key") ?? "0") ?? 0
    let count = Int(argVal(args, "--count") ?? "100") ?? 100
    let interval = Double(argVal(args, "--interval") ?? "150") ?? 150
    let timeout = Double(argVal(args, "--timeout") ?? "2000") ?? 2000
    await cmdKeypressLatency(pid: pid, roi: roi, key: key, count: count, intervalMs: interval, timeoutMs: timeout)
  case "scroll-frames":
    let pid = Int32(argVal(args, "--pid") ?? "") ?? -1
    let roi = parseRoi(argVal(args, "--roi") ?? "0,0,100,50")
    let count = Int(argVal(args, "--count") ?? "40") ?? 40
    let delta = Int32(argVal(args, "--delta") ?? "-60") ?? -60
    let interval = Double(argVal(args, "--interval") ?? "30") ?? 30
    let timeout = Double(argVal(args, "--timeout") ?? "15000") ?? 15000
    await cmdScrollFrames(pid: pid, roi: roi, count: count, delta: delta, intervalMs: interval, timeoutMs: timeout)
  default:
    fail("未知命令: \(cmd)")
  }
}

// 初始化 CGS / AppKit（否则 CGEventPost 触发 `CGS_REQUIRE_INIT` 断言崩溃）
_ = NSApplication.shared
let sema = DispatchSemaphore(value: 0)
Task {
  await mainAsync(Array(CommandLine.arguments.dropFirst()))
  sema.signal()
}
sema.wait()
