#if canImport(UIKit)
import SwiftUI
import TouchLabCore
import UIKit

/// One UIView that owns every finger on the pad.
///
/// Why UIKit and one view, rather than a SwiftUI view per button: the shipping pad's worst
/// bugs lived in SwiftUI hit testing (`.position()` plus negative padding shrinking every
/// catchment to nothing, shipped, and visible only under a real finger). Here there is
/// no per-control hit testing to get wrong. `touchesBegan/Moved/Ended/Cancelled` hand
/// raw points to `PadEngine`, and the engine decides. The same code path runs in the
/// check suite on a Mac.
///
/// Touches nothing wants (per `PadEngine.claims`) are not taken: `hitTest` returns nil for
/// them, so menus and buttons under the pad keep working.
public final class TouchPadView: UIView {
    public let engine: PadEngine
    public var hapticsEnabled = true
    /// Whole-pad opacity; controls, not the view, so hit testing is unaffected.
    public var controlOpacity: CGFloat = 0.85 { didSet { setNeedsDisplay() } }
    /// Called after every input change, for HUDs and diagnostics.
    public var onChange: (() -> Void)?
    /// Where the GamePad image is, in this view's coordinates; see LayoutContext.
    public var touchscreenRect: CGRect? { didSet { relayout() } }
    public var videoRects: [CGRect] = [] { didSet { relayout() } }
    public var scale: CGFloat = 1 { didSet { relayout() } }
    /// See LayoutContext.stickSpacing.
    public var stickSpacing: CGFloat = 0 { didSet { relayout() } }
    public var stickTuning = StickTuning() { didSet { relayout() } }
    /// Which coordinate space `touchscreenRect` / `videoRects` are given in. `.window`
    /// takes SwiftUI `.global` frames (window coordinates) and converts them into this
    /// view's space, so a host can report screen frames from anywhere in its hierarchy.
    public var rectSpace: RectSpace = .local { didSet { relayout() } }
    /// Off = the pad is drawn but takes no touches, and anything held is released. For a
    /// paused title and for layout-editing mode.
    public var isInputEnabled = true {
        didSet {
            guard isInputEnabled != oldValue else { return }
            if !isInputEnabled { dropAll() }
            setNeedsDisplay()
        }
    }

    public enum RectSpace: Equatable { case local, window }

    /// Added to the safe area before layout: room the host keeps for its own chrome (a
    /// top bar), so no control is placed underneath it.
    public var extraInsets = Insets() { didSet { relayout() } }

    private var displayLink: CADisplayLink?
    private let impact = UIImpactFeedbackGenerator(style: .light)
    private var lastPressed: Set<PadButton> = []

    public init(scheme: TouchScheme, output: PadOutput) {
        engine = PadEngine(scheme: scheme, output: output, context: LayoutContext(size: .zero))
        super.init(frame: .zero)
        isMultipleTouchEnabled = true
        isOpaque = false
        backgroundColor = .clear
        contentMode = .redraw
        NotificationCenter.default.addObserver(self, selector: #selector(dropAll),
                                               name: UIApplication.willResignActiveNotification, object: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    deinit {
        displayLink?.invalidate()
    }

    public func setScheme(_ scheme: TouchScheme) {
        engine.setScheme(scheme)
        relayout(force: true)
    }

    // MARK: Layout

    public override func layoutSubviews() {
        super.layoutSubviews()
        relayout()
    }

    public override func safeAreaInsetsDidChange() {
        super.safeAreaInsetsDidChange()
        relayout()
    }

    public override func didMoveToWindow() {
        super.didMoveToWindow()
        relayout()
    }

    private func toLocal(_ r: CGRect) -> CGRect {
        guard rectSpace == .window, window != nil else { return r }
        return convert(r, from: nil)
    }

    private func relayout(force: Bool = false) {
        let i = safeAreaInsets
        let e = extraInsets
        let ctx = LayoutContext(size: bounds.size,
                                safeInsets: Insets(top: i.top + e.top, left: i.left + e.left,
                                                   bottom: i.bottom + e.bottom, right: i.right + e.right),
                                videoRects: videoRects.map(toLocal), touchscreenRect: touchscreenRect.map(toLocal),
                                scale: scale, stick: stickTuning, stickSpacing: stickSpacing)
        if force || ctx != engine.context {
            engine.setContext(ctx)
            if force { engine.scheme.layout(ctx) }
            changed()
        }
    }

    // MARK: Touches

    public override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard isInputEnabled, isUserInteractionEnabled, !isHidden, alpha > 0.01,
              self.point(inside: point, with: event) else { return nil }
        // Only touches a control (or the GamePad touchscreen) wants. A pad that took every
        // touch while a thumb was down would block the host's own buttons - pause, back -
        // for as long as a stick was held, and gain nothing: an unclaimed touch is
        // dropped anyway.
        return engine.claims(point) ? self : nil
    }

    private func id(_ t: UITouch) -> TouchID { ObjectIdentifier(t).hashValue }

    public override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        for t in touches { engine.began(id(t), at: t.location(in: self), time: t.timestamp) }
        changed()
    }

