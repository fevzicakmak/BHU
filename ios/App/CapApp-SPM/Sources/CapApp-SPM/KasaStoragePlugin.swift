import Foundation
import Capacitor

/// Durable app-owned storage. A failed comparison never replaces the saved snapshot.
@objc(KasaStoragePlugin)
public final class KasaStoragePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KasaStoragePlugin"
    public let jsName = "KasaStorage"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise)
    ]
    private let queue = DispatchQueue(label: "com.fevzicakmak.bhu.storage")
    private let maximumBytes = 32 * 1024 * 1024

    private func stateURL() throws -> URL {
        let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let directory = support.appendingPathComponent("KasaPro", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        return directory.appendingPathComponent("state.json", isDirectory: false)
    }
    private func readRaw(_ url: URL) throws -> String? {
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        let bytes = try Data(contentsOf: url)
        guard bytes.count <= maximumBytes, let raw = String(data: bytes, encoding: .utf8) else {
            throw NSError(domain: "KasaStorage", code: 1, userInfo: [NSLocalizedDescriptionKey: "Kayıt okunamadı veya boyut sınırını aşıyor."])
        }
        return raw
    }
    @objc public func read(_ call: CAPPluginCall) {
        queue.async { [self] in
            do {
                let raw = try readRaw(stateURL())
                DispatchQueue.main.async { call.resolve(["raw": raw.map { $0 as Any } ?? NSNull()]) }
            } catch {
                DispatchQueue.main.async { call.reject("Cihazdaki kayıt açılamadı. Mevcut veri değiştirilmedi.", "STORAGE_READ_FAILED", error) }
            }
        }
    }
    @objc public func write(_ call: CAPPluginCall) {
        guard let raw = call.getString("raw"), let bytes = raw.data(using: .utf8), bytes.count <= maximumBytes else {
            call.reject("Kayıt verisi geçersiz veya 32 MB sınırını aşıyor.", "STORAGE_INVALID_DATA"); return
        }
        guard let expectedValue = call.dictionaryRepresentation["expectedRaw"], expectedValue is NSNull || expectedValue is String else {
            call.reject("Kayıt karşılaştırması için expectedRaw gerekli.", "STORAGE_INVALID_ARGUMENT"); return
        }
        let expected = expectedValue as? String
        do {
            guard try JSONSerialization.jsonObject(with: bytes) is [String: Any] else {
                call.reject("Kayıt bir JSON nesnesi olmalı.", "STORAGE_INVALID_DATA"); return
            }
        } catch {
            call.reject("Kayıt JSON biçiminde değil.", "STORAGE_INVALID_DATA", error); return
        }
        queue.async { [self] in
            do {
                let url = try stateURL()
                guard try readRaw(url) == expected else {
                    DispatchQueue.main.async { call.reject("Kayıt değişti. Güncel verileri yükleyip yeniden deneyin.", "STORAGE_CONFLICT") }; return
                }
                try bytes.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                // No fallible work follows the atomic replacement.
                DispatchQueue.main.async { call.resolve(["raw": raw]) }
            } catch {
                DispatchQueue.main.async { call.reject("Kayıt cihazda saklanamadı. Formunuz korunuyor.", "STORAGE_WRITE_FAILED", error) }
            }
        }
    }
}
