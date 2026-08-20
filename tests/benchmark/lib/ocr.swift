#!/usr/bin/env swift
// OCR 读取屏幕截图文字（Vision framework）—— 无头验证窗口内容
// 用法:
//   ocr <image.png>            仅输出文字行
//   ocr <image.png> --boxes    输出 "text|left,top,width,height"（屏幕像素，左上原点）
import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count >= 2 else { print("{\"error\":\"usage: ocr <image.png> [--boxes]\"}"); exit(1) }
let path = args[1]
let withBoxes = args.contains("--boxes")

guard let img = NSImage(contentsOfFile: path),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  print("{\"error\":\"cannot load image\"}"); exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans", "en-US"]
request.usesLanguageCorrection = false

let handler = VNImageRequestHandler(cgImage: cg, options: [:])
try? handler.perform([request])

let imgW = CGFloat(cg.width)
let imgH = CGFloat(cg.height)

for obs in (request.results ?? []) {
  guard let cand = obs.topCandidates(1).first else { continue }
  if withBoxes {
    // Vision bbox：归一化、左下原点 → 屏幕像素、左上原点
    let b = obs.boundingBox
    let left = Int((b.origin.x * imgW).rounded())
    let top = Int(((1 - b.origin.y - b.height) * imgH).rounded())
    let w = Int((b.width * imgW).rounded())
    let h = Int((b.height * imgH).rounded())
    print("\(cand.string)|\(left),\(top),\(w),\(h)")
  } else {
    print(cand.string)
  }
}