    public override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        for t in touches {
            // Coalesced touches: every intermediate sample, so a fast flick across two
            // buttons or a quick stick snap is not reduced to its endpoints.
            for c in event?.coalescedTouches(for: t) ?? [t] {
                engine.moved(id(t), to: c.location(in: self), time: c.timestamp)
            }
        }
        changed()
    }

    public override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        for t in touches { engine.ended(id(t), at: t.location(in: self), time: t.timestamp) }
        changed()
    }

    public override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        for t in touches { engine.cancelled(id(t), time: t.timestamp) }
        changed()
    }

    public override func willMove(toWindow newWindow: UIWindow?) {
        super.willMove(toWindow: newWindow)
        if newWindow == nil { dropAll() }
    }

    /// Every finger forgotten and every input released - the view is leaving, or the app
    /// is. The stuck-button guard lives here, once, for the whole pad.
    @objc public func dropAll() {
        engine.cancelAll()
        changed()
    }

    private func changed() {
        let pressed = engine.mixer.pressed
        if hapticsEnabled, !pressed.subtracting(lastPressed).isEmpty {
            impact.impactOccurred(intensity: 0.7)
        }
        lastPressed = pressed
        updateDisplayLink()
        setNeedsDisplay()
        onChange?()
    }

    private func updateDisplayLink() {
        if engine.needsTicks, displayLink == nil {
            let link = CADisplayLink(target: self, selector: #selector(tick(_:)))
            link.add(to: .main, forMode: .common)
            displayLink = link
        } else if !engine.needsTicks, let link = displayLink {
            link.invalidate()
            displayLink = nil
        }
    }

    @objc private func tick(_ link: CADisplayLink) {
        engine.tick(time: link.timestamp)
        changed()
    }

    // MARK: Drawing

    public override func draw(_ rect: CGRect) {
        guard let g = UIGraphicsGetCurrentContext() else { return }
        for e in engine.render() { PadDrawing.draw(e, in: g, opacity: controlOpacity) }
    }
}

enum PadDrawing {
    static func draw(_ e: RenderElement, in g: CGContext, opacity: CGFloat) {
        let path: UIBezierPath
        switch e.shape {
        case .circle(let c, let r):
            path = UIBezierPath(ovalIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r))
        case .roundedRect(let rect, let cr):
            path = UIBezierPath(roundedRect: rect, cornerRadius: cr)
        }
        let alpha: CGFloat
        switch e.role {
        case .zone: alpha = e.lit ? 0.10 : 0.0
        case .touchscreen: alpha = 0
        default: alpha = (e.ghost ? 0.3 : 1) * opacity
        }
        guard alpha > 0 else { return }

