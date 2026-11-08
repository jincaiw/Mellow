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
 *   startup-watch --pid N --roi-frac x,y,w,h --timeout T [--stable-ms M] [--min-frac F]
 *   startup-watch --launch-bin PATH [--launch-arg A]... [--roi-frac ...] ...
 *                               **显示器级**诊断：开显示器流后再等窗口（或**先开流、由本进程
 *                               启动应用**，后者保证捕获从进程启动前开始 —— 窗口创建极快的
 *                               应用只有该形态可测到首绘）。窗口出现后按窗口几何裁 ROI，
 *                               报首个/最大内容变化与稳定时刻（见 DisplayProbe）
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

/// **epoch** 毫秒（与调用方 JS 的 `Date.now()` 同一时基）—— 用于把本进程内的相位时刻
/// 与「进程启动 / 窗口出现」对齐（`nowMs()` 是开机以来的单调时钟，跨进程不可比）。
func epochMs() -> Double { Date().timeIntervalSince1970 * 1000 }

// MARK: - 参数解析

func argVal(_ args: [String], _ key: String) -> String? {
  guard let i = args.firstIndex(of: key), i + 1 < args.count else { return nil }
  return args[i + 1]
}
/// 收集某个开关的**全部**取值（用于 `--launch-arg` 这类可重复参数）。
func argVals(_ args: [String], _ key: String) -> [String] {
  var result: [String] = []
  var i = 0
  while i + 1 < args.count {
    if args[i] == key { result.append(args[i + 1]); i += 2 } else { i += 1 }
  }
  return result
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

/// 「首键回显 / 窗口出现」判据的最小变化**比例**（2026-09-28）。
///
/// 为什么不再用绝对点数：`calibrate()` 的判据是 `max(calibMax * 3, 60)`，
/// 而实测「插入一个字符」在一个 576×96 的 ROI 上只产生 **59** 个变化采样点 ——
/// **恰好比地板 60 小 1**。于是 Mellow 10MB 的四次 open 全部被判为「未回显」：
///   `detectMaxDiff=59 threshold=60 calibMaxDiff=0`（底噪为 0，说明窗口完全静止）
/// 结果是 PRD 对 10MB 的核心目标（1.0–1.5s）**一个有效读数都拿不到**，
/// 而失败提示写的是「按键可能未落到编辑区」—— 又把人引向焦点问题。
///
/// 一个魔法常数压在真实信号（59）的量级上，是**判据设计问题**，不是产品问题。
/// 改为比例：0.1% × 13824 ≈ 14 个采样点，比实测信号（0.43%）低约 4 倍；
/// 校准底噪为 0 时不会误触发，底噪升高时由 `calibMax * 3` 自适应项兜住。
let ECHO_MIN_FRAC = 0.001

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
  /// W-PERF-3 诊断：`waitStable` 期间的观察统计（framesSeen / changedFrames / firstChangeMs）
  private var stableFramesSeen = 0
  private var stableChangedFrames = 0
  private var stableFirstChangeMs = -1.0
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
  ///
  /// ⚠️ **W-PERF-3（2026-10-01 实测结论）**：本函数的返回值**不是文档加载耗时** ——
  /// 判据是「连续 stableMs（600ms）无显著变化」，故循环**结构上不可能早于 600ms 返回**，
  /// 实测跨应用/跨尺寸恒为 603.8–631ms。
  ///
  /// 曾尝试的「一行级修法」（改返回 `lastChange - start`）**经本机实测不可行**：
  /// 本函数是在**窗口已被绘制之后**才被调用的，此时窗口内**没有后续变化可观察** →
  /// 8 个样本的 `changedFrames` **全为 0** → 读数**恒为 0**（把「恒 600ms 地板」
  /// 换成「恒 0」，后者更糟：0 读起来像「瞬时加载」）。
  ///
  /// 故**保留原返回值**（它是「等待画面静止」的忠实读数），改为把
  /// **观察到的显著变化帧数与首次变化时刻**一并报出 —— 让「本窗口内到底有没有东西可观察」
  /// 成为**每样本可见的事实**，而不是只写在注释里的约定。
  func waitStable(stableMs: Double = 600, timeoutMs: Double = 15000) -> Double {
    lock.lock(); mode = .collect; lock.unlock()
    let start = nowMs()
    var lastChange = start
    var firstChange = -1.0
    var prev: CVPixelBuffer?
    var framesSeen = 0
    var changedFrames = 0
    while nowMs() - start < timeoutMs {
      var stable = false
      var changed = false
      lock.lock()
      if let cur = latest {
        framesSeen += 1
        if let p = prev {
          if pixelDiffSampled(p, cur) < 24 { stable = true } else {
            changed = true
            let t = nowMs()
            if firstChange < 0 { firstChange = t - start }
            lastChange = t
            changedFrames += 1
          }
        }
        prev = cur
      }
      lock.unlock()
      if stable && nowMs() - lastChange >= stableMs { break }
      Thread.sleep(forTimeInterval: 0.03)
    }
    stableChangedFrames = changedFrames
    stableFirstChangeMs = firstChange < 0 ? -1 : firstChange
    stableFramesSeen = framesSeen
    FileHandle.standardError.write(Data("waitStable: \(framesSeen) frames, \(changedFrames) changed, firstChange \(stableFirstChangeMs)ms, total \(nowMs() - start)ms\n".utf8))
    return nowMs() - start
  }

  /// `waitStable` 期间的观察统计（W-PERF-3 诊断字段）
  func stableStats() -> (framesSeen: Int, changedFrames: Int, firstChangeMs: Double) {
    return (stableFramesSeen, stableChangedFrames, stableFirstChangeMs)
  }
}

