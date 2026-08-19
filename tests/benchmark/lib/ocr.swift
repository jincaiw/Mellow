#!/usr/bin/env swift
// OCR 读取屏幕截图文字（Vision framework）—— 无头验证窗口内容
import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count >= 2 else { print("{\"error\":\"usage: ocr <image.png>\"}"); exit(1) }
let path = args[1]

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

let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
print(lines.joined(separator: "\n"))
