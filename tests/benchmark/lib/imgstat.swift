import Foundation
import CoreGraphics
import ImageIO

let path = CommandLine.arguments[1]
let url = URL(fileURLWithPath: path)
guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
      let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
  print("cannot load")
  exit(1)
}
let w = img.width, h = img.height
let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                    space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
guard let data = ctx.data else { exit(1) }
let px = data.bindMemory(to: UInt8.self, capacity: w * h * 4)
var dark = 0, mid = 0, bright = 0
for i in stride(from: 0, to: w * h * 4, by: 4) {
  let lum = (Int(px[i]) + Int(px[i + 1]) + Int(px[i + 2])) / 3
  if lum < 30 { dark += 1 } else if lum < 160 { mid += 1 } else { bright += 1 }
}
let total = w * h
print("size \(w)x\(h) dark=\(dark * 100 / total)% mid=\(mid * 100 / total)% bright=\(bright * 100 / total)%")