// MARK: - DisplayProbe（显示器级捕获：观测窗口创建前的帧）
//
// 为什么必须到「显示器级」（2026-10-13 A/B 实测后确定的唯一真实路径，审计 §4.348）：
// `desktopIndependentWindow` 只能捕获**已经存在**的窗口 ⇒ 观测窗口最早也只能从
// 「窗口已出现」之后开始；而 Tauri / AppKit 窗口从出现在屏幕上到内部内容画完是一段
// 竞态，实测 16 个样本里 15 个的内容变化落在首帧**之前**。把 `waitStable` 改成
// `lastChange` 只会得到恒 0（8/8），因为那时已经无变化可观察。
//
// 本探针在**应用进程启动之前**就打开显示器流，待窗口出现后按窗口几何裁出 ROI，
// 再在该 ROI 上检测「第一次内容变化」与「连续静止」时刻 ⇒ 读数才可能是真正的
// 内容绘制时刻，而不是 `waitStable(stableMs: 600)` 的 600ms 地板。
//
// ⚠️ 边界（如实登记）：
//  - 只捕获**主显示器**；窗口在副屏时如实报错（benchmark 在主流单屏场景使用）。
//  - 全屏捕获比按窗口捕获更重，会轻微扰动被测算应用 ⇒ **仅用于诊断**，
//    不参与任何 PRD 判定（判定量仍是 hotopen.switchMs，见 ADR-0026）。
//  - 窗口出现的系统动画也会产生变化帧；跨应用比较时两边同样计入，不改变相对关系。
final class DisplayProbe: NSObject, SCStreamOutput {
  private let lock = NSLock()
  private let queue = DispatchQueue(label: "screen-timing.display-probe")
  private var stream: SCStream?
  private var ready = false
  private let readySema = DispatchSemaphore(value: 0)

  private var displayFrame: CGRect = .zero
  private var roiFrac: [Double] = [0.2, 0.06, 0.6, 0.1]
  private var minFrac = 0.001

  private var winFrame: CGRect? = nil
  /// 每个窗口几何的**基线快照**（BGRA 四字节/点，step=4 网格），键 = 取整的 x,y,w,h。
  ///
  /// ⚠️ 不能保存 `CVPixelBuffer` 本身（2026-11-08 实测）：SCK 从固定大小的缓冲池复用
  /// `CVPixelBuffer`，下一次回调会**覆写**上一次保存的那个 buffer ——
  /// 于是「上一帧 vs 当前帧」实际变成「当前帧 vs 当前帧」，`roiSampleDiff` 恒返回 0。
  /// 症状：`framesInRoi=574, changedFrames=0, maxFrac=0`，且只在缓冲池较小时稳定复现
  /// （窗口级捕获池更大，所以旧 `startup-probe` 没暴露该问题）。
  /// 解决：回调内立刻把采样点复制到独立堆数组，与 buffer 生命周期解耦。
  ///
  /// ⚠️ 也**不能只保存「上一帧」**（2026-11-08 第二轮实测）：窗口几何会在启动期间抖一下
  /// （实测同一 pid 出现 1184×788 与 960×963 两个不同几何，间隔 31ms）。旧实现遇到几何变化
  /// 就清空基线，若正文绘制恰好发生在这段抖动里，那次**大变化会被吞掉** ——
  /// 症状：`maxFrac=0.006`（只剩光标/工具条的小变化），而同一场景重跑会得到 `maxFrac=0.406`。
  /// 解决：基线**按几何分桶**（回到旧几何时仍可与抖动前的帧比较）。
  private var baselines: [String: (samples: [UInt8], w: Int, h: Int)] = [:]
  private var baselineOrder: [String] = []

