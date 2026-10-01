import Foundation
import UIKit
import Capacitor
import AVFoundation
import AuthenticationServices
#if canImport(ActivityKit)
import ActivityKit
#endif

/// Puente nativo de VELO: voz (manos libres), Sign in with Apple, pantalla siempre
/// encendida durante la sesión y Live Activity (Dynamic Island + pantalla bloqueada).
@objc(VeloNativePlugin)
public class VeloNativePlugin: CAPPlugin, CAPBridgedPlugin, AVSpeechSynthesizerDelegate,
    ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {

    public let identifier = "VeloNativePlugin"
    public let jsName = "VeloNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopSpeaking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signInWithApple", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "keepAwake", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "liveStart", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "liveUpdate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "liveEnd", returnType: CAPPluginReturnPromise)
    ]

    // MARK: Voz
    private let synth = AVSpeechSynthesizer()
    private var ids: [ObjectIdentifier: String] = [:]
    private var releaseWork: DispatchWorkItem?

    override public func load() { synth.delegate = self }

    private func activateAudio(duck: Bool) {
        releaseWork?.cancel()
        let s = AVAudioSession.sharedInstance()
        let opts: AVAudioSession.CategoryOptions = duck ? [.duckOthers, .interruptSpokenAudioAndMixWithOthers] : [.mixWithOthers]
        try? s.setCategory(.playback, mode: .voicePrompt, options: opts)
        try? s.setActive(true)
    }

    private func releaseAudioSoon() {
        releaseWork?.cancel()
        let w = DispatchWorkItem { [weak self] in
            guard let self = self, !self.synth.isSpeaking else { return }
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
        releaseWork = w
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4, execute: w)
    }

    private static func spanishVoice(_ pref: String?) -> AVSpeechSynthesisVoice? {
        for lang in [pref, "es-419", "es-MX", "es-US", "es-ES"].compactMap({ $0 }) {
            if let v = AVSpeechSynthesisVoice(language: lang) { return v }
        }
        return nil
    }

    @objc func speak(_ call: CAPPluginCall) {
        let text = call.getString("text") ?? ""
        let id = call.getString("id") ?? ""
        let queue = call.getBool("queue") ?? false
        let duck = call.getBool("duck") ?? true
        let rate = Float(call.getDouble("rate") ?? 0.55)
        let lang = call.getString("lang")
        DispatchQueue.main.async {
            if !queue && self.synth.isSpeaking { self.synth.stopSpeaking(at: .immediate) }
            self.activateAudio(duck: duck)
            let u = AVSpeechUtterance(string: text)
            u.voice = Self.spanishVoice(lang)
            u.rate = rate
            self.ids[ObjectIdentifier(u)] = id
            self.synth.speak(u)
            call.resolve()
        }
    }

    @objc func stopSpeaking(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.synth.stopSpeaking(at: .immediate)
            self.releaseAudioSoon()
            call.resolve()
        }
    }

    public func speechSynthesizer(_ s: AVSpeechSynthesizer, didStart u: AVSpeechUtterance) {
        notifyListeners("speechStart", data: ["id": ids[ObjectIdentifier(u)] ?? ""])
    }
    public func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) { finished(u) }
    public func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel u: AVSpeechUtterance) { finished(u) }
    private func finished(_ u: AVSpeechUtterance) {
        let id = ids.removeValue(forKey: ObjectIdentifier(u)) ?? ""
        notifyListeners("speechEnd", data: ["id": id])
        releaseAudioSoon()
    }

    // MARK: Pantalla encendida durante la sesión en vivo
    @objc func keepAwake(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = on; call.resolve() }
    }

    // MARK: Sign in with Apple
    private var appleCall: CAPPluginCall?

    @objc func signInWithApple(_ call: CAPPluginCall) {
        appleCall = call
        DispatchQueue.main.async {
            let req = ASAuthorizationAppleIDProvider().createRequest()
            req.requestedScopes = [.fullName, .email]
            // Firebase exige el nonce: la app manda el SHA-256 y guarda el original.
            if let n = call.getString("nonce") { req.nonce = n }
            let c = ASAuthorizationController(authorizationRequests: [req])
            c.delegate = self
            c.presentationContextProvider = self
            c.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return bridge?.webView?.window ?? ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential else {
            appleCall?.reject("Credencial inválida"); appleCall = nil; return
        }
        var r: [String: Any] = ["user": cred.user]
        if let e = cred.email { r["email"] = e }
        if let g = cred.fullName?.givenName { r["givenName"] = g }
        if let f = cred.fullName?.familyName { r["familyName"] = f }
        if let t = cred.identityToken, let s = String(data: t, encoding: .utf8) { r["identityToken"] = s }
        if let c = cred.authorizationCode, let s = String(data: c, encoding: .utf8) { r["authorizationCode"] = s }
        appleCall?.resolve(r); appleCall = nil
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        appleCall?.reject(error.localizedDescription); appleCall = nil
    }

    // MARK: Live Activity
    @objc func liveStart(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            guard ActivityAuthorizationInfo().areActivitiesEnabled else { return call.resolve() }
            let attrs = VeloActivityAttributes(
                exercise: call.getString("exercise") ?? "",
                sets: call.getInt("sets") ?? 1,
                cut: call.getDouble("cut") ?? 0.5
            )
            let st = Self.contentState(call)
            Task {
                for a in Activity<VeloActivityAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) }
                do {
                    _ = try Activity.request(attributes: attrs, content: .init(state: st, staleDate: nil))
                    call.resolve()
                } catch { call.reject(error.localizedDescription) }
            }
            return
        }
        #endif
        call.resolve()
    }

    @objc func liveUpdate(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            let st = Self.contentState(call)
            Task {
                for a in Activity<VeloActivityAttributes>.activities { await a.update(.init(state: st, staleDate: nil)) }
                call.resolve()
            }
            return
        }
        #endif
        call.resolve()
    }

    @objc func liveEnd(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            Task {
                for a in Activity<VeloActivityAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) }
                call.resolve()
            }
            return
        }
        #endif
        call.resolve()
    }

    #if canImport(ActivityKit)
    @available(iOS 16.2, *)
    private static func contentState(_ call: CAPPluginCall) -> VeloActivityAttributes.ContentState {
        let bars = (call.getArray("bars") ?? []).compactMap { ($0 as? NSNumber)?.doubleValue }
        let rest = call.getDouble("rest") ?? 0
        return .init(
            v: call.getDouble("v") ?? 0,
            rep: call.getInt("rep") ?? 0,
            loss: call.getInt("loss") ?? 0,
            bars: bars,
            setNo: call.getInt("setNo") ?? 1,
            load: call.getDouble("load") ?? 0,
            restEnd: rest > 0 ? Date().addingTimeInterval(rest) : nil,
            nextLoad: call.getDouble("nextLoad")
        )
    }
    #endif
}
