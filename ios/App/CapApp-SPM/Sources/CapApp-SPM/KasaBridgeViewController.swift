import Capacitor
import UIKit
import WebKit

@objc public final class KasaBridgeViewController: CAPBridgeViewController {
    private var loadingObservation: NSKeyValueObservation?
    private var lastAppliedInsets: UIEdgeInsets?
    #if DEBUG
    private var diagnosticGeneration = 0
    #endif

    public override func capacitorDidLoad() {
        bridge?.registerPluginInstance(KasaStoragePlugin())
        bridge?.registerPluginInstance(KasaDocumentsPlugin())
        bridge?.registerPluginInstance(KasaPurchasesPlugin())
        // A navigation replaces document styles. Reapply UIKit's current safe
        // area once that document is ready, including after a WebKit reload.
        loadingObservation = webView?.observe(\.isLoading, options: [.new]) { [weak self] webView, _ in
            if !webView.isLoading { self?.applySafeAreaInsets(force: true) }
        }
    }

    public override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        applySafeAreaInsets(force: true)
    }

    public override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        applySafeAreaInsets()
    }

    public override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        applySafeAreaInsets()
    }

    private func applySafeAreaInsets(force: Bool = false) {
        guard isViewLoaded, let window = view.window, let webView = webView,
              webView.bounds.width > 0, webView.bounds.height > 0 else { return }
        let safe = webView.convert(window.safeAreaLayoutGuide.layoutFrame, from: window)
        guard safe.width > 0, safe.height > 0 else { return }
        let insets = UIEdgeInsets(top: max(0, safe.minY), left: max(0, safe.minX),
            bottom: max(0, webView.bounds.height - safe.maxY), right: max(0, webView.bounds.width - safe.maxX))
        guard force || lastAppliedInsets != insets else { return }
        lastAppliedInsets = insets
        // WKWebView can report zero CSS env insets on a later cold launch even
        // though UIKit still has the Dynamic Island/home-indicator safe area.
        // Supply real device values; the web build keeps its normal env fallback.
        let script = """
        (() => {
          const root = document.documentElement;
          if (!root) return;
          root.style.setProperty('--bhu-safe-top', '\(insets.top)px');
          root.style.setProperty('--bhu-safe-right', '\(insets.right)px');
          root.style.setProperty('--bhu-safe-bottom', '\(insets.bottom)px');
          root.style.setProperty('--bhu-safe-left', '\(insets.left)px');
        })();
        """
        #if DEBUG
        if ProcessInfo.processInfo.environment["BHU_LAYOUT_DIAGNOSTICS"] == "1" {
            webView.evaluateJavaScript(script) { [weak self] _, error in
                if error == nil { self?.scheduleLayoutDiagnostics() }
            }
            return
        }
        #endif
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    #if DEBUG
    /// Opt-in CI geometry only: no account values, DOM text or user identifiers.
    /// Sampling never refreshes insets, forces UIKit layout or changes the DOM.
    private func scheduleLayoutDiagnostics() {
        diagnosticGeneration += 1
        let generation = diagnosticGeneration
        let deadline = Date().addingTimeInterval(90)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
            self?.measureLayout(generation: generation, deadline: deadline, readySamplesLeft: 5)
        }
    }

    private func measureLayout(generation: Int, deadline: Date, readySamplesLeft: Int) {
        guard diagnosticGeneration == generation, Date() < deadline,
              let webView = webView, let window = webView.window,
              webView.bounds.width > 0, webView.bounds.height > 0 else { return }
        let safe = webView.convert(window.safeAreaLayoutGuide.layoutFrame, from: window)
        let native = window.safeAreaInsets
        let script = """
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const rect = (element, id) => {
          const r = element.getBoundingClientRect();
          return {id, top:r.top, right:r.right, bottom:r.bottom, left:r.left};
        };
        const controls = [];
        const brand = document.querySelector('.brand');
        if (brand) controls.push(rect(brand, 'brand'));
        document.querySelectorAll('.header-actions button').forEach((element, index) => controls.push(rect(element, 'header-' + index)));
        document.querySelectorAll('.bottom-nav .nav-item').forEach((element, index) => controls.push(rect(element, 'nav-' + index)));
        const scale = innerWidth / \(webView.bounds.width);
        return {
          ready:document.readyState === 'complete' && !document.querySelector('#app-loading') && !document.querySelector('#app[inert]'),
          viewport:{width:innerWidth, height:innerHeight},
          safe:{top:\(safe.minY)*scale, right:\(safe.maxX)*scale, bottom:\(safe.maxY)*scale, left:\(safe.minX)*scale},
          nativeWindowInsets:{top:\(native.top), right:\(native.right), bottom:\(native.bottom), left:\(native.left)},
          controls
        };
        """
        webView.callAsyncJavaScript(script, arguments: [:], in: nil, in: .page) { [weak self] result in
            guard let self = self, self.diagnosticGeneration == generation else { return }
            var ready = false
            if case .success(let value) = result, JSONSerialization.isValidJSONObject(value),
               let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
               let json = String(data: data, encoding: .utf8) {
                CAPLog.print("BHU_LAYOUT " + json)
                ready = (value as? [String: Any])?["ready"] as? Bool == true
            }
            let remaining = readySamplesLeft - (ready ? 1 : 0)
            if remaining > 0, Date() < deadline {
                DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
                    self?.measureLayout(generation: generation, deadline: deadline, readySamplesLeft: remaining)
                }
            }
        }
    }
    #endif
}
