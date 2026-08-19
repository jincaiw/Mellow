#!/usr/bin/env swift
/**
 * select-input — 通过 Carbon TIS API 选择输入源（Golden Journeys j2 IME 前置）。
 *
 * 用法：select-input com.apple.inputmethod.SCIM.ITABC
 * 退出码：0 = 切换成功；1 = 未找到 / 切换失败
 */
import Foundation
import Carbon

let args = CommandLine.arguments
guard args.count >= 2 else {
  FileHandle.standardError.write("usage: select-input <input-source-id>\n".data(using: .utf8)!)
  exit(1)
}
let target = args[1]

let props = [kTISPropertyInputSourceID as String: target] as CFDictionary
guard let list = TISCreateInputSourceList(props, false)?.takeRetainedValue() as? [TISInputSource],
      let src = list.first else {
  FileHandle.standardError.write("input source not found: \(target)\n".data(using: .utf8)!)
  exit(1)
}

if TISSelectInputSource(src) == noErr {
  print("ok \(target)")
} else {
  FileHandle.standardError.write("TISSelectInputSource failed: \(target)\n".data(using: .utf8)!)
  exit(1)
}