  private var framesAll = 0
  private var framesInRoi = 0
  private var changedFrames = 0
  private var firstChangeEpoch = -1.0
  private var lastChangeEpoch = -1.0
  private var maxFrac = 0.0
  /// 最大变化发生时刻：首个 ≥minFrac 的变化可能是工具条/滚动条，**内容绘制**往往不是第一帧。
  /// 报「最大变化」让报告能区分「第一次有任何变化」与「正文真正画出来」。
  private var maxFracEpoch = -1.0
  private var roiUsed: CGRect = .zero
  private var frameW = 0
  private var frameH = 0
  /// 窗口几何变化轨迹（epoch ms + x/y/w/h，最多 32 条）。
  /// 诊断用（2026-11-08）：几何变化会清空基线，若正文绘制**恰好与一次 resize 同帧**，
  /// 那一次大变化会被吞掉 —— 只有把「何时发生几何变化」报出来，才能判断读数是否被吃掉。
  private var geomLog: [[Double]] = []
  /// 帧对变化比例最大的若干次（epoch ms + frac，最多 10 条，降序）。
  /// 用来区分「正文一次性绘出（单帧大比例）」与「逐块绘制（多帧小比例）」。
  private var fracTop: [[Double]] = []

  func setRoiFrac(_ f: [Double]) {
    guard f.count == 4 else { return }
    lock.lock(); roiFrac = f; lock.unlock()
  }
  func setMinFrac(_ v: Double) { lock.lock(); minFrac = v; lock.unlock() }

  /// 窗口出现时调用（坐标 = 屏幕 points，左上原点，与 CGWindowList 一致）。
  ///
  /// **可重复调用**（2026-11-08）：窗口在出现后还会 resize（实测 Tauri 主窗先以
  /// 过渡尺寸出现、再 resize 到最终尺寸）。若只在首次看到时固定几何，
  /// ROI 会按过渡尺寸算出、落在最终窗口之外 → 整段 ROI 恒为背景色、永不报变化
  /// （实测一次样本：`framesInRoi=574, changedFrames=0`）。
  /// 几何变化**不再清空基线**：基线按几何分桶（见 `baselines`），
  /// 跨几何的帧对比较天然由「桶」隔离，回到旧几何时仍可与抖动前的帧比较。
  func setWindowFrame(_ f: CGRect) {
    lock.lock(); defer { lock.unlock() }
    if let old = winFrame,
       abs(old.minX - f.minX) <= 2, abs(old.minY - f.minY) <= 2,
       abs(old.width - f.width) <= 2, abs(old.height - f.height) <= 2 {
      return
    }
    if geomLog.count < 32 {
      geomLog.append([epochMs(), f.minX, f.minY, f.width, f.height])
    }
    winFrame = f
  }
  func isWindowFound() -> Bool { lock.lock(); defer { lock.unlock() }; return winFrame != nil }

  func stats() -> (framesAll: Int, framesInRoi: Int, changedFrames: Int,
                   firstChangeEpoch: Double, lastChangeEpoch: Double, maxFrac: Double,
                   maxFracEpoch: Double,
                   roi: CGRect, frameW: Int, frameH: Int) {
    lock.lock(); defer { lock.unlock() }
    return (framesAll, framesInRoi, changedFrames, firstChangeEpoch, lastChangeEpoch,
            maxFrac, maxFracEpoch, roiUsed, frameW, frameH)
  }

  func diagnostics() -> (geom: [[Double]], fracTop: [[Double]]) {
    lock.lock(); defer { lock.unlock() }
    return (geomLog, fracTop)
  }

  func start(display: SCDisplay) async throws {
    lock.lock(); displayFrame = display.frame; lock.unlock()
    let pxW = max(1, CGDisplayPixelsWide(display.displayID))
    let pxH = max(1, CGDisplayPixelsHigh(display.displayID))
    let config = SCStreamConfiguration()
    config.width = pxW
    config.height = pxH
    config.pixelFormat = kCVPixelFormatType_32BGRA
    config.showsCursor = false
    config.capturesAudio = false
    config.queueDepth = 3
    config.minimumFrameInterval = CMTime(value: 1, timescale: 30)
    let filter = SCContentFilter(display: display, excludingWindows: [])
    let s = SCStream(filter: filter, configuration: config, delegate: nil)
    try s.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
    try await s.startCapture()
    stream = s
    _ = readySema.wait(timeout: .now() + 5)
    guard ready else { fail("显示器捕获: 首帧超时") }
  }

  func stop() async { try? await stream?.stopCapture() }

