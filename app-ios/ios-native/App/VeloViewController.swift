import UIKit
import Capacitor

/// Reemplaza al CAPBridgeViewController del storyboard para registrar el plugin local.
class VeloViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(VeloNativePlugin())
    }
}
