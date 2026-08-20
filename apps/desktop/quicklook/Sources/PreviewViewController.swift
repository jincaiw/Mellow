/**
 * Mellow QuickLook Preview Extension（PRD §82 / B4）。
 *
 * 架构（MarkEdit 同构）：appex 内 WKWebView 加载打包的 CoreEditor quicklook bundle
 * （Host.quicklook → setUpQuickLook 只读编辑器，跟随系统亮暗主题），
 * preparePreviewOfFile 读取 .md 文本后经 evaluateJavaScript dispatch 注入。
 *
 * - 无 XIB / Storyboard：loadView 纯代码创建 WKWebView；
 * - HTML 加载与文本注入时序：pendingText 缓冲 + didCommit/finish 回调注入；
 * - 数学/Mermaid：CoreEditor 源码视图渲染（B4 范围内不做富渲染）。
 */

import Cocoa
import Quartz
import WebKit

final class PreviewViewController: NSViewController, QLPreviewingController {

    private var webView: WKWebView?
    private var htmlLoaded = false
    private var pendingText: String?
    private var pendingCompletion: ((Error?) -> Void)?

    override func loadView() {
        let config = WKWebViewConfiguration()
        // QuickLook 沙盒内禁脚本消息与跳转（H2 纵深防御：预览不执行外部内容）
        config.preferences.javaScriptEnabled = true
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = self
        self.webView = view
        self.view = view
    }

    // MARK: - QLPreviewingController

    func preparePreviewOfFile(at url: URL, completionHandler handler: @escaping (Error?) -> Void) {
        guard let webView = webView else {
            handler(QuickLookError.viewUnavailable)
            return
        }
        let text: String
        do {
            // 大文件防线：> 4MB 直接降级为系统纯文本预览（性能预算，j17 教训）
            let size = (try url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            if size > 4 * 1024 * 1024 {
                handler(QuickLookError.fileTooLarge)
                return
            }
            text = try String(contentsOf: url, encoding: .utf8)
        } catch {
            handler(error)
            return
        }

        if htmlLoaded {
            inject(text: text, completion: handler)
            return
        }

        pendingText = text
        pendingCompletion = handler
        guard let htmlURL = Bundle.main.url(forResource: "quicklook", withExtension: "html") else {
            pendingText = nil
            pendingCompletion = nil
            handler(QuickLookError.bundleMissing)
            return
        }
        webView.loadFileURL(htmlURL, allowingReadAccessTo: htmlURL.deletingLastPathComponent())
    }

    // MARK: - 文本注入

    private func inject(text: String, completion: @escaping (Error?) -> Void) {
        guard let webView = webView else {
            completion(QuickLookError.viewUnavailable)
            return
        }
        let encoded: String
        if let data = try? JSONSerialization.data(withJSONObject: [text], options: []) {
            // ["..."] → 取 JSON 数组首元素字面量（含引号），JS 侧无需再转义
            let literal = String(data: data, encoding: .utf8) ?? "\"\""
            let inner = literal.dropFirst().dropLast()
            encoded = String(inner)
        } else {
            encoded = "\"\""
        }
        let js = """
        (() => {
          const view = window.editor;
          if (!view) return 'no-editor';
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: \(encoded) } });
          return 'ok';
        })();
        """
        webView.evaluateJavaScript(js) { _, error in
            completion(error)
        }
    }
}

// MARK: -

/// WKWebView 导航完成 → 注入缓冲文本（QL 面板复用同一 WebView，仅首次加载 HTML）
extension PreviewViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard !htmlLoaded else { return }
        htmlLoaded = true
        if let text = pendingText {
            let completion = pendingCompletion
            pendingText = nil
            pendingCompletion = nil
            if let completion = completion {
                inject(text: text, completion: completion)
            }
        }
    }
}

enum QuickLookError: LocalizedError {
    case viewUnavailable
    case bundleMissing
    case fileTooLarge

    var errorDescription: String? {
        switch self {
        case .viewUnavailable: return "QuickLook web view unavailable"
        case .bundleMissing: return "quicklook.html not found in extension bundle"
        case .fileTooLarge: return "File exceeds 4MB preview limit"
        }
    }
}
