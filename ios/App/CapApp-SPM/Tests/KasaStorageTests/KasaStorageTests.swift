import Foundation
import XCTest
import Capacitor
import CapApp_SPM

/// Exercises the real plugin, its serial write queue and the test runner's real
/// Application Support directory. There are no production hooks or mock stores.
final class KasaStorageTests: XCTestCase {
    private enum Reply {
        case success([String: Any])
        case failure(String)
    }

    private let files = FileManager.default
    private var stateDirectory: URL?
    private var backupDirectory: URL?
    private var isolatedDirectory = false
    private let initialRaw = "{\n  \"version\": 2,\n  \"kasalar\": [],\n  \"transactions\": [],\n  \"activeKasaId\": null,\n  \"revision\": \"native-ilk-özgün\"\n}\n"

    override func setUpWithError() throws {
        try super.setUpWithError()
        // A package test runner is required. Never touch a production BHU host.
        guard Bundle.main.bundleIdentifier != "com.fevzicakmak.bhu" else {
            throw NSError(domain: "BHUStorageTests", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Refusing to change storage inside the production BHU application."])
        }
        let support = try files.url(for: .applicationSupportDirectory, in: .userDomainMask,
            appropriateFor: nil, create: true)
        let directory = support.appendingPathComponent("KasaPro", isDirectory: true)
        stateDirectory = directory
        if files.fileExists(atPath: directory.path) {
            let backup = support.appendingPathComponent("KasaPro-XCTest-backup-\(UUID().uuidString)", isDirectory: true)
            try files.moveItem(at: directory, to: backup)
            backupDirectory = backup
        }
        isolatedDirectory = true
    }

    override func tearDownWithError() throws {
        defer {
            stateDirectory = nil
            backupDirectory = nil
            isolatedDirectory = false
        }
        if isolatedDirectory, let directory = stateDirectory {
            if files.fileExists(atPath: directory.path) {
                // Repair test-only permissions even if a read-only test failed.
                try files.setAttributes([.posixPermissions: NSNumber(value: 0o700)], ofItemAtPath: directory.path)
                try files.removeItem(at: directory)
            }
            if let backup = backupDirectory, files.fileExists(atPath: backup.path) {
                try files.moveItem(at: backup, to: directory)
            }
        }
        try super.tearDownWithError()
    }

    private func invoke(_ plugin: KasaStoragePlugin, method: String,
                        options: [String: Any] = [:], file: StaticString = #filePath,
                        line: UInt = #line) -> Reply {
        let completed = expectation(description: "KasaStorage.\(method) callback")
        completed.assertForOverFulfill = true
        var reply: Reply?
        let call: CAPPluginCall = CAPPluginCall(callbackId: UUID().uuidString,
            methodName: method, options: options,
            success: { (result: CAPPluginCallResult?, _: CAPPluginCall?) in
                guard let payload = result?.data else {
                    reply = .failure("TEST_MISSING_SUCCESS_DATA")
                    completed.fulfill()
                    return
                }
                reply = .success(payload)
                completed.fulfill()
            }, error: { (error: CAPPluginCallError?) in
                reply = .failure(error?.code ?? "TEST_MISSING_ERROR_CODE")
                completed.fulfill()
            })
        if method == "read" { plugin.read(call) }
        else { plugin.write(call) }
        wait(for: [completed], timeout: 15)
        guard let reply = reply else {
            XCTFail("The real native plugin did not invoke its callback.", file: file, line: line)
            return .failure("TEST_CALLBACK_TIMEOUT")
        }
        return reply
    }

    private func write(_ plugin: KasaStoragePlugin, raw: String, expected: String?,
                       file: StaticString = #filePath, line: UInt = #line) -> Reply {
        invoke(plugin, method: "write", options: ["raw": raw,
            "expectedRaw": expected.map { $0 as Any } ?? NSNull()], file: file, line: line)
    }

    private func assertSuccess(_ reply: Reply, raw: String?,
                               file: StaticString = #filePath, line: UInt = #line) {
        switch reply {
        case .success(let result):
            if let raw = raw {
                guard let received = result["raw"] as? String else {
                    XCTFail("Expected a raw String in the native response.", file: file, line: line)
                    return
                }
                XCTAssertTrue(received.utf8.elementsEqual(raw.utf8), "Native response must preserve exact UTF-8 bytes.", file: file, line: line)
            }
            else { XCTAssertTrue(result["raw"] is NSNull, "An empty store must return raw:null.", file: file, line: line) }
        case .failure(let code):
            XCTFail("Expected success, received \(code).", file: file, line: line)
        }
    }

    private func assertFailure(_ reply: Reply, code: String,
                               file: StaticString = #filePath, line: UInt = #line) {
        switch reply {
        case .failure(let received): XCTAssertEqual(received, code, file: file, line: line)
        case .success: XCTFail("Expected \(code), received success.", file: file, line: line)
        }
    }

    private func savedBytes() throws -> Data {
        let directory = try XCTUnwrap(stateDirectory)
        return try Data(contentsOf: directory.appendingPathComponent("state.json"))
    }

    func testInitialWriteReadAndReplacementSurviveNewPlugin() throws {
        let plugin = KasaStoragePlugin()
        assertSuccess(invoke(plugin, method: "read"), raw: nil)
        assertSuccess(write(plugin, raw: initialRaw, expected: nil), raw: initialRaw)
        XCTAssertEqual(try savedBytes(), Data(initialRaw.utf8))
        assertSuccess(invoke(plugin, method: "read"), raw: initialRaw)

        let replacement = "{\"version\":2,\"kasalar\":[{\"id\":\"root-a\",\"name\":\"İzmir Ana Kasa\",\"parentId\":null,\"includeInParentTotals\":true,\"createdAt\":\"2026-11-16T12:00:00.000Z\"}],\"transactions\":[],\"activeKasaId\":\"root-a\",\"revision\":\"native-replacement-1\"}\n"
        assertSuccess(write(plugin, raw: replacement, expected: initialRaw), raw: replacement)
        XCTAssertEqual(try savedBytes(), Data(replacement.utf8))
        // A new plugin instance must read the file, not an earlier instance's memory.
        assertSuccess(invoke(KasaStoragePlugin(), method: "read"), raw: replacement)
    }

    func testStaleExpectedRawPreservesExactSnapshot() throws {
        let plugin = KasaStoragePlugin()
        assertSuccess(write(plugin, raw: initialRaw, expected: nil), raw: initialRaw)
        let latest = "{ \"version\": 2, \"note\": \"son kayıt\" }\n"
        assertSuccess(write(plugin, raw: latest, expected: initialRaw), raw: latest)
        let bytesBefore = try savedBytes()
        assertFailure(write(plugin, raw: "{\"note\":\"eski sekme\"}", expected: initialRaw), code: "STORAGE_CONFLICT")
        XCTAssertEqual(try savedBytes(), bytesBefore)
        assertSuccess(invoke(KasaStoragePlugin(), method: "read"), raw: latest)
    }

    func testCanonicallyEquivalentUnicodeStillRequiresExactUTF8Snapshot() throws {
        let plugin = KasaStoragePlugin()
        let nfc = "{\"note\":\"\u{0130}\"}\n"
        let nfd = "{\"note\":\"I\u{0307}\"}\n"
        // Swift String equality treats these as canonically equivalent, while
        // JavaScript's saved raw snapshots and this CAS contract do not.
        XCTAssertEqual(nfc, nfd)
        XCTAssertFalse(nfc.utf8.elementsEqual(nfd.utf8))
        assertSuccess(write(plugin, raw: nfc, expected: nil), raw: nfc)
        XCTAssertEqual(try savedBytes(), Data(nfc.utf8))
        assertSuccess(write(plugin, raw: nfd, expected: nfc), raw: nfd)
        let bytesBefore = try savedBytes()
        XCTAssertEqual(bytesBefore, Data(nfd.utf8))
        assertFailure(write(plugin, raw: "{\"note\":\"stale writer\"}", expected: nfc), code: "STORAGE_CONFLICT")
        XCTAssertEqual(try savedBytes(), bytesBefore)
        assertSuccess(invoke(KasaStoragePlugin(), method: "read"), raw: nfd)
    }

    func testConcurrentWritesWithSameExpectedRawHaveOneWinner() throws {
        let plugin = KasaStoragePlugin()
        assertSuccess(write(plugin, raw: initialRaw, expected: nil), raw: initialRaw)
        let candidates = ["{ \"winner\": \"A\" }\n", "{\"winner\":\"B\"}\n"]
        let completed = expectation(description: "Both concurrent native write callbacks")
        completed.expectedFulfillmentCount = 2
        completed.assertForOverFulfill = true
        var replies: [Int: Reply] = [:]
        let calls: [CAPPluginCall] = candidates.enumerated().map { index, raw in
            let call: CAPPluginCall = CAPPluginCall(callbackId: UUID().uuidString,
                methodName: "write", options: ["raw": raw, "expectedRaw": initialRaw],
                success: { (result: CAPPluginCallResult?, _: CAPPluginCall?) in
                    replies[index] = .success(result?.data ?? [:])
                    completed.fulfill()
                }, error: { (error: CAPPluginCallError?) in
                    replies[index] = .failure(error?.code ?? "TEST_MISSING_ERROR_CODE")
                    completed.fulfill()
                })
            return call
        }
        // Two real callers enter concurrently; the runtime's single plugin queue
        // must serialize the compare-and-swap, so exactly one snapshot wins.
        DispatchQueue.concurrentPerform(iterations: calls.count) { index in plugin.write(calls[index]) }
        wait(for: [completed], timeout: 15)
        XCTAssertEqual(replies.count, 2)
        var winners: [String] = []
        var conflictCount = 0
        for reply in replies.values {
            switch reply {
            case .success(let payload):
                winners.append(try XCTUnwrap(payload["raw"] as? String))
            case .failure(let code):
                XCTAssertEqual(code, "STORAGE_CONFLICT")
                if code == "STORAGE_CONFLICT" { conflictCount += 1 }
            }
        }
        XCTAssertEqual(winners.count, 1)
        XCTAssertEqual(conflictCount, 1)
        let winner = try XCTUnwrap(winners.first)
        XCTAssertTrue(candidates.contains(winner))
        XCTAssertEqual(try savedBytes(), Data(winner.utf8))
    }

    func testInvalidJSONAndMissingExpectedRawPreserveSnapshot() throws {
        let plugin = KasaStoragePlugin()
        assertSuccess(write(plugin, raw: initialRaw, expected: nil), raw: initialRaw)
        let bytesBefore = try savedBytes()
        for raw in ["not json", "[1,2,3]", "\"a JSON string\""] {
            assertFailure(write(plugin, raw: raw, expected: initialRaw), code: "STORAGE_INVALID_DATA")
            XCTAssertEqual(try savedBytes(), bytesBefore)
        }
        assertFailure(invoke(plugin, method: "write", options: ["raw": "{\"valid\":true}"]), code: "STORAGE_INVALID_ARGUMENT")
        XCTAssertEqual(try savedBytes(), bytesBefore)
        assertFailure(invoke(plugin, method: "write", options: ["raw": "{\"valid\":true}", "expectedRaw": 42]), code: "STORAGE_INVALID_ARGUMENT")
        XCTAssertEqual(try savedBytes(), bytesBefore)
    }

    func testOversizeUTF8PayloadPreservesSnapshot() throws {
        let plugin = KasaStoragePlugin()
        assertSuccess(write(plugin, raw: initialRaw, expected: nil), raw: initialRaw)
        let bytesBefore = try savedBytes()
        // Each Turkish character is two UTF-8 bytes. The JSON object exceeds the
        // native limit even though its character count is less than 32 MiB.
        let oversized = "{\"padding\":\"" + String(repeating: "ç", count: 16 * 1024 * 1024) + "\"}"
        XCTAssertGreaterThan(oversized.utf8.count, 32 * 1024 * 1024)
        assertFailure(write(plugin, raw: oversized, expected: initialRaw), code: "STORAGE_INVALID_DATA")
        XCTAssertEqual(try savedBytes(), bytesBefore)
    }

    func testReadOnlyParentWriteFailurePreservesSnapshot() throws {
        let plugin = KasaStoragePlugin()
        assertSuccess(write(plugin, raw: initialRaw, expected: nil), raw: initialRaw)
        let directory = try XCTUnwrap(stateDirectory)
        let bytesBefore = try savedBytes()
        let attributes = try files.attributesOfItem(atPath: directory.path)
        let permissions = try XCTUnwrap(attributes[.posixPermissions] as? NSNumber)
        try files.setAttributes([.posixPermissions: NSNumber(value: 0o500)], ofItemAtPath: directory.path)
        defer {
            do { try files.setAttributes([.posixPermissions: permissions], ofItemAtPath: directory.path) }
            catch { XCTFail("Could not restore test-directory permissions: \(error)") }
        }
        let restricted = try files.attributesOfItem(atPath: directory.path)
        XCTAssertEqual((restricted[.posixPermissions] as? NSNumber)?.intValue, 0o500)
        XCTAssertFalse(files.isWritableFile(atPath: directory.path), "The test runner must run unprivileged so POSIX permissions cause a real write failure.")
        assertFailure(write(plugin, raw: "{\"note\":\"must not replace\"}", expected: initialRaw), code: "STORAGE_WRITE_FAILED")
        XCTAssertEqual(try savedBytes(), bytesBefore)
        assertSuccess(invoke(KasaStoragePlugin(), method: "read"), raw: initialRaw)
    }

    func testFileProtectionAttributeWhenReported() throws {
        let plugin = KasaStoragePlugin()
        assertSuccess(write(plugin, raw: initialRaw, expected: nil), raw: initialRaw)
        let directory = try XCTUnwrap(stateDirectory)
        let attributes = try files.attributesOfItem(atPath: directory.appendingPathComponent("state.json").path)
        guard let protection = attributes[.protectionKey] else {
            throw XCTSkip("This OS does not expose file-protection metadata. Simulator metadata cannot prove hardware encryption.")
        }
        let protectionName: String
        if let typed = protection as? FileProtectionType { protectionName = typed.rawValue }
        else if let raw = protection as? String { protectionName = raw }
        else { XCTFail("Unexpected file-protection metadata type: \(type(of: protection))"); return }
        XCTAssertEqual(protectionName, FileProtectionType.completeUntilFirstUserAuthentication.rawValue)
    }
}