        let (fill, stroke, text) = colours(e)
        fill.withAlphaComponent(alpha * (e.lit ? 0.95 : 0.55)).setFill()
        path.fill()
        stroke.withAlphaComponent(alpha * 0.9).setStroke()
        path.lineWidth = 1.5
        path.stroke()

        guard !e.label.isEmpty, e.role != .zone, e.role != .stickBase else { return }
        let box = e.shape.boundingBox
        let size = max(min(box.height * 0.42, 26), 10)
        let label = LabelCache.image(e.label, size: size, text: text, alpha: alpha)
        label.draw(at: CGPoint(x: box.midX - label.size.width / 2, y: box.midY - label.size.height / 2))
    }

    static func colours(_ e: RenderElement) -> (UIColor, UIColor, UIColor) {
        if e.lit, e.role != .stickBase {
            return (UIColor(red: 1, green: 0.79, blue: 0.24, alpha: 1), .white, UIColor(white: 0.1, alpha: 1))
        }
        switch e.role {
        case .face: return (UIColor(white: 0.93, alpha: 1), .white, UIColor(white: 0.12, alpha: 1))
        case .dpad: return (UIColor(white: 0.80, alpha: 1), .white, UIColor(white: 0.12, alpha: 1))
        case .shoulder: return (UIColor(white: 0.58, alpha: 1), UIColor(white: 0.8, alpha: 1), UIColor(white: 0.05, alpha: 1))
        case .system, .dot: return (UIColor(white: 0.40, alpha: 1), UIColor(white: 0.65, alpha: 1), .white)
        case .stickBase: return (UIColor(white: 0.22, alpha: 1), UIColor(white: 0.5, alpha: 1), .white)
        case .stickKnob: return (UIColor(white: 0.75, alpha: 1), .white, UIColor(white: 0.12, alpha: 1))
        case .zone, .touchscreen: return (UIColor(red: 0.5, green: 0.66, blue: 1, alpha: 1), .clear, .clear)
        }
    }
}

/// SwiftUI wrapper. The host keeps the `TouchPadView` alive across updates; scheme and
/// geometry changes are pushed in, never rebuilt, so a finger that is down stays down.
///
/// `makeScheme` builds the scheme for an id - override it to configure one (Float's camera
/// mode, Adaptive's saved positions). Bump `revision` to rebuild with the same id after
/// such a setting changes.
public struct TouchPad: UIViewRepresentable {
    public var schemeID: String
    public var revision: Int
    public var makeScheme: (String) -> TouchScheme
    public var output: PadOutput
    public var touchscreenRect: CGRect?
    public var videoRects: [CGRect]
    public var scale: CGFloat
    public var stickSpacing: CGFloat
    public var opacity: CGFloat
    public var haptics: Bool
    public var enabled: Bool
    public var stickTuning: StickTuning
    public var rectSpace: TouchPadView.RectSpace
    public var extraInsets: Insets
    public var onChange: ((PadEngine) -> Void)?

    public init(schemeID: String, output: PadOutput, touchscreenRect: CGRect? = nil, videoRects: [CGRect] = [],
                scale: CGFloat = 1, stickSpacing: CGFloat = 0, opacity: CGFloat = 0.85, haptics: Bool = true, revision: Int = 0,
                enabled: Bool = true, stickTuning: StickTuning = StickTuning(),
                rectSpace: TouchPadView.RectSpace = .local, extraInsets: Insets = Insets(),
                makeScheme: @escaping (String) -> TouchScheme = SchemeCatalog.make,
                onChange: ((PadEngine) -> Void)? = nil) {
        self.enabled = enabled
        self.stickTuning = stickTuning
        self.rectSpace = rectSpace
        self.extraInsets = extraInsets
        self.schemeID = schemeID
        self.revision = revision
        self.makeScheme = makeScheme
        self.output = output
        self.touchscreenRect = touchscreenRect
        self.videoRects = videoRects
        self.scale = scale
        self.stickSpacing = stickSpacing
        self.opacity = opacity
        self.haptics = haptics
        self.onChange = onChange
    }

