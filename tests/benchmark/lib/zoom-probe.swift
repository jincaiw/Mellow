/**
 * zoom-probe —— 字体缩放真机视觉实证工具（B1-1）。
 *
 * 用法：
 *   swift zoom-probe.swift window <pid>                  # 打印主窗口 frame（Ax,BottomLeft 系 → screencapture 顶左系换算）
 *   swift zoom-probe.swift bands <img.png> <x> <y> <w> <h> [<darkMax>]   # ROI 墨迹带分析：输出文本行高度序列
 *
 * bands 逻辑：逐行统计「暗像素」（lum < darkMax，默认 120）占比 ≥3% 视为墨迹行；
 * 连续墨迹行合并为 band，band 高度 ≈ 文本行字面高度。字号 17→24 时 band 高度应明显增大。
 */
import Foundation
import CoreGraphics
import ImageIO

func fail(_ msg: String) -> Never {
  print("ERROR: \(msg)")
  exit(1)
}

func windowFrame(pid: Int32) {
  guard let infos = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
    fail("CGWindowListCopyWindowInfo failed")
  }
  var best: (CGRect, Int, Int)? = nil
  for info in infos {
    guard let ownerPid = info[kCGWindowOwnerPID as String] as? Int32, ownerPid == pid else { continue }
    guard let boundsDict = info[kCGWindowBounds as String] as? [String: Any] else { continue }
    let x = boundsDict["X"] as? CGFloat ?? 0
    let y = boundsDict["Y"] as? CGFloat ?? 0
    let w = boundsDict["Width"] as? CGFloat ?? 0
    let h = boundsDict["Height"] as? CGFloat ?? 0
    guard w > 300, h > 300 else { continue }
    let layer = info[kCGWindowLayer as String] as? Int ?? 0
    let winId = info[kCGWindowNumber as String] as? Int ?? 0
    let rect = CGRect(x: x, y: y, width: w, height: h)
    if best == nil || rect.width * rect.height > best!.0.width * best!.0.height {
      best = (rect, layer, winId)
    }
  }
  guard let (rect, _, winId) = best else { fail("no window for pid \(pid)") }
  // screencapture -R 使用顶左原点坐标（CGWindowList 同为顶左），直接输出
  print(String(format: "windowId=%d x=%.0f y=%.0f w=%.0f h=%.0f", winId, rect.origin.x, rect.origin.y, rect.width, rect.height))
}

func bands(path: String, roi: CGRect, darkMax: Int) {
  guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
        let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
    fail("cannot load \(path)")
  }
  let w = img.width, h = img.height
  // 裁剪 ROI（clamp 到图像范围）
  let rx = Int(max(0, min(CGFloat(w) - 1, roi.minX)))
  let ry = Int(max(0, min(CGFloat(h) - 1, roi.minY)))
  let rw = Int(max(1, min(CGFloat(w) - CGFloat(rx), roi.width)))
  let rh = Int(max(1, min(CGFloat(h) - CGFloat(ry), roi.height)))
  guard let cropped = img.cropping(to: CGRect(x: rx, y: ry, width: rw, height: rh)) else {
    fail("crop failed")
  }
  let cw = cropped.width, ch = cropped.height
  let ctx = CGContext(data: nil, width: cw, height: ch, bitsPerComponent: 8, bytesPerRow: cw * 4,
                      space: CGColorSpaceCreateDeviceRGB(),
                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.draw(cropped, in: CGRect(x: 0, y: 0, width: cw, height: ch))
  guard let data = ctx.data else { fail("no bitmap") }
  let px = data.bindMemory(to: UInt8.self, capacity: cw * ch * 4)

  var inkRows: [Bool] = []
  for row in 0..<ch {
    var dark = 0
    for col in 0..<cw {
      let i = (row * cw + col) * 4
      let lum = (Int(px[i]) + Int(px[i + 1]) + Int(px[i + 2])) / 3
      if lum < darkMax { dark += 1 }
    }
    inkRows.append(Double(dark) / Double(cw) >= 0.03)
  }
  // 合并 band
  var bandHeights: [Int] = []
  var run = 0
  for ink in inkRows {
    if ink { run += 1 } else {
      if run > 0 { bandHeights.append(run) }
      run = 0
    }
  }
  if run > 0 { bandHeights.append(run) }
  // 过滤 1px 噪声带
  let bands_ = bandHeights.filter { $0 >= 3 }
  print("bands=\(bands_) count=\(bands_.count) avg=\(bands_.isEmpty ? 0 : Double(bands_.reduce(0, +)) / Double(bands_.count))")
}

func diff(_ a: String, _ b: String) {
  func load(_ p: String) -> (CGImage, Int, Int) {
    guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: p) as CFURL, nil),
          let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { fail("cannot load \(p)") }
    return (img, img.width, img.height)
  }
  let (ia, wa, ha) = load(a)
  let (ib, wb, hb) = load(b)
  guard wa == wb, ha == hb else { fail("size mismatch \(wa)x\(ha) vs \(wb)x\(hb)") }
  let ctxA = CGContext(data: nil, width: wa, height: ha, bitsPerComponent: 8, bytesPerRow: wa * 4,
                       space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctxA.draw(ia, in: CGRect(x: 0, y: 0, width: wa, height: ha))
  let ctxB = CGContext(data: nil, width: wb, height: hb, bitsPerComponent: 8, bytesPerRow: wb * 4,
                       space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctxB.draw(ib, in: CGRect(x: 0, y: 0, width: wb, height: hb))
  guard let da = ctxA.data, let db = ctxB.data else { fail("no bitmap") }
  let pa = da.bindMemory(to: UInt8.self, capacity: wa * ha * 4)
  let pb = db.bindMemory(to: UInt8.self, capacity: wb * hb * 4)
  var changed = 0
  var minX = wa, maxX = 0, minY = ha, maxY = 0
  for y in 0..<ha {
    for x in 0..<wa {
      let i = (y * wa + x) * 4
      let d = abs(Int(pa[i]) - Int(pb[i])) + abs(Int(pa[i+1]) - Int(pb[i+1])) + abs(Int(pa[i+2]) - Int(pb[i+2]))
      if d > 24 {
        changed += 1
        if x < minX { minX = x }; if x > maxX { maxX = x }
        if y < minY { minY = y }; if y > maxY { maxY = y }
      }
    }
  }
  let total = wa * ha
  if changed == 0 {
    print("identical")
  } else {
    print(String(format: "changed=%d (%.2f%%) bounds=(%d,%d)-(%d,%d)", changed, Double(changed) * 100 / Double(total), minX, minY, maxX, maxY))
  }
}

let args = CommandLine.arguments
guard args.count >= 2 else { fail("usage: zoom-probe.swift window <pid> | bands <img> <x> <y> <w> <h> [darkMax] | diff <a> <b>") }
switch args[1] {
case "window":
  guard args.count >= 3, let pid = Int32(args[2]) else { fail("bad pid") }
  windowFrame(pid: pid)
case "bands":
  guard args.count >= 7,
        let x = Double(args[3]), let y = Double(args[4]),
        let w = Double(args[5]), let h = Double(args[6]) else { fail("bad args") }
  let darkMax = args.count >= 8 ? (Int(args[7]) ?? 120) : 120
  bands(path: args[2], roi: CGRect(x: x, y: y, width: w, height: h), darkMax: darkMax)
case "diff":
  guard args.count >= 4 else { fail("diff <a.png> <b.png>") }
  diff(args[2], args[3])
default:
  fail("unknown mode \(args[1])")
}
