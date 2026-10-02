// Print a page through WebKit (the Safari engine) to PDF, with the default macOS
// print settings: US Letter and the default margins. Headless Chrome cannot show
// a Safari print defect; this tool can. Example: a masked image prints as a
// black box in WebKit only.
//
// Usage (macOS, needs the site on a local server):
//   swiftc -O -o /tmp/print_webkit scripts/print_webkit.swift
//   /tmp/print_webkit http://localhost:4173/ /tmp/resume-webkit.pdf
import AppKit
import WebKit

let args = CommandLine.arguments
guard args.count == 3, let url = URL(string: args[1]) else {
  print("usage: print_webkit URL OUTPUT.pdf"); exit(2)
}
let out = URL(fileURLWithPath: args[2])
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)

final class Printer: NSObject, WKNavigationDelegate {
  let window: NSWindow
  init(window: NSWindow) { self.window = window }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    // Wait for fonts and images, then print once.
    DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
      let info = NSPrintInfo.shared.copy() as! NSPrintInfo
      info.paperSize = NSSize(width: 612, height: 792)
      info.jobDisposition = .save
      info.dictionary()[NSPrintInfo.AttributeKey.jobSavingURL] = out
      let op = webView.printOperation(with: info)
      op.showsPrintPanel = false
      op.showsProgressPanel = false
      op.view?.frame = NSRect(x: 0, y: 0, width: 1000, height: 800)
      op.runModal(for: self.window, delegate: nil, didRun: nil, contextInfo: nil)
      DispatchQueue.main.asyncAfter(deadline: .now() + 4) { print("wrote \(out.path)"); exit(0) }
    }
  }
}

let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1200, height: 900), styleMask: [.titled], backing: .buffered, defer: false)
let config = WKWebViewConfiguration()
config.websiteDataStore = .nonPersistent() // no cached CSS from an earlier run
let webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
window.contentView!.addSubview(webView)
let printer = Printer(window: window)
webView.navigationDelegate = printer
webView.load(URLRequest(url: url))
DispatchQueue.main.asyncAfter(deadline: .now() + 30) { print("timeout"); exit(1) }
app.run()
