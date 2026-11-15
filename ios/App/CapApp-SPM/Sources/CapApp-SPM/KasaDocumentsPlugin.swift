import Foundation
import UIKit
import UniformTypeIdentifiers
import Capacitor

/// User-selected document access and system sharing only; never accepts arbitrary paths or URLs.
@objc(KasaDocumentsPlugin)
public final class KasaDocumentsPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "KasaDocumentsPlugin"
    public let jsName = "KasaDocuments"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "exportBackup", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "importBackup", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exportFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "printReport", returnType: CAPPluginReturnPromise)
    ]
    private var activeCall: CAPPluginCall?
    private let ioQueue = DispatchQueue(label: "com.fevzicakmak.bhu.documents")
    private let backupLimit = 25 * 1024 * 1024

    private func begin(_ call: CAPPluginCall) -> UIViewController? {
        guard activeCall == nil else { call.reject("Başka bir dosya işlemi açık.", "DOCUMENT_BUSY"); return nil }
        guard let controller = bridge?.viewController, controller.presentedViewController == nil else {
            call.reject("Önce açık sistem penceresini kapatın.", "DOCUMENT_PRESENTATION_BUSY"); return nil
        }
        activeCall = call
        return controller
    }
    private func safeName(_ name: String, fallback: String) -> String {
        let leaf = (name.replacingOccurrences(of: "\\", with: "/") as NSString).lastPathComponent
        let clean = String(leaf.filter { character in character.unicodeScalars.allSatisfy { !CharacterSet.controlCharacters.contains($0) } }.prefix(120))
        return clean.isEmpty || clean == "." || clean == ".." ? fallback : clean
    }
    private func finish(_ call: CAPPluginCall, status: String) {
        activeCall = nil; call.resolve(["status": status])
    }
    private func share(_ bytes: Data, fileName: String, call: CAPPluginCall) {
        DispatchQueue.main.async { [self] in
            guard let controller = begin(call) else { return }
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("KasaExport-\(UUID().uuidString)", isDirectory: true)
            ioQueue.async { [self] in
                do {
                    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                        attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
                    let url = directory.appendingPathComponent(fileName, isDirectory: false)
                    try bytes.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                    DispatchQueue.main.async { [self] in
                        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                        sheet.completionWithItemsHandler = { [weak self] _, completed, _, error in
                            guard let self else { return }
                            try? FileManager.default.removeItem(at: directory)
                            self.activeCall = nil
                            if let error { call.reject("Paylaşım tamamlanamadı.", "DOCUMENT_SHARE_FAILED", error) }
                            else { call.resolve(["status": completed ? "shared" : "cancelled"]) }
                        }
                        if let popover = sheet.popoverPresentationController {
                            popover.sourceView = controller.view
                            popover.sourceRect = CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.midY, width: 1, height: 1)
                            popover.permittedArrowDirections = []
                        }
                        controller.present(sheet, animated: true)
                    }
                } catch {
                    try? FileManager.default.removeItem(at: directory)
                    DispatchQueue.main.async { [self] in activeCall = nil; call.reject("Dosya hazırlanamadı.", "DOCUMENT_WRITE_FAILED", error) }
                }
            }
        }
    }
    @objc public func exportBackup(_ call: CAPPluginCall) {
        guard let raw = call.getString("data"), let bytes = raw.data(using: .utf8), bytes.count <= backupLimit else {
            call.reject("Yedek verisi geçersiz veya 25 MB sınırını aşıyor.", "DOCUMENT_INVALID_DATA"); return
        }
        var name = safeName(call.getString("fileName") ?? "kasa-pro-yedek.json", fallback: "kasa-pro-yedek.json")
        if !name.lowercased().hasSuffix(".json") { name += ".json" }
        share(bytes, fileName: name, call: call)
    }
    @objc public func exportFile(_ call: CAPPluginCall) {
        guard let encoded = call.getString("dataBase64"), encoded.utf8.count <= 12 * 1024 * 1024,
            let bytes = Data(base64Encoded: encoded), bytes.count <= 8 * 1024 * 1024 else {
            call.reject("Belge verisi geçersiz veya 8 MB sınırını aşıyor.", "DOCUMENT_INVALID_DATA"); return
        }
        share(bytes, fileName: safeName(call.getString("fileName") ?? "belge", fallback: "belge"), call: call)
    }
    @objc public func importBackup(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [self] in
            guard let controller = begin(call) else { return }
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.json], asCopy: true)
            picker.delegate = self; picker.allowsMultipleSelection = false
            controller.present(picker, animated: true)
        }
    }
    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        guard let call = activeCall else { return }; finish(call, status: "cancelled")
    }
    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = activeCall else { return }
        guard let url = urls.first else { finish(call, status: "cancelled"); return }
        ioQueue.async { [self] in
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            do {
                let resource = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
                guard resource.isRegularFile == true, let size = resource.fileSize, size <= backupLimit else {
                    throw NSError(domain: "KasaDocuments", code: 1, userInfo: [NSLocalizedDescriptionKey: "Yedek 25 MB sınırını aşıyor veya dosya değil."])
                }
                let bytes = try Data(contentsOf: url)
                guard bytes.count <= backupLimit, let raw = String(data: bytes, encoding: .utf8) else {
                    throw NSError(domain: "KasaDocuments", code: 2, userInfo: [NSLocalizedDescriptionKey: "Yedek UTF-8 metin olarak okunamadı."])
                }
                DispatchQueue.main.async { [self] in
                    activeCall = nil; call.resolve(["status": "selected", "data": raw, "fileName": url.lastPathComponent])
                }
            } catch {
                DispatchQueue.main.async { [self] in activeCall = nil; call.reject("Yedek dosyası okunamadı.", "DOCUMENT_READ_FAILED", error) }
            }
        }
    }
    @objc public func printReport(_ call: CAPPluginCall) {
        guard let html = call.getString("html"), html.utf8.count <= 4 * 1024 * 1024 else {
            call.reject("Yazdırma içeriği geçersiz veya çok büyük.", "PRINT_INVALID_DATA"); return
        }
        // Keep the native formatter offline. User text is escaped before this call.
        let unsafeMarkup = #"(?is)<\s*(script|iframe|img|link|object|embed|video|audio|base)\b|<[^>]+\b(src|href)\s*=|<style[^>]*>.*?(@import|url\s*\()|<[^>]+\bstyle\s*=[^>]*url\s*\("#
        if html.range(of: unsafeMarkup, options: .regularExpression) != nil {
            call.reject("Yazdırma yalnızca çevrimdışı tablo içeriğini destekler.", "PRINT_UNSAFE_MARKUP"); return
        }
        DispatchQueue.main.async { [self] in
            guard UIPrintInteractionController.isPrintingAvailable else { call.reject("Bu cihazda yazdırma kullanılamıyor.", "PRINT_UNAVAILABLE"); return }
            guard let controller = begin(call) else { return }
            let printer = UIPrintInteractionController.shared
            let info = UIPrintInfo.printInfo()
            info.jobName = String((call.getString("jobName") ?? "Kasa Pro Hesap Raporu").prefix(120)); info.outputType = .general
            printer.printInfo = info; printer.printFormatter = UIMarkupTextPrintFormatter(markupText: html)
            let completion: UIPrintInteractionController.CompletionHandler = { [weak self] _, completed, error in
                guard let self else { return }; self.activeCall = nil
                if let error { call.reject("Yazdırma tamamlanamadı.", "PRINT_FAILED", error) }
                else { call.resolve(["status": completed ? "printed" : "cancelled"]) }
            }
            if UIDevice.current.userInterfaceIdiom == .pad {
                printer.present(from: CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.midY, width: 1, height: 1), in: controller.view, animated: true, completionHandler: completion)
            } else { printer.present(animated: true, completionHandler: completion) }
        }
    }
}
