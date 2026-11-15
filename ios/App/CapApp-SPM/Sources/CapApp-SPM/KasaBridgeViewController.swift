import Capacitor
import UIKit

@objc public final class KasaBridgeViewController: CAPBridgeViewController {
    public override func capacitorDidLoad() {
        bridge?.registerPluginInstance(KasaStoragePlugin())
        bridge?.registerPluginInstance(KasaDocumentsPlugin())
        bridge?.registerPluginInstance(KasaPurchasesPlugin())
    }
}
