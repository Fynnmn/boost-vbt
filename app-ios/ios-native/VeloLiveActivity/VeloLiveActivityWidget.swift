import WidgetKit
import SwiftUI
import ActivityKit

// Réplica 1:1 de la tarjeta "sesión en vivo" y la Dynamic Island del diseño
// (VELOPhone.dc.html · pantalla lock, variante live). Medidas en pt = px del diseño.

private let orange = Color(red: 1.0, green: 122 / 255, blue: 85 / 255)        // #FF7A55
private let liveDot = Color(red: 1.0, green: 90 / 255, blue: 58 / 255)         // #FF5A3A
private let cardBg = Color(red: 16 / 255, green: 12 / 255, blue: 10 / 255)     // rgba(16,12,10,.74)

// Helvetica Neue como en el diseño. Pesos 600–800 del diseño = Bold en iOS.
private func hn(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
    switch weight {
    case .bold, .semibold, .heavy, .black: return .custom("HelveticaNeue-Bold", size: size)
    case .medium: return .custom("HelveticaNeue-Medium", size: size)
    default: return .custom("HelveticaNeue", size: size)
    }
}
private func comma(_ x: Double, _ d: Int = 2) -> String { String(format: "%.\(d)f", x).replacingOccurrences(of: ".", with: ",") }
private func kg(_ x: Double) -> String { x == x.rounded() ? String(Int(x)) : comma(x, 1) }

private struct Logo: View {
    let size: CGFloat
    var body: some View {
        ZStack {
            Circle().fill(Color.black)
            if let img = UIImage(named: "logo") {
                Image(uiImage: img).resizable().scaledToFill().frame(width: size * 1.12, height: size * 1.12)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(Color.white.opacity(0.12), lineWidth: 0.5))
    }
}

private struct Bars: View {
    let bars: [Double]; let cut: Double
    var body: some View {
        let shown = Array(bars.suffix(6))
        ZStack(alignment: .bottom) {
            HStack(alignment: .bottom, spacing: 5) {
                ForEach(0..<6, id: \.self) { j in
                    let has = j < shown.count
                    let last = j == shown.count - 1
                    UnevenBar()
                        .fill(has ? (last ? orange : Color.white.opacity(0.42)) : Color.white.opacity(0.12))
                        .frame(height: has ? max(3, CGFloat(shown[j] / 0.9) * 56) : 56 * 0.06)
                }
            }
            DashLine()
                .stroke(Color.white.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                .frame(height: 1)
                .offset(y: -CGFloat(cut / 0.9) * 56)
        }
        .frame(width: 128, height: 56, alignment: .bottom)
    }
}
private struct UnevenBar: Shape { // radios 4 4 1 1 como en el diseño
    func path(in r: CGRect) -> Path {
        var p = Path(); let t: CGFloat = min(4, r.height / 2), b: CGFloat = min(1, r.height / 2)
        p.move(to: CGPoint(x: r.minX, y: r.maxY - b))
        p.addLine(to: CGPoint(x: r.minX, y: r.minY + t))
        p.addQuadCurve(to: CGPoint(x: r.minX + t, y: r.minY), control: CGPoint(x: r.minX, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX - t, y: r.minY))
        p.addQuadCurve(to: CGPoint(x: r.maxX, y: r.minY + t), control: CGPoint(x: r.maxX, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX, y: r.maxY - b))
        p.addQuadCurve(to: CGPoint(x: r.maxX - b, y: r.maxY), control: CGPoint(x: r.maxX, y: r.maxY))
        p.addLine(to: CGPoint(x: r.minX + b, y: r.maxY))
        p.addQuadCurve(to: CGPoint(x: r.minX, y: r.maxY - b), control: CGPoint(x: r.minX, y: r.maxY))
        return p
    }
}
private struct DashLine: Shape {
    func path(in r: CGRect) -> Path { var p = Path(); p.move(to: CGPoint(x: 0, y: r.midY)); p.addLine(to: CGPoint(x: r.maxX, y: r.midY)); return p }
}

@available(iOS 16.2, *)
private struct LiveCard: View {
    let a: VeloActivityAttributes; let s: VeloActivityAttributes.ContentState
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Logo(size: 22)
                Text(a.exercise).font(hn(14, .semibold)).foregroundColor(.white)
                Text("Serie \(s.setNo)/\(a.sets) · \(kg(s.load)) kg").font(hn(14)).foregroundColor(.white.opacity(0.55)).lineLimit(1)
                Spacer(minLength: 0)
                HStack(spacing: 6) {
                    Circle().fill(liveDot).frame(width: 7, height: 7)
                    Text("En vivo").font(hn(12, .semibold)).foregroundColor(orange)
                }
            }
            HStack(alignment: .bottom) {
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Text(comma(s.v)).font(hn(54, .heavy)).kerning(-2.7).monospacedDigit().foregroundColor(orange)
                    Text("m/s").font(hn(16)).foregroundColor(.white.opacity(0.55))
                }
                Spacer(minLength: 0)
                Bars(bars: s.bars, cut: a.cut)
            }
            .padding(.top, 8)
            HStack {
                if let end = s.restEnd, end > Date() {
                    (Text("Descanso ") + Text(timerInterval: Date()...end, countsDown: true))
                } else {
                    Text("Rep \(s.rep)")
                }
                Spacer()
                Text("Pérdida ") + Text("\(s.loss)%").foregroundColor(s.loss >= 20 ? orange : .white).bold()
                Spacer()
                Text("Corte \(comma(a.cut))")
            }
            .font(hn(13)).monospacedDigit().foregroundColor(.white.opacity(0.62))
            .padding(.top, 10)
        }
        .padding(EdgeInsets(top: 14, leading: 16, bottom: 14, trailing: 16))
    }
}

@available(iOS 16.2, *)
struct VeloLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: VeloActivityAttributes.self) { ctx in
            LiveCard(a: ctx.attributes, s: ctx.state)
                .activityBackgroundTint(cardBg.opacity(0.74))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { ctx in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 8) { Logo(size: 28); Text(ctx.attributes.exercise).font(hn(14, .semibold)).foregroundColor(.white) }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(comma(ctx.state.v)).font(hn(28, .heavy)).monospacedDigit().foregroundColor(orange)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(alignment: .bottom) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Serie \(ctx.state.setNo)/\(ctx.attributes.sets) · \(kg(ctx.state.load)) kg").font(hn(13)).foregroundColor(.white.opacity(0.62))
                            Text("Rep \(ctx.state.rep) · Pérdida \(ctx.state.loss)%").font(hn(13)).monospacedDigit().foregroundColor(.white.opacity(0.62))
                        }
                        Spacer()
                        Bars(bars: ctx.state.bars, cut: ctx.attributes.cut)
                    }
                }
            } compactLeading: {
                Logo(size: 22)
            } compactTrailing: {
                Text(comma(ctx.state.v)).font(hn(15, .bold)).monospacedDigit().foregroundColor(orange)
            } minimal: {
                Text(comma(ctx.state.v, 1)).font(hn(12, .bold)).monospacedDigit().foregroundColor(orange)
            }
        }
    }
}
