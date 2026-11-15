import Foundation
import Capacitor
import StoreKit
import UIKit

/// The web layer may request a purchase, but only verified StoreKit transactions
/// can enable the multi-account feature. No entitlement is stored in JavaScript.
@objc(KasaPurchasesPlugin)
public class KasaPurchasesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KasaPurchasesPlugin"
    public let jsName = "KasaPurchases"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise)
    ]

    private let store = KasaPurchaseStore()
    private var transactionUpdates: Task<Void, Never>?
    private var foregroundObserver: NSObjectProtocol?

    @objc public override func load() {
        transactionUpdates?.cancel()
        if let foregroundObserver = foregroundObserver { NotificationCenter.default.removeObserver(foregroundObserver) }
        foregroundObserver = NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            Task { [weak self] in
                guard let self = self else { return }
                let status = await self.store.status(fetchProduct: false)
                await MainActor.run { self.notifyListeners("entitlementChanged", data: status.dictionary()) }
            }
        }
        transactionUpdates = Task { [weak self] in
            for await update in StoreKit.Transaction.updates {
                if Task.isCancelled { return }
                guard let self = self else { return }
                guard case .verified(let transaction) = update,
                      await self.store.accepts(transaction) else { continue }
                // The verified transaction is delivered by the entitlement refresh
                // before it is finished. Pending and unverified purchases never unlock.
                let status = await self.store.status(fetchProduct: false)
                await MainActor.run {
                    self.notifyListeners("entitlementChanged", data: status.dictionary())
                }
                await transaction.finish()
            }
        }
    }

    deinit {
        transactionUpdates?.cancel()
        if let foregroundObserver = foregroundObserver { NotificationCenter.default.removeObserver(foregroundObserver) }
    }

    @objc public func getStatus(_ call: CAPPluginCall) {
        Task {
            let status = await store.status(fetchProduct: true)
            await MainActor.run { call.resolve(status.dictionary()) }
        }
    }

    @objc public func purchase(_ call: CAPPluginCall) {
        Task {
            do {
                let result = try await store.purchase()
                await MainActor.run {
                    var payload = result.status.dictionary()
                    payload["outcome"] = result.outcome.rawValue
                    payload["cancelled"] = result.outcome == .cancelled
                    payload["pending"] = result.outcome == .pending
                    call.resolve(payload)
                    self.notifyListeners("entitlementChanged", data: result.status.dictionary())
                }
            } catch {
                await reject(call, error: error)
            }
        }
    }

    @objc public func restore(_ call: CAPPluginCall) {
        Task {
            do {
                let status = try await store.restore()
                await MainActor.run {
                    var payload = status.dictionary()
                    payload["restored"] = status.isPro
                    call.resolve(payload)
                    self.notifyListeners("entitlementChanged", data: status.dictionary())
                }
            } catch {
                await reject(call, error: error)
            }
        }
    }

    @MainActor private func reject(_ call: CAPPluginCall, error: Error) {
        if let failure = error as? KasaPurchaseFailure {
            call.reject(failure.localizedDescription, failure.code)
        } else if let storeError = error as? StoreKitError,
                  case .userCancelled = storeError {
            // App Store restore authentication can also be cancelled.
            call.reject("Satın alma işlemi iptal edildi.", "USER_CANCELLED")
        } else {
            call.reject("App Store işlemi tamamlanamadı. Bağlantınızı kontrol edip yeniden deneyin.", "STORE_UNAVAILABLE")
        }
    }
}

private struct KasaPurchaseStatus: Sendable {
    let isPro: Bool
    let configured: Bool
    let productID: String
    let price: String?
    let productAvailable: Bool
    let canPurchase: Bool
    let storeError: String?

    func dictionary() -> [String: Any] {
        var result: [String: Any] = [
            "isPro": isPro,
            "enabled": isPro,
            "configured": configured,
            "productId": productID,
            "price": price.map { $0 as Any } ?? NSNull(),
            "productAvailable": productAvailable,
            "canPurchase": canPurchase
        ]
        if let storeError = storeError { result["storeError"] = storeError }
        return result
    }
}

private enum KasaPurchaseOutcome: String, Sendable {
    case purchased
    case pending
    case cancelled
}

private struct KasaPurchaseResult: Sendable {
    let status: KasaPurchaseStatus
    let outcome: KasaPurchaseOutcome
}

private enum KasaPurchaseFailure: Error, LocalizedError {
    case notConfigured
    case unavailable
    case restricted
    case unverified
    case busy