  func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
    guard outputType == .screen, let buf = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    lock.lock()
    ready = true
    readySema.signal()
    framesAll += 1
    frameW = CVPixelBufferGetWidth(buf)
    frameH = CVPixelBufferGetHeight(buf)
    guard let wf = winFrame, !roiFrac.isEmpty else {
      lock.unlock()
      return
    }
    let df = displayFrame
    let scale = df.width > 0 ? Double(frameW) / Double(df.width) : 1.0
    let rx = (wf.minX - df.minX + roiFrac[0] * wf.width) * scale
    let ry = (wf.minY - df.minY + roiFrac[1] * wf.height) * scale
    let rw = max(4, roiFrac[2] * wf.width * scale)
    let rh = max(4, roiFrac[3] * wf.height * scale)
    let rect = CGRect(x: rx, y: ry, width: rw, height: rh)
    roiUsed = rect
    framesInRoi += 1
    // 立即复制采样点（见 baselines 注释：不能保存 buffer 引用）。
    let snap = roiSnapshot(buf, rect: rect)
    let key = "\(Int(wf.minX)),\(Int(wf.minY)),\(Int(wf.width)),\(Int(wf.height))"
    if snap.w > 0, let base = baselines[key], base.w == snap.w, base.h == snap.h {
      let (changed, total) = roiSampleDiff(base.samples, snap.samples)
      let frac = Double(changed) / Double(max(1, total))
      let t = epochMs()
      if frac > maxFrac {
        maxFrac = frac
        maxFracEpoch = t
      }
      if frac > 0.0005 {
        fracTop.append([t, frac])
        fracTop.sort { $0[1] > $1[1] }
        if fracTop.count > 10 { fracTop.removeLast(fracTop.count - 10) }
      }
      if frac >= minFrac {
        if firstChangeEpoch < 0 { firstChangeEpoch = t }
        lastChangeEpoch = t
        changedFrames += 1
      }
    }
    if baselines[key] == nil { baselineOrder.append(key) }
    baselines[key] = (snap.samples, snap.w, snap.h)
    // 基线桶上限 8 个：启动期几何抖动实测不超过 3 个；超出只可能是窗口在不停变化，
    // 此时保留最新的几个即可（更老的几何不会再出现）。
    while baselineOrder.count > 8 {
      let old = baselineOrder.removeFirst()
      baselines.removeValue(forKey: old)
    }
    lock.unlock()
  }
}

/// 把 ROI 内的采样点复制成独立数组（BGRA 4 字节/点，step=4 网格）。
/// 必须在持有 buffer 的回调内调用；返回值与 buffer 生命周期无关（见 baselines 注释）。
func roiSnapshot(_ buf: CVPixelBuffer, rect: CGRect, step: Int = 4) -> (samples: [UInt8], w: Int, h: Int) {
  let w = CVPixelBufferGetWidth(buf), h = CVPixelBufferGetHeight(buf)
  let x0 = max(0, Int(rect.minX)), y0 = max(0, Int(rect.minY))
  let x1 = min(w, Int(rect.maxX)), y1 = min(h, Int(rect.maxY))
  guard x1 - x0 >= step, y1 - y0 >= step else { return ([], 0, 0) }
  let gw = (x1 - x0) / step, gh = (y1 - y0) / step
  var out = [UInt8](repeating: 0, count: gw * gh * 4)
  CVPixelBufferLockBaseAddress(buf, .readOnly)
  defer { CVPixelBufferUnlockBaseAddress(buf, .readOnly) }
  guard let p = CVPixelBufferGetBaseAddress(buf)?.assumingMemoryBound(to: UInt8.self) else {
    return ([], 0, 0)
  }
  let bpr = CVPixelBufferGetBytesPerRow(buf)
  for gy in 0..<gh {
    let y = y0 + gy * step
    for gx in 0..<gw {
      let x = x0 + gx * step
      let i = y * bpr + x * 4
      let o = (gy * gw + gx) * 4
      out[o] = p[i]; out[o + 1] = p[i + 1]; out[o + 2] = p[i + 2]; out[o + 3] = p[i + 3]
    }
  }
  return (out, gw, gh)
}

/// 两份采样快照的差异（BGRA，逐通道容忍 8）。
/// 返回 (变化采样点数, 采样点总数)；分母 = 实际比较的点数。
func roiSampleDiff(_ a: [UInt8], _ b: [UInt8]) -> (changed: Int, total: Int) {
  guard a.count == b.count, a.count >= 4 else { return (0, 0) }
  var changed = 0
  var i = 0
  while i + 3 < a.count {
    let dr = abs(Int(a[i]) - Int(b[i]))
    let dg = abs(Int(a[i + 1]) - Int(b[i + 1]))
    let db = abs(Int(a[i + 2]) - Int(b[i + 2]))
    if max(dr, max(dg, db)) > 8 { changed += 1 }
    i += 4
  }
  return (changed, a.count / 4)
}

