import Foundation
#if canImport(ActivityKit)
import ActivityKit

/// Compartido entre la app y la extensión VeloLiveActivity.
@available(iOS 16.1, *)
struct VeloActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var v: Double          // velocidad de la última rep (m/s)
        var rep: Int
        var loss: Int          // pérdida de velocidad (%)
        var bars: [Double]     // velocidades de la serie actual
        var setNo: Int
        var load: Double       // kg
        var restEnd: Date?     // descanso en curso
        var nextLoad: Double?
    }
    var exercise: String
    var sets: Int
    var cut: Double
}
#endif