    var code: String {
        switch self {
        case .notConfigured: return "STORE_NOT_CONFIGURED"
        case .unavailable: return "PRODUCT_UNAVAILABLE"
        case .restricted: return "PURCHASES_DISABLED"
        case .unverified: return "TRANSACTION_UNVERIFIED"
        case .busy: return "PURCHASE_IN_PROGRESS"
        }
    }

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Çoklu hesap satın alımı henüz yapılandırılmadı. Mevcut kayıtlarınızı kullanabilirsiniz."
        case .unavailable: return "Çoklu hesap ürünü App Store'da şu anda kullanılamıyor. Daha sonra yeniden deneyin."
        case .restricted: return "Bu cihazda uygulama içi satın almaya izin verilmiyor."
        case .unverified: return "Satın alma Apple tarafından doğrulanamadı. Ücretli özellik açılmadı; satın alımları geri yüklemeyi deneyebilirsiniz."
        case .busy: return "Başka bir App Store işlemi sürüyor. Tamamlanmasını bekleyin."
        }
    }
}

private actor KasaPurchaseStore {
    private let productID: String
    private let configured: Bool
    private var cachedProduct: StoreKit.Product?
    private var operationInProgress = false

    init() {
        let identifier = (Bundle.main.object(forInfoDictionaryKey: "KasaMultipleAccountsProductID") as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        productID = identifier
        let enabled = Bundle.main.object(forInfoDictionaryKey: "KasaPurchasesEnabled") as? Bool ?? true
        configured = enabled && !identifier.isEmpty && identifier.range(of: "^[A-Za-z0-9][A-Za-z0-9._-]{1,254}$", options: .regularExpression) != nil
    }

    func accepts(_ transaction: StoreKit.Transaction) -> Bool {
        configured && transaction.productID == productID && transaction.productType == .nonConsumable
    }

    private func hasVerifiedEntitlement() async -> Bool {
        guard configured else { return false }
        for await result in StoreKit.Transaction.currentEntitlements {
            guard case .verified(let transaction) = result,
                  accepts(transaction),
                  transaction.revocationDate == nil,
                  transaction.expirationDate == nil else { continue }
            return true
        }
        return false
    }

    private func loadProduct() async throws -> StoreKit.Product? {
        guard configured else { return nil }
        let products = try await StoreKit.Product.products(for: [productID])
        // Only a permanent, nonconsumable product is accepted by this version.
        cachedProduct = products.first { $0.id == productID && $0.type == .nonConsumable }
        return cachedProduct
    }

    func status(fetchProduct: Bool) async -> KasaPurchaseStatus {
        let isPro = await hasVerifiedEntitlement()
        var message: String?
        // An owned permanent entitlement must work offline without waiting for a price lookup.
        if fetchProduct && configured && !isPro {
            do { _ = try await loadProduct() }
            catch { cachedProduct = nil; message = "Mağaza bilgisi şu anda alınamıyor. Bağlantınızı kontrol edip yeniden deneyin." }
        }
        let available = cachedProduct != nil
        return KasaPurchaseStatus(isPro: isPro, configured: configured, productID: productID,
            price: cachedProduct?.displayPrice, productAvailable: available,
            canPurchase: configured && available && AppStore.canMakePayments,
            storeError: message)
    }

    func purchase() async throws -> KasaPurchaseResult {
        guard configured else { throw KasaPurchaseFailure.notConfigured }
        guard !operationInProgress else { throw KasaPurchaseFailure.busy }
        guard AppStore.canMakePayments else { throw KasaPurchaseFailure.restricted }
        operationInProgress = true
        defer { operationInProgress = false }
        guard let product = try await loadProduct() else { throw KasaPurchaseFailure.unavailable }
        let result = try await product.purchase()
        switch result {
        case .success(let verification):
            guard case .verified(let transaction) = verification,
                  accepts(transaction), transaction.revocationDate == nil,
                  transaction.expirationDate == nil else { throw KasaPurchaseFailure.unverified }
            // StoreKit.currentEntitlements supplies the durable entitlement on this
            // and future launches, including offline launches after a purchase.
            let current = await status(fetchProduct: false)
            await transaction.finish()
            return KasaPurchaseResult(status: current, outcome: .purchased)
        case .pending:
            return KasaPurchaseResult(status: await status(fetchProduct: false), outcome: .pending)
        case .userCancelled:
            return KasaPurchaseResult(status: await status(fetchProduct: false), outcome: .cancelled)
        @unknown default:
            throw KasaPurchaseFailure.unavailable
        }
    }

    func restore() async throws -> KasaPurchaseStatus {
        guard configured else { throw KasaPurchaseFailure.notConfigured }
        guard !operationInProgress else { throw KasaPurchaseFailure.busy }
        operationInProgress = true
        defer { operationInProgress = false }
        // Called only in response to the user's explicit Restore action.
        try await AppStore.sync()
        return await status(fetchProduct: true)
    }
}