/// 显示器级启动观测：**先开流、再等窗口**。
///
/// 两种用法：
/// - `--pid N`：调用方已启动应用；本进程**随后**接入。若 windowList 在首轮 poll 就看到窗口
///   （`stream→window ≤ 100ms`），说明流启动晚于窗口，首个绘制可能已经错过 → 结果不可用。
/// - `--launch-bin PATH [--launch-arg A]...`：**先开流、再由本进程启动应用**（2026-11-08）。
///   这是唯一能保证「捕获从进程启动前开始」的形态；Mellow 窗口创建极快（实测流接入时窗口已存在），
///   只有该形态才能测到它的首绘。
func cmdStartupWatch(pid: Int32, roiFrac: [Double]?, timeoutMs: Double, stableMs: Double, minFrac: Double,
                     launchBin: String?, launchArgs: [String], activate: Bool) async {
  guard AXIsProcessTrusted() else { fail("辅助功能权限未授予（System Preferences → Privacy → Accessibility）") }
  let tProbe = epochMs()
  let content: SCShareableContent
  do {
    content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
  } catch { fail("SCK 共享内容获取失败: \(error)") }
  let mainID = CGMainDisplayID()
  guard let display = content.displays.first(where: { $0.displayID == mainID }) ?? content.displays.first else {
    fail("找不到可捕获的显示器")
  }
  let probe = DisplayProbe()
  probe.setRoiFrac(roiFrac ?? [0.2, 0.06, 0.6, 0.1])
  probe.setMinFrac(minFrac)
  do { try await probe.start(display: display) } catch { fail("显示器捕获启动失败: \(error)") }
  let tStream = epochMs()
  // ---- 先开流、再启动（可选） ----
  var effectivePid = pid
  var launchedPid: Int32 = -1
  var tLaunch = -1.0
  if let bin = launchBin {
    tLaunch = epochMs()
    let p = Process()
    p.executableURL = URL(fileURLWithPath: bin)
    p.arguments = launchArgs
    p.standardOutput = FileHandle.nullDevice
    p.standardError = FileHandle.nullDevice
    do { try p.run() } catch { fail("启动失败 \(bin): \(error)") }
    effectivePid = p.processIdentifier
    launchedPid = effectivePid
  }
  var winSeenEpoch = -1.0
  var winFrame: CGRect? = nil
  var tActivate = -1.0
  let deadline = tProbe + timeoutMs
  while epochMs() < deadline {
    // 每轮都重新查窗口几何（不只查一次）：窗口会 resize，
    // 固定过渡几何会让 ROI 落到最终窗口之外 → 永不报变化（见 setWindowFrame 注释）。
    for w in windowList() where (w["pid"] as? Int) == Int(effectivePid) {
      let ww = (w["w"] as? Double) ?? 0
      let wh = (w["h"] as? Double) ?? 0
      if ww >= 120, wh >= 120 {
        let f = CGRect(x: (w["x"] as? Double) ?? 0, y: (w["y"] as? Double) ?? 0,
                       width: ww, height: wh)
        if winFrame == nil {
          winSeenEpoch = epochMs()
          // 激活（可选）：SCK 对**被遮挡/非前台**窗口只能拿到静止帧。
          // 若应用由本进程启动，它可能在后台上线 → ROI 全程零变化。
          // 该激活发生在窗口出现之后，所以「窗口出现时刻」不受影响；
          // 但它会改变窗口外观（标题栏焦点态），故 `activateEpochMs` 单独报出，
          // 读者可判断首个变化是否只是激活引起的重绘。
          if activate, tActivate < 0 {
            tActivate = epochMs()
            if let a = NSRunningApplication(processIdentifier: effectivePid) {
              a.activate(options: [.activateIgnoringOtherApps])
            }
          }
        }
        winFrame = f
        probe.setWindowFrame(f)
        break
      }
    }
    let st = probe.stats()
    if st.changedFrames > 0, epochMs() - st.lastChangeEpoch >= stableMs { break }
    Thread.sleep(forTimeInterval: 0.02)
  }
  let st = probe.stats()
  let diag = probe.diagnostics()
  await probe.stop()
  let tEnd = epochMs()
  guard let wf = winFrame else {
    out(["ok": false, "error": "\(Int(timeoutMs))ms 内未出现窗口（pid=\(effectivePid)）",
         "t0EpochMs": Int(tProbe), "elapsedMs": Int(tEnd - tProbe),
         "launchedPid": Int(launchedPid),
         "framesAll": st.framesAll, "framesInRoi": st.framesInRoi])
    return
  }
  let mainRect = CGRect(x: display.frame.minX, y: display.frame.minY,
                        width: display.frame.width, height: display.frame.height)
  let afterLaunch: (Double) -> Double = { e in tLaunch < 0 ? -1 : round((e - tLaunch) * 10) / 10 }
  out([
    "ok": true,
    "t0EpochMs": Int(tProbe),
    "launchEpochMs": tLaunch < 0 ? -1 : Int(tLaunch),
    "launchedPid": Int(launchedPid),
    // 负值 = 流在启动**之后**才就绪（做不到「从启动前捕获」，首绘可能已被错过）
    "streamBeforeLaunchMs": tLaunch < 0 ? -1 : round((tLaunch - tStream) * 10) / 10,
    "streamStartEpochMs": Int(tStream),
    "activateEpochMs": tActivate < 0 ? -1 : Int(tActivate),
    "activateAfterLaunchMs": tActivate < 0 ? -1 : afterLaunch(tActivate),
    "windowSeenEpochMs": Int(winSeenEpoch),
    "windowSeenMs": round((winSeenEpoch - tProbe) * 10) / 10,
    "windowSeenAfterLaunchMs": afterLaunch(winSeenEpoch),
    "contentFirstChangeMs": st.firstChangeEpoch < 0 ? -1 : round((st.firstChangeEpoch - tProbe) * 10) / 10,
    "contentFirstChangeAfterWindowMs": st.firstChangeEpoch < 0 ? -1 : round((st.firstChangeEpoch - winSeenEpoch) * 10) / 10,
    "contentFirstChangeAfterLaunchMs": st.firstChangeEpoch < 0 ? -1 : afterLaunch(st.firstChangeEpoch),
    // 最大变化时刻：首个变化可能是工具条/滚动条；「最大变化」更接近**正文绘制**。
    // 两个值都给出，避免把「第一次闪动」当成「内容可用」。
    "contentMaxChangeMs": st.maxFracEpoch < 0 ? -1 : round((st.maxFracEpoch - tProbe) * 10) / 10,
    "contentMaxChangeAfterWindowMs": st.maxFracEpoch < 0 ? -1 : round((st.maxFracEpoch - winSeenEpoch) * 10) / 10,
    "contentMaxChangeAfterLaunchMs": st.maxFracEpoch < 0 ? -1 : afterLaunch(st.maxFracEpoch),
    "contentStableMs": st.changedFrames > 0 ? round((st.lastChangeEpoch - tProbe + stableMs) * 10) / 10 : -1,
    "contentStableAfterWindowMs": st.changedFrames > 0 ? round((st.lastChangeEpoch - winSeenEpoch + stableMs) * 10) / 10 : -1,
    "contentStableAfterLaunchMs": st.changedFrames > 0 ? afterLaunch(st.lastChangeEpoch + stableMs) : -1,
    "changedFrames": st.changedFrames,
    "maxFrac": round(st.maxFrac * 100000) / 100000,
    "minFrac": minFrac,
    "framesAll": st.framesAll,
    "framesInRoi": st.framesInRoi,
    "frameW": st.frameW,
    "frameH": st.frameH,
    "roiPx": "\(Int(st.roi.minX)),\(Int(st.roi.minY)),\(Int(st.roi.width)),\(Int(st.roi.height))",
    "winFrame": "\(Int(wf.minX)),\(Int(wf.minY)),\(Int(wf.width)),\(Int(wf.height))",
    "displayFrame": "\(Int(mainRect.minX)),\(Int(mainRect.minY)),\(Int(mainRect.width)),\(Int(mainRect.height))",
    // 诊断（2026-11-08）：窗口几何变化轨迹 + 帧对变化比例 Top10（epoch ms 对齐 launchEpochMs）。
    // 用途：判断一次大变化是否被「几何变化清空基线」吞掉 —— 若 topFracs 里没有大比例，
    // 而 winFrameChanges 恰好落在首绘时刻附近，读数就不能当成「正文此时才画出」。
    "winFrameChanges": diag.geom,
    "topFracs": diag.fracTop,
    "elapsedMs": Int(tEnd - tProbe),
  ])
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

/// 激活目标并**确认它确实成为前台**，否则响亮失败。
///
/// 立此函数的原因（2026-09-25）：ScreenCaptureKit 对**被遮挡**的窗口只能拿到
/// **静止帧**，症状是 `detectMaxDiff=0` + `calibMaxDiff=0` 且
/// `frontmostPid != expectPid` —— 与「按键没落到编辑区」症状相同但成因完全不同。
/// 实测一次整批 0/6 有效样本（三个夹具各 0/2），失败信息只有一行 pid，
/// 排查方向被指向「焦点/按键」而不是「窗口被遮挡」。
/// 激活失败必须**响亮失败**并**指名当前前台应用**，不能静默产出 0 个有效样本。
func activateAppAndConfirm(pid: Int32, attempts: Int = 3) -> Bool {
  for i in 0..<attempts {
    activateApp(pid: pid)
    if NSWorkspace.shared.frontmostApplication?.processIdentifier == pid { return true }
    if i < attempts - 1 { Thread.sleep(forTimeInterval: 0.6) }
  }
  return NSWorkspace.shared.frontmostApplication?.processIdentifier == pid
}

/// 需要合成按键的命令统一走这里：确认前台 → 断言输入源为键盘布局。
/// 输入源是 IME 时按键会弹候选窗而不是回显文本，测出来的不是「编辑器回显」。
func activateAndEnsureInput(pid: Int32, ensureAscii: Bool) {
  guard activateAppAndConfirm(pid: pid) else {
    let front = NSWorkspace.shared.frontmostApplication
    let name = front?.localizedName ?? "?"
    let fpid = front?.processIdentifier ?? -1
    fail("目标进程 \(pid) 未能成为前台（当前前台：\(name) pid=\(fpid)）。"
      + "SCK 对**被遮挡**的窗口只能拿到静止帧，会产出 detectMaxDiff=0 的假失败（与「按键没进去」症状相同）。"
      + "请关闭抢占焦点的窗口后重试。")
  }
  guard ensureAscii else { return }
  if currentIsKeyboardLayout() { return }
  guard ensureAsciiInputSource() else {
    fail("当前输入源不是键盘布局，且切换到 com.apple.keylayout.ABC 失败 —— 合成按键会被 IME 拦截，该指标不可用")
  }
  Thread.sleep(forTimeInterval: 0.3) // 等输入源切换生效
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
func cmdStartupProbe(pid: Int32, roi: Roi, timeoutMs: Double, clickFocus: Bool = true, snapOnFail: String? = nil, roiFrac: [Double]? = nil, ensureAscii: Bool = false) async {
  guard AXIsProcessTrusted() else { fail("辅助功能权限未授予（System Settings → Privacy → Accessibility）") }
  // W-PERF-3 相位计时（2026-10-13，审计 §4.348）：`loadMs` 恒为 600ms 地板的根因是
  // 「**观测窗口开得太晚**」—— 本进程从**进入**到**拿到首帧**之间有一段死时间（激活应用 +
  // 解析 ROI + SCK 建流），而文档内容正是在这段死时间里画完的。把每个相位的**epoch 时刻**
  // 报给调用方，即可与「进程启动 / 窗口出现」对齐 ⇒ **死时间成为可测的量**（此前只能推断）。
  let tEntry = epochMs()
  activateAndEnsureInput(pid: pid, ensureAscii: ensureAscii)
  // ⚠️ 2026-10-13（审计 §4.348，**实测 16 样本**）：曾把上面这行 `activateAndEnsureInput`
  //   （实测 ≈1.4s）移到 `start()` **之后**，理由是「激活不是捕获的前置条件，却把观测窗口推迟了」。
  //   ⇒ **A/B 交替实测（同二进制、只换开关、各 8 样本）**：旧序 `changed>0` **1/8**、
  //     新序 **0/8** ⇒ **顺序不是决定因素**（甚至略差）⇒ **已回退**，不保留那个开关。
  //   ⇒ 真正的决定因素是「**内容绘制**是否落在**首帧**之后」—— 那是**竞态**，不是固定顺序。
  //     要让窗口必然前移，得让捕获在**窗口创建之前**就开始（SCK 按窗口捕获做不到，需改**显示器级**）。
  //   ⚠️ 注释**刻意放在调用之后**：台账护栏用「函数头起 900 字符窗口」锁这一行，
  //     把长注释放在**前面**会把这行挤出窗口 ⇒ 护栏**响亮红**（本机实测，那是对的）。
  let tActivate = epochMs()
  let probe = Probe()
  guard let (win, effRoi) = await resolveRoiForCapture(pid: pid, fallback: roi, roiFrac: roiFrac) else {
    fail("SCK 捕获启动失败（找不到 pid=\(pid) 的可捕获窗口，重试 3 次后）")
  }
  let tRoi = epochMs()
  do { try await probe.start(window: win, roi: effRoi) } catch { fail("SCK 捕获启动失败: \(error)") }
  let tFirstFrame = epochMs()
  let loadMs = probe.waitStable()
  let tStable = epochMs()
  let phaseLine = "phases: entry=\(Int(tEntry)) activate=\(Int(tActivate)) roi=\(Int(tRoi)) "
    + "firstFrame=\(Int(tFirstFrame)) stable=\(Int(tStable))\n"
  FileHandle.standardError.write(Data(phaseLine.utf8))
  // W-PERF-3 诊断字段（2026-10-01）：`loadMs` 恒为「等待画面静止」的 600ms 地板，
  // **不是加载耗时**；把本窗口内的观察统计一并报出，让「有没有东西可观察」成为可见事实。
  // 实测（1MB 双应用 + 10MB 共 8 样本）changedFrames **全为 0** —— 即窗口在 `waitStable`
  // 开始前就已绘制完成；这解释了为什么「改返回 lastChange」会退化成恒 0。
  let stableStats = probe.stableStats()
  // 强制聚焦编辑器（点击后光标闪烁被 calibrate 吸收）。
  // --no-click：WKWebView（Mellow）下合成点击会破坏 WebView 焦点协议，导致后续
  // 键盘事件全部丢失（2026-08-19 诊断）；WebView 启动自动持有焦点，无需点击。
  // 原生 app（Typora）光标默认在文档末尾，仍需点击把光标放到 ROI 顶部区域。
  if clickFocus {
    clickToFocus(win, roi: effRoi)
  }
  let cal = probe.calibrateRetry()
  let t0 = nowMs()
  // 回显判据改用**比例**（2026-09-28，见 ECHO_MIN_FRAC 注释）：
  // 绝对地板 60 恰好压在真实信号（实测 59）之上，会把「已回显」误判为「未回显」。
  probe.setFracOverride(ECHO_MIN_FRAC)
  postKey(0x00) // 'a'
  let r = probe.detectChange(timeoutMs: timeoutMs)
  probe.setFracOverride(nil)
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
    // 比例判据的自证（2026-09-28）：只报绝对点数看不出「信号是否真的远高于判据」。
    "detectMaxFrac": (round(ds.maxFrac * 100000) / 100000),
    "echoMinFrac": ECHO_MIN_FRAC,
    "detectDimMismatchFrames": ds.dimMismatch,
    "frontmostPid": Int(front),
    "expectPid": Int(pid),
    // effRoi 是**实际生效**的 ROI（按捕获窗口求得），不是调用方传入的那个 ——
    // 两者不一致正是本 bug 的形态，必须分别可见。
    "roi": "\(Int(effRoi.x)),\(Int(effRoi.y)),\(Int(effRoi.w)),\(Int(effRoi.h))",
    "winFrame": "\(Int(win.frame.origin.x)),\(Int(win.frame.origin.y)),\(Int(win.frame.width)),\(Int(win.frame.height))",
    "roiSource": roiFrac == nil ? "absolute" : "frac",
    // W-PERF-3 诊断（2026-10-01）：这三个值让「loadMs 为什么是常量」可被逐样本核对。
    "stableFramesSeen": stableStats.framesSeen,
    "stableChangedFrames": stableStats.changedFrames,
    "stableFirstChangeMs": round(stableStats.firstChangeMs * 10) / 10,
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
      // 两种成因必须分开（2026-09-28）：判据是比例阈值时，「差一点没到」与
      // 「校准被噪声抬高」是不同问题。实测过一次 `detectMaxDiff=59 / threshold=60`
      // （信号与判据同量级）→ 那是**判据设计问题**，不是噪声问题，提示不该指向噪声。
      hint = ds.maxFrac > 0 && ds.maxFrac < ECHO_MIN_FRAC * 3
        ? "有变化但未跨比例阈值（detectMaxFrac 与判据同量级 → 判据可能压在信号量级上，需复核 ECHO_MIN_FRAC）"
        : "有变化但未跨阈值（detectMaxDiff < threshold → 校准被动画噪声抬高）"
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
    probe.setFracOverride(ECHO_MIN_FRAC) // 同 startup-probe：绝对地板 60 压在信号量级上
    postKey(0x00) // 'a'
    let r = probe.detectChange(timeoutMs: timeoutMs)
    probe.setFracOverride(nil)
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
    "echoDetectMaxFrac": (round(echoStats.maxFrac * 100000) / 100000),
    "echoMinFrac": ECHO_MIN_FRAC,
    "echoDimMismatchFrames": echoStats.dimMismatch,
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
  // 逐键回显必须与 startup-probe / hot-open 用**同一个比例判据**（2026-09-28）。
  //
  // 这是同一母题的第三处：每次按键只插入**一个字符**，在 576×96 的 ROI 上约产生
  // 59 个变化采样点，与绝对地板 60 **同量级** → 一部分按键被判为「未回显」，
  // 于是 `latencies` 里混入 -1（超时），**P95 被污染**（PRD §110 的
  // 「Input P95 update < 16ms / Large < 32ms」正是读这个 P95）。
  // 前两处（startup-probe 的回显、hot-open 的回显）已修；这里不修就等于没修完。
  probe.setFracOverride(ECHO_MIN_FRAC)
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
  probe.setFracOverride(nil)
  await probe.stop()
  out(["ok": true, "truncated": consecutiveTimeout >= 8, "calibMaxDiff": cal.max, "threshold": cal.threshold, "echoMinFrac": ECHO_MIN_FRAC, "latencies": latencies])
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
  case "frontmost":
    // 当前前台应用（2026-09-25）。
    //
    // 立此命令的原因：**屏幕锁定/屏保激活时 `loginwindow` 成为前台**，此时任何应用都
    // 无法被激活 → SCK 对被遮挡窗口只能拿到静止帧 → 整批样本以
    // `detectMaxDiff=0 calibMaxDiff=0` 静默失败（实测一次 0/6，失败信息只有一行 pid）。
    // runner 必须能在开跑前就拒绝，而不是产出「0 个有效样本」的报告。
    if let front = NSWorkspace.shared.frontmostApplication {
      out([
        "ok": true,
        "pid": Int(front.processIdentifier),
        "name": front.localizedName ?? "",
        "bundleId": front.bundleIdentifier ?? "",
        // 锁屏/屏保的判据：前台是 loginwindow（或无可激活应用）
        "isLockScreen": (front.bundleIdentifier ?? "").contains("loginwindow")
          || (front.localizedName ?? "").lowercased() == "loginwindow",
      ])
    } else {
      out(["ok": false, "error": "无法取得前台应用", "isLockScreen": true])
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
  case "startup-watch":
    let pid = Int32(argVal(args, "--pid") ?? "") ?? -1
    let timeout = Double(argVal(args, "--timeout") ?? "20000") ?? 20000
    let stableMs = Double(argVal(args, "--stable-ms") ?? "400") ?? 400
    let minFrac = Double(argVal(args, "--min-frac") ?? "0.001") ?? 0.001
    let swRoiFrac = argVal(args, "--roi-frac").map { s in s.split(separator: ",").compactMap { Double($0) } }
    await cmdStartupWatch(pid: pid, roiFrac: swRoiFrac, timeoutMs: timeout, stableMs: stableMs, minFrac: minFrac,
                          launchBin: argVal(args, "--launch-bin"), launchArgs: argVals(args, "--launch-arg"),
                          activate: args.contains("--activate"))
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
