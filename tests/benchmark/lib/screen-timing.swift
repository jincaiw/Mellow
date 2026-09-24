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
import Carbon.HIToolbox

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

/// 按**实际帧对**统计变化采样点数，并返回该对的采样点总数。
///
/// 为什么必须返回 total（2026-09-25）：`pixelDiff` 只取 `a` 的几何，且全仓假设
/// 「一个流生命周期内帧尺寸恒定」。实测该假设**不成立** —— 曾出现
/// `sampleCount=13824`（取自 576×96）而实测 `changed=17372`，**超过采样点总数**，
/// 数学上不可能。唯一解释是基准帧与比较帧几何不同（SCK 在流启动初期可能先交付
/// 未套用 `config.width/height` 的帧）。于是任何「变化点数 / 事先算好的采样点总数」
/// 的比例阈值都建立在错误的分母上。
/// 现按 `min(wA,wB) × min(hA,hB)/4` 逐对计算总数，比例才成立。
func pixelDiffPair(_ a: CVPixelBuffer, _ b: CVPixelBuffer) -> (changed: Int, total: Int) {
  CVPixelBufferLockBaseAddress(a, .readOnly)
  CVPixelBufferLockBaseAddress(b, .readOnly)
  defer {
    CVPixelBufferUnlockBaseAddress(a, .readOnly)
    CVPixelBufferUnlockBaseAddress(b, .readOnly)
  }
  guard let pa = CVPixelBufferGetBaseAddress(a), let pb = CVPixelBufferGetBaseAddress(b) else { return (Int.max, 1) }
  let w = min(CVPixelBufferGetWidth(a), CVPixelBufferGetWidth(b))
  let h = min(CVPixelBufferGetHeight(a), CVPixelBufferGetHeight(b))
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
  return (changed, w * max(1, h / 4))
}

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
  /// 阈值覆盖（2026-09-25）：校准阈值 `max(calibMax*3, 60)` 只能排除噪声 ——
  /// 它只要求「有像素动了」。对**文档切换**这种判定，工具条/滚动条/光标的偶发重绘
  /// 就能跨过它，于是 switchMs 抓到与文档无关的重绘。
  private var thresholdOverride: Int? = nil
  /// 比例阈值（2026-09-25）：按实际帧对算出的变化采样点占比，优先于绝对阈值。
  private var detectFracOverride: Double? = nil
  private var detectMaxFrac: Double = 0
  /// 基准帧与比较帧**几何不一致**的帧数（>0 即证明「帧尺寸恒定」假设不成立）
  private var detectDimMismatch = 0
  private var calibMax = 0
  private var changedFlag = false
  private var changedTime = 0.0
  /// detect 窗口内「相对 base 的最大帧差」与帧数（2026-09-22 诊断用）。
  ///
  /// 立此字段的原因：`startup-probe` 失败时只报「Nms 内 ROI 无变化」，无法区分
  /// ① 按键没落到编辑区（diff≈0）与 ② 有变化但未跨过阈值（calibMax*3 被噪声抬高）。
  /// 这两者的修法完全不同（前者查焦点、后者查校准），所以必须把实测值报出来。
  private var detectMaxDiff = 0
  private var detectFrames = 0
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
      detectFrames += 1
      if let b = base, !changedFlag {
        // 帧几何不一致计数：SCK 不保证流生命周期内帧尺寸恒定（实测 changed > total
        // 这种数学上不可能的值即由此产生）。这里把它显式计数，使问题可见而非静默。
        if CVPixelBufferGetWidth(b) != CVPixelBufferGetWidth(buf)
          || CVPixelBufferGetHeight(b) != CVPixelBufferGetHeight(buf) {
          detectDimMismatch += 1
        }
        let (d, total) = pixelDiffPair(b, buf)
        if d > detectMaxDiff { detectMaxDiff = d }
        let frac = Double(d) / Double(max(1, total))
        if frac > detectMaxFrac { detectMaxFrac = frac }
        // 比例阈值优先（见 pixelDiffPair 注释：绝对阈值建立在可能错误的分母上）
        let fired: Bool
        if let f = detectFracOverride {
          fired = frac >= f
        } else {
          fired = d >= (thresholdOverride ?? threshold)
        }
        if fired {
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
    detectMaxDiff = 0
    detectFrames = 0
    detectMaxFrac = 0
    detectDimMismatch = 0
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

  /// detect 窗口的实测统计（诊断用：区分「按键没落到编辑区」与「未跨过阈值」）
  func detectStats() -> (maxDiff: Int, frames: Int, maxFrac: Double, dimMismatch: Int) {
    lock.lock(); defer { lock.unlock() }
    return (detectMaxDiff, detectFrames, detectMaxFrac, detectDimMismatch)
  }

  func setThresholdOverride(_ v: Int?) { lock.lock(); thresholdOverride = v; lock.unlock() }
  func setFracOverride(_ v: Double?) { lock.lock(); detectFracOverride = v; lock.unlock() }

  /// `pixelDiff` 的采样点总数（用于把「实质变化」表达成比例而非绝对值）：
  /// pixelDiff 每 4 行取一行、每像素取 1 个通道 → w * (h/4)。
  ///
  /// 同时返回帧的实际像素尺寸：`config.width/height` 是**点**，SCK 可能按显示器
  /// 缩放比交付**像素**（Retina 2×）→ 二者不等。若不核对，`sampleCount()` 会低估
  /// 采样点总数，于是「15% 采样点」实际不是 15%（实测出现过阈值 2073 而 diff 达 20547）。
  func sampleCount() -> (count: Int, w: Int, h: Int) {
    lock.lock(); defer { lock.unlock() }
    guard let f = latest else { return (0, 0, 0) }
    let w = CVPixelBufferGetWidth(f)
    let h = CVPixelBufferGetHeight(f)
    return (w * max(1, h / 4), w, h)
  }

  func collectFrameTimes() -> [Double] {
    lock.lock(); defer { lock.unlock() }
    return frameTimesArr
  }
  func setModeCollect() { lock.lock(); mode = .collect; lock.unlock() }

  /// 调试：取最新帧（snap 用）
  func latestFrame() -> CVPixelBuffer? {
    lock.lock(); defer { lock.unlock() }
    return latest
  }

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

/// 解析捕获窗口并（可选）按窗口比例求 ROI（2026-09-23）。
///
/// 立此函数的原因：ROI 是**窗口相对**坐标，调用方却只能从另一个来源
/// （`wait-window`，走 CGWindowList）拿窗口几何。实测两者会不一致 ——
/// Tauri 窗口出现瞬间的尺寸是**过渡值**（实测 1178×786），最终才 resize 到
/// 960×963；调用方按过渡几何算出的 ROI 施加到最终窗口上就落到了空白处
/// （失败截图整幅纯白，仅右上角一个工具条残影），探针因此报 detectMaxDiff=0。
/// 让 helper 用「即将捕获的那个窗口」自己的 frame 求 ROI，两个来源合一，根除该错配。
func resolveRoiForCapture(pid: Int32, fallback: Roi, roiFrac: [Double]?) async -> (SCWindow, Roi)? {
  var window: SCWindow? = nil
  for attempt in 0..<5 {
    if let w = try? await findWindow(pid: pid) { window = w; break }
    if attempt == 4 { break }
    Thread.sleep(forTimeInterval: 3.0)
  }
  guard let win = window else { return nil }
  guard let f = roiFrac, f.count == 4 else { return (win, fallback) }
  let fw = Double(win.frame.width)
  let fh = Double(win.frame.height)
  let roi = Roi(x: fw * f[0], y: fh * f[1], w: max(1, fw * f[2]), h: max(24, fh * f[3]))
  return (win, roi)
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

func cmdSnap(pid: Int32, roi: Roi, outPath: String) async {
  guard AXIsProcessTrusted() else { fail("辅助功能权限未授予") }
  activateApp(pid: pid)
  let probe = Probe()
  guard await startCapture(probe: probe, pid: pid, roi: roi) else { fail("SCK 捕获启动失败") }
  Thread.sleep(forTimeInterval: 0.5)
  guard let buf = probe.latestFrame() else { fail("无帧") }
  let ci = CIImage(cvPixelBuffer: buf)
  guard let cg = CIContext().createCGImage(ci, from: ci.extent) else { fail("CIImage→CGImage 失败") }
  let rep = NSBitmapImageRep(cgImage: cg)
  guard let data = rep.representation(using: .png, properties: [:]) else { fail("PNG 编码失败") }
  try! data.write(to: URL(fileURLWithPath: outPath))
  await probe.stop()
  out(["ok": true, "out": outPath, "w": Int(roi.w), "h": Int(roi.h)])
}

/// 确保当前输入源为 ASCII 键盘布局（ABC）。返回是否成功。
///
/// 为什么必须在 `activateApp` **之后**断言：macOS 会**按应用记忆**输入源 ——
/// 激活目标 app 时可能被切回该 app 上次用的 IME（实测：runner 启动时断言为 ABC，
/// 激活 Typora 后变回「Pinyin – Simplified」）。在 runner 里断言一次是不够的。
func ensureAsciiInputSource() -> Bool {
  let props = [kTISPropertyInputSourceID as String: "com.apple.keylayout.ABC"] as CFDictionary
  guard let list = TISCreateInputSourceList(props, false)?.takeRetainedValue() as? [TISInputSource],
        let src = list.first else { return false }
  return TISSelectInputSource(src) == noErr
}

/// 当前输入源是否为键盘布局（无 IME 干扰）
func currentIsKeyboardLayout() -> Bool {
  guard let src = TISCopyCurrentKeyboardInputSource()?.takeRetainedValue(),
        let raw = TISGetInputSourceProperty(src, kTISPropertyInputSourceType) else { return false }
  let type = Unmanaged<CFString>.fromOpaque(raw).takeUnretainedValue() as String
  return type == (kTISTypeKeyboardLayout as String)
}

/// 需要合成按键的命令统一走这里：激活 app → 断言输入源为键盘布局。
/// 输入源是 IME 时按键会弹候选窗而不是回显文本，测出来的不是「编辑器回显」。
func activateAndEnsureInput(pid: Int32, ensureAscii: Bool) {
  activateApp(pid: pid)
  guard ensureAscii else { return }
  if currentIsKeyboardLayout() { return }
  guard ensureAsciiInputSource() else {
    fail("当前输入源不是键盘布局，且切换到 com.apple.keylayout.ABC 失败 —— 合成按键会被 IME 拦截，该指标不可用")
  }
  Thread.sleep(forTimeInterval: 0.3) // 等输入源切换生效
}

func cmdStartupProbe(pid: Int32, roi: Roi, timeoutMs: Double, clickFocus: Bool = true, snapOnFail: String? = nil, roiFrac: [Double]? = nil, ensureAscii: Bool = false) async {
  guard AXIsProcessTrusted() else { fail("辅助功能权限未授予（System Settings → Privacy → Accessibility）") }
  activateAndEnsureInput(pid: pid, ensureAscii: ensureAscii)
  let probe = Probe()
  guard let (win, effRoi) = await resolveRoiForCapture(pid: pid, fallback: roi, roiFrac: roiFrac) else {
    fail("SCK 捕获启动失败（找不到 pid=\(pid) 的可捕获窗口，重试 3 次后）")
  }
  do { try await probe.start(window: win, roi: effRoi) } catch { fail("SCK 捕获启动失败: \(error)") }
  let loadMs = probe.waitStable()
  // 强制聚焦编辑器（点击后光标闪烁被 calibrate 吸收）。
  // --no-click：WKWebView（Mellow）下合成点击会破坏 WebView 焦点协议，导致后续
  // 键盘事件全部丢失（2026-08-19 诊断）；WebView 启动自动持有焦点，无需点击。
  // 原生 app（Typora）光标默认在文档末尾，仍需点击把光标放到 ROI 顶部区域。
  if clickFocus {
    clickToFocus(win, roi: effRoi)
  }
  let cal = probe.calibrateRetry()
  let t0 = nowMs()
  postKey(0x00) // 'a'
  let r = probe.detectChange(timeoutMs: timeoutMs)
  let ds = probe.detectStats()
  // 失败时把 ROI 最后一帧落盘（2026-09-23）：`detectMaxDiff=0` 有两种完全不同的
  // 成因 —— ① ROI 压根没覆盖编辑区（几何错）② 覆盖了但按键没进去（焦点错）。
  // 只报数字分不出来，一张 ROI 截图即可定案（图里有文字=几何对、焦点错）。
  let frameForSnap = r.changed ? nil : probe.latestFrame()
  await probe.stop()
  // 诊断字段两个分支都报（2026-09-22）：失败时最需要的就是这些值。
  //  - detectMaxDiff vs threshold：diff 接近但未达阈值 → 校准被噪声抬高（修校准）；
  //    diff ≈ 0 → 按键没落到编辑区（修焦点）。
  //  - frontmostPid vs pid：不等说明按键发给了别的窗口。
  let front = NSWorkspace.shared.frontmostApplication?.processIdentifier ?? -1
  var diag: [String: Any] = [
    "calibMaxDiff": cal.max,
    "threshold": cal.threshold,
    "detectMaxDiff": ds.maxDiff,
    "detectFrames": ds.frames,
    "frontmostPid": Int(front),
    "expectPid": Int(pid),
    // effRoi 是**实际生效**的 ROI（按捕获窗口求得），不是调用方传入的那个 ——
    // 两者不一致正是本 bug 的形态，必须分别可见。
    "roi": "\(Int(effRoi.x)),\(Int(effRoi.y)),\(Int(effRoi.w)),\(Int(effRoi.h))",
    "winFrame": "\(Int(win.frame.origin.x)),\(Int(win.frame.origin.y)),\(Int(win.frame.width)),\(Int(win.frame.height))",
    "roiSource": roiFrac == nil ? "absolute" : "frac",
  ]
  if r.changed {
    diag["ok"] = true
    diag["latencyMs"] = round((r.latencyMs - t0) * 100) / 100
    diag["loadMs"] = round(loadMs * 10) / 10
    out(diag)
  } else {
    diag["ok"] = false
    diag["loadMs"] = round(loadMs * 10) / 10
    // 指名失败形态，便于下一轮直接定位而不是再猜
    let hint: String
    if ds.frames == 0 {
      hint = "detect 窗口内未收到任何帧（SCK 停流）"
    } else if ds.maxDiff <= 2 {
      hint = "ROI 完全无变化（按键可能未落到编辑区：检查 frontmostPid 是否等于 expectPid）"
    } else {
      hint = "有变化但未跨阈值（detectMaxDiff < threshold → 校准被动画噪声抬高）"
    }
    diag["error"] = "按键后 \(timeoutMs)ms 内 ROI 未跨阈值"
    diag["hint"] = hint
    if let path = snapOnFail, let buf = frameForSnap {
      let ci = CIImage(cvPixelBuffer: buf)
      if let cg = CIContext().createCGImage(ci, from: ci.extent) {
        let rep = NSBitmapImageRep(cgImage: cg)
        if let data = rep.representation(using: .png, properties: [:]) {
          try? data.write(to: URL(fileURLWithPath: path))
          diag["snap"] = path
        }
      }
    }
    out(diag)
  }
}

/// 用 `open -a <app> <file>` 向**已在运行的实例**投递一篇文档（macOS 走 odoc Apple Event）。
/// 不等待子进程退出：触发开销本身就是用户感知成本的一部分。
func spawnOpen(app: String, file: String) -> Bool {
  let p = Process()
  p.executableURL = URL(fileURLWithPath: "/usr/bin/open")
  p.arguments = ["-a", app, file]
  do { try p.run() } catch { return false }
  return true
}

/// hot-open 口径（2026-09-23）：在**已运行的实例**内打开另一篇文档，测两个分量：
///   ① `switchMs` 触发 open → 画面首次变化（新文档开始呈现）
///   ② `echoMs`  切换后首键 → 屏幕回显
/// 指标值 = switchMs + echoMs（与 `open` 指标同契约：**不含** waitStable 的 600ms 地板，
/// 地板另存 `settleMs` 供诊断）。
///
/// 立此口径的原因：`open` 指标 = 窗口出现 + 首键回显，含进程启动与 WebView 初始化，
/// 量的是「冷启动」；而 PRD 关心的「文档打开成本」是**同一实例内换文档**要多久。
///
/// 触发**必须**留在 helper 内：runner 用 execFileSync 同步调用 helper，
/// 若由 runner 触发 open 再调 helper，helper 启动时切换早已发生，测不到切换瞬间。
func cmdHotOpenProbe(pid: Int32, openApp: String, openFile: String, roi: Roi, timeoutMs: Double,
                     clickFocus: Bool = true, roiFrac: [Double]? = nil, snapOnFail: String? = nil,
                     ensureAscii: Bool = false, switchMinFrac: Double = 0.03) async {
  guard AXIsProcessTrusted() else { fail("辅助功能权限未授予（System Settings → Privacy → Accessibility）") }
  activateAndEnsureInput(pid: pid, ensureAscii: ensureAscii)
  let probe = Probe()
  guard let (win, effRoi) = await resolveRoiForCapture(pid: pid, fallback: roi, roiFrac: roiFrac) else {
    fail("SCK 捕获启动失败（找不到 pid=\(pid) 的可捕获窗口，重试 3 次后）")
  }
  do { try await probe.start(window: win, roi: effRoi) } catch { fail("SCK 捕获启动失败: \(error)") }
  _ = probe.waitStable() // 让「切换前」的画面先稳定，否则基准帧是动画中间态

  // ① 切换分量。
  //
  // 阈值必须要求**实质**变化（2026-09-25 修正）：校准阈值 `max(calibMax*3, 60)` 对
  // 一个 ~5.5 万采样点的 ROI 只占 0.1%，它只回答「有没有像素动」——工具条、滚动条、
  // 光标的偶发重绘就能跨过，于是 switchMs 抓到与文档无关的重绘。实测症状：
  // 8–10MiB 的 switchMs 只有 21–33ms，**比 1MiB 的 108ms 还快**，物理上不可能；
  // 且尺寸扫描（1–10MiB）完全看不出与尺寸的关系。
  // 现改为要求「变化采样点 ≥ sampleCount × switchMinFrac」（默认 15%）。
  let sc = probe.sampleCount()
  let sampleCount = sc.count
  // 用**比例**阈值（不是绝对点数）：绝对点数需要事先知道采样点总数，而实测帧几何
  // 在流生命周期内会变（见 pixelDiffPair 注释），事先算的分母不可靠。
  probe.setFracOverride(switchMinFrac)
  let tOpen = nowMs()
  let spawned = spawnOpen(app: openApp, file: openFile)
  let sw = probe.detectChange(timeoutMs: timeoutMs)
  probe.setFracOverride(nil)
  let switchMs = sw.changed ? (sw.latencyMs - tOpen) : -1
  let switchStats = probe.detectStats()
  let switchThreshold = Int(Double(sampleCount) * switchMinFrac)

  // ② 等新文档渲染稳定（**不计入指标**，单独落盘）
  let settleMs = sw.changed ? probe.waitStable() : -1

  // ③ 首键回显分量
  var echoMs = -1.0
  var echoStats = (maxDiff: 0, frames: 0, maxFrac: 0.0, dimMismatch: 0)
  var cal = (max: 0, threshold: 0)
  if sw.changed {
    // --no-click：WKWebView（Mellow）下合成点击破坏 TextInput 焦点协议（同 startup-probe）。
    if clickFocus { clickToFocus(win, roi: effRoi) }
    cal = probe.calibrateRetry()
    let t0 = nowMs()
    postKey(0x00) // 'a'
    let r = probe.detectChange(timeoutMs: timeoutMs)
    echoStats = probe.detectStats()
    if r.changed { echoMs = r.latencyMs - t0 }
  }
  // 失败时落盘「当时的画面」：切换失败（sw.changed == false）比回显失败更需要这张图 ——
  // 它直接回答「屏幕上到底是新文档、旧文档，还是一个确认对话框」。
  let frameForSnap = (sw.changed && echoMs >= 0) ? nil : probe.latestFrame()
  await probe.stop()

  let ok = sw.changed && echoMs >= 0
  let front = NSWorkspace.shared.frontmostApplication?.processIdentifier ?? -1
  var diag: [String: Any] = [
    "ok": ok,
    "openApp": openApp,
    "openFile": openFile,
    "openSpawned": spawned,
    "switchMs": round(switchMs * 100) / 100,
    "settleMs": round(settleMs * 10) / 10,
    "echoMs": round(echoMs * 100) / 100,
    "totalMs": ok ? round((switchMs + echoMs) * 100) / 100 : -1,
    "switchDetectMaxDiff": switchStats.maxDiff,
    "switchDetectFrames": switchStats.frames,
    "switchDetectMaxFrac": (round(switchStats.maxFrac * 10000) / 10000),
    "switchDimMismatchFrames": switchStats.dimMismatch,
    "switchMinFrac": switchMinFrac,
    "switchThreshold": switchThreshold,
    "sampleCount": sampleCount,
    "frameW": sc.w,
    "frameH": sc.h,
    "echoDetectMaxDiff": echoStats.maxDiff,
    "echoDetectFrames": echoStats.frames,
    "calibMaxDiff": cal.max,
    "threshold": cal.threshold,
    "frontmostPid": Int(front),
    "expectPid": Int(pid),
    "roi": "\(Int(effRoi.x)),\(Int(effRoi.y)),\(Int(effRoi.w)),\(Int(effRoi.h))",
    "winFrame": "\(Int(win.frame.origin.x)),\(Int(win.frame.origin.y)),\(Int(win.frame.width)),\(Int(win.frame.height))",
    "roiSource": roiFrac == nil ? "absolute" : "frac",
  ]
  if !ok {
    // 指名失败形态：两种失败的修法完全不同
    let hint: String
    if !spawned {
      hint = "无法执行 open -a \(openApp)（路径/权限问题）"
    } else if !sw.changed {
      hint = "触发 open 后 ROI 未变化（文档未切换，或 ROI 未覆盖文档区）"
    } else {
      hint = "文档已切换但首键回显未测到（切换后焦点未落在编辑区，或渲染未完成）"
    }
    diag["hint"] = hint
    if let path = snapOnFail, let buf = frameForSnap {
      let ci = CIImage(cvPixelBuffer: buf)
      if let cg = CIContext().createCGImage(ci, from: ci.extent) {
        let rep = NSBitmapImageRep(cgImage: cg)
        if let data = rep.representation(using: .png, properties: [:]) {
          try? data.write(to: URL(fileURLWithPath: path))
          diag["snap"] = path
        }
      }
    }
  }
  out(diag)
}

func cmdKeypressLatency(pid: Int32, roi: Roi, key: CGKeyCode, count: Int, intervalMs: Double, timeoutMs: Double, clickFocus: Bool = true, roiFrac: [Double]? = nil, ensureAscii: Bool = false) async {
  guard AXIsProcessTrusted() else { fail("辅助功能权限未授予") }
  activateAndEnsureInput(pid: pid, ensureAscii: ensureAscii)
  let probe = Probe()
  guard let (win, effRoi) = await resolveRoiForCapture(pid: pid, fallback: roi, roiFrac: roiFrac) else {
    fail("SCK 捕获启动失败（找不到 pid=\(pid) 的可捕获窗口，重试 3 次后）")
  }
  do { try await probe.start(window: win, roi: effRoi) } catch { fail("SCK 捕获启动失败: \(error)") }
  _ = probe.waitStable()
  // --no-click：与 startup-probe 同因（WKWebView 合成点击破坏 TextInput 焦点协议）。
  if clickFocus { clickToFocus(win, roi: effRoi) }
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

func cmdScrollFrames(pid: Int32, roi: Roi, count: Int, delta: Int32, intervalMs: Double, timeoutMs: Double, roiFrac: [Double]? = nil) async {
  guard AXIsProcessTrusted() else { fail("辅助功能权限未授予") }
  activateApp(pid: pid)
  let probe = Probe()
  guard let (win, effRoi) = await resolveRoiForCapture(pid: pid, fallback: roi, roiFrac: roiFrac) else {
    fail("SCK 捕获启动失败（找不到 pid=\(pid) 的可捕获窗口，重试 3 次后）")
  }
  do { try await probe.start(window: win, roi: effRoi) } catch { fail("SCK 捕获启动失败: \(error)") }
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
  case "windows":
    // 诊断（2026-09-23）：同一 pid 下可能有多个 layer-0 窗口（Tauri 主窗 + 辅助窗），
    // `wait-window` 与 SCK `findWindow` 各自取「第一个」，取到的可能不是同一个 →
    // 调用方按 A 的几何算出的 ROI，被施加到 B 上，ROI 落空（实测 ROI 截图全白）。
    let pid = Int(argVal(args, "--pid") ?? "") ?? -1
    let all = windowList().filter { ($0["pid"] as? Int) == pid }
    let sc = (try? await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true))?.windows
      .filter { $0.owningApplication?.processID == Int32(pid) }
      .map { ["w": Double($0.frame.width), "h": Double($0.frame.height), "x": Double($0.frame.origin.x), "y": Double($0.frame.origin.y)] } ?? []
    out(["ok": true, "cgWindows": all, "sckWindows": sc])
  case "current-input":
    // 权威查询**当前**输入源（2026-09-23）。
    //
    // 立此命令的原因：Node 侧原先用 `defaults read … AppleSelectedInputSources`
    // 判定「是否英文」，那读的是**已启用列表**（不是当前源），且用正则
    // `/ABC|U\.S\.|English/` —— 而简体拼音的输入源 id 是
    // `com.apple.inputmethod.SCIM.ITABC`，**字面量里就含 `ABC`**，于是误报「英文」。
    // 后果：合成按键落到拼音 IME 上，弹出候选窗而不是回显文本，
    // 「首键回显」分量测的是候选窗出现的耗时。
    // TIS 的 `kTISPropertyInputSourceType` 能直接区分「键盘布局」与「输入法模式」，
    // 这才是可靠判据（键盘布局 = 无 IME 干扰）。
    if let src = TISCopyCurrentKeyboardInputSource()?.takeRetainedValue() {
      func prop(_ key: CFString) -> String {
        guard let raw = TISGetInputSourceProperty(src, key) else { return "" }
        return (Unmanaged<CFString>.fromOpaque(raw).takeUnretainedValue() as String)
      }
      let id = prop(kTISPropertyInputSourceID)
      let type = prop(kTISPropertyInputSourceType)
      let name = prop(kTISPropertyLocalizedName)
      out([
        "ok": true,
        "id": id,
        "type": type,
        "name": name,
        // 只有键盘布局（keyboard layout）才没有 IME 干扰；输入法模式（input mode）会拦按键
        "isKeyboardLayout": type == (kTISTypeKeyboardLayout as String),
        "isAsciiCapable": (TISGetInputSourceProperty(src, kTISPropertyInputSourceIsASCIICapable)
          .map { Unmanaged<CFBoolean>.fromOpaque($0).takeUnretainedValue() == kCFBooleanTrue } ?? false),
      ])
    } else {
      out(["ok": false, "error": "无法取得当前输入源"])
    }
  case "snap":    // 调试：把 ROI 当前帧存为 PNG（诊断 ROI 是否覆盖文本/光标区域）
    let pid = Int32(argVal(args, "--pid") ?? "") ?? -1
    let roi = parseRoi(argVal(args, "--roi") ?? "0,0,400,300")
    let outPath = argVal(args, "--out") ?? "/tmp/screen-timing-snap.png"
    await cmdSnap(pid: pid, roi: roi, outPath: outPath)
  case "startup-probe":
    let pid = Int32(argVal(args, "--pid") ?? "") ?? -1
    let roi = parseRoi(argVal(args, "--roi") ?? "0,0,100,50")
    let timeout = Double(argVal(args, "--timeout") ?? "8000") ?? 8000
    let noClick = args.contains("--no-click")
    let snapOnFail = argVal(args, "--snap-on-fail")
    // --roi-frac "x,y,w,h"：按「实际捕获窗口」的比例求 ROI（推荐；见 resolveRoiForCapture）。
    let roiFrac = argVal(args, "--roi-frac").map { s in s.split(separator: ",").compactMap { Double($0) } }
    await cmdStartupProbe(pid: pid, roi: roi, timeoutMs: timeout, clickFocus: !noClick, snapOnFail: snapOnFail, roiFrac: roiFrac, ensureAscii: args.contains("--ensure-ascii"))
  case "hot-open-probe":
    // 在已运行的实例内打开另一篇文档（见 cmdHotOpenProbe 注释）。
    let pid = Int32(argVal(args, "--pid") ?? "") ?? -1
    let openApp = argVal(args, "--open-app") ?? ""
    let openFile = argVal(args, "--open-file") ?? ""
    let roi = parseRoi(argVal(args, "--roi") ?? "0,0,100,50")
    let timeout = Double(argVal(args, "--timeout") ?? "8000") ?? 8000
    let hoRoiFrac = argVal(args, "--roi-frac").map { s in s.split(separator: ",").compactMap { Double($0) } }
    await cmdHotOpenProbe(pid: pid, openApp: openApp, openFile: openFile, roi: roi, timeoutMs: timeout,
                          clickFocus: !args.contains("--no-click"),
                          roiFrac: hoRoiFrac, snapOnFail: argVal(args, "--snap-on-fail"),
                          ensureAscii: args.contains("--ensure-ascii"),
                          switchMinFrac: Double(argVal(args, "--switch-min-frac") ?? "0.03") ?? 0.03)
  case "keypress-latency":
    let pid = Int32(argVal(args, "--pid") ?? "") ?? -1
    let roi = parseRoi(argVal(args, "--roi") ?? "0,0,100,50")
    let key = CGKeyCode(argVal(args, "--key") ?? "0") ?? 0
    let count = Int(argVal(args, "--count") ?? "100") ?? 100
    let interval = Double(argVal(args, "--interval") ?? "150") ?? 150
    let timeout = Double(argVal(args, "--timeout") ?? "2000") ?? 2000
    let kpRoiFrac = argVal(args, "--roi-frac").map { s in s.split(separator: ",").compactMap { Double($0) } }
    await cmdKeypressLatency(pid: pid, roi: roi, key: key, count: count, intervalMs: interval, timeoutMs: timeout,
                             clickFocus: !args.contains("--no-click"), roiFrac: kpRoiFrac,
                             ensureAscii: args.contains("--ensure-ascii"))
  case "scroll-frames":
    let pid = Int32(argVal(args, "--pid") ?? "") ?? -1
    let roi = parseRoi(argVal(args, "--roi") ?? "0,0,100,50")
    let count = Int(argVal(args, "--count") ?? "40") ?? 40
    let delta = Int32(argVal(args, "--delta") ?? "-60") ?? -60
    let interval = Double(argVal(args, "--interval") ?? "30") ?? 30
    let timeout = Double(argVal(args, "--timeout") ?? "15000") ?? 15000
    let sfRoiFrac = argVal(args, "--roi-frac").map { s in s.split(separator: ",").compactMap { Double($0) } }
    await cmdScrollFrames(pid: pid, roi: roi, count: count, delta: delta, intervalMs: interval, timeoutMs: timeout, roiFrac: sfRoiFrac)
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