    public final class Coordinator {
        var revision = 0
    }

    public func makeCoordinator() -> Coordinator { Coordinator() }

    public func makeUIView(context: Context) -> TouchPadView {
        let view = TouchPadView(scheme: makeScheme(schemeID), output: output)
        context.coordinator.revision = revision
        apply(to: view)
        return view
    }

    public func updateUIView(_ view: TouchPadView, context: Context) {
        if view.engine.scheme.info.id != schemeID || context.coordinator.revision != revision {
            context.coordinator.revision = revision
            view.setScheme(makeScheme(schemeID))
        }
        apply(to: view)
    }

    private func apply(to view: TouchPadView) {
        if view.rectSpace != rectSpace { view.rectSpace = rectSpace }
        if view.extraInsets != extraInsets { view.extraInsets = extraInsets }
        if view.stickTuning != stickTuning { view.stickTuning = stickTuning }
        if view.isInputEnabled != enabled { view.isInputEnabled = enabled }
        if view.touchscreenRect != touchscreenRect { view.touchscreenRect = touchscreenRect }
        if view.videoRects != videoRects { view.videoRects = videoRects }
        if view.scale != scale { view.scale = scale }
        if view.stickSpacing != stickSpacing { view.stickSpacing = stickSpacing }
        if view.controlOpacity != opacity { view.controlOpacity = opacity }
        view.hapticsEnabled = haptics
        let engine = view.engine
        view.onChange = onChange.map { f in { f(engine) } }
    }

    public static func dismantleUIView(_ view: TouchPadView, coordinator: Coordinator) {
        view.dropAll()
    }
}
/// Pad labels, rendered once with their halo. The pad redraws on every input change,
/// so during a stick drag every label would otherwise be laid out and blurred again on
/// every frame, on the main thread, while the emulator wants the CPU. What shapes a
/// label (text, size, colour, opacity) changes only with the layout or a setting.
enum LabelCache {
    private struct Key: Hashable {
        let label: String
        let size: CGFloat
        let rgba: [CGFloat]
        let alpha: CGFloat
    }

    // Drawing happens on the main thread only (UIView.draw).
    private static var images: [Key: UIImage] = [:]
    private static let limit = 256

    static func image(_ label: String, size: CGFloat, text: UIColor, alpha: CGFloat) -> UIImage {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        if !text.getRed(&r, green: &g, blue: &b, alpha: &a) {
            text.getWhite(&r, alpha: &a)
            g = r; b = r
        }
        let key = Key(label: label, size: size, rgba: [r, g, b, a], alpha: alpha)
        if let cached = images[key] { return cached }

        // A halo in the opposite tone. The button behind a label is drawn at about half
        // opacity, so what the label actually sits on is mostly the game: the dark
        // shoulder labels disappeared over dark scenes and the white system labels over
        // bright ones.
        let luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
        let halo = NSShadow()
        halo.shadowColor = (luminance < 0.5 ? UIColor.white : UIColor.black).withAlphaComponent(alpha * 0.7)
        halo.shadowBlurRadius = max(1.5, size * 0.12)
        halo.shadowOffset = .zero
        let str = NSAttributedString(string: label, attributes: [
            .font: UIFont.systemFont(ofSize: size, weight: .semibold),
            .foregroundColor: text.withAlphaComponent(alpha),
            .shadow: halo,
        ])
        // Room for the blur on every side, so the halo isn't clipped at the image edge.
        let pad = ceil(halo.shadowBlurRadius * 2)
        let textSize = str.size()
        let canvas = CGSize(width: ceil(textSize.width) + 2 * pad, height: ceil(textSize.height) + 2 * pad)
        let image = UIGraphicsImageRenderer(size: canvas).image { _ in
            str.draw(at: CGPoint(x: pad, y: pad))
        }
        if images.count >= limit { images.removeAll(keepingCapacity: true) }
        images[key] = image
        return image
    }
}
#endif
