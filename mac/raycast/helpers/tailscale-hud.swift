// Status pill for flip-tailscale-profile.sh.
//
// Usage: tailscale-hud <icon-path>
// Reads "<loading|success|warning|failure>\t<text>" lines from stdin, and fades out on EOF.

import AppKit

final class HUD {
    private let panel = NSPanel(
        contentRect: .zero,
        styleMask: [.borderless, .nonactivatingPanel],
        backing: .buffered,
        defer: false
    )
    private let label = NSTextField(labelWithString: "")
    private let dot = NSView()
    private let stack: NSStackView
    private var state = ""
    private var isVisible = false

    private let height: CGFloat = 44
    private let bottomOffset: CGFloat = 96

    init(iconPath: String?) {
        let icon = NSImageView()
        icon.image = iconPath.flatMap { NSImage(contentsOfFile: $0) }
        icon.imageScaling = .scaleProportionallyUpOrDown
        icon.widthAnchor.constraint(equalToConstant: 24).isActive = true
        icon.heightAnchor.constraint(equalToConstant: 24).isActive = true

        label.font = .systemFont(ofSize: 14, weight: .medium)
        label.textColor = .labelColor
        label.lineBreakMode = .byTruncatingTail

        dot.wantsLayer = true
        dot.layer?.cornerRadius = 4
        dot.widthAnchor.constraint(equalToConstant: 8).isActive = true
        dot.heightAnchor.constraint(equalToConstant: 8).isActive = true

        stack = NSStackView(views: [icon, label, dot])
        stack.orientation = .horizontal
        stack.alignment = .centerY
        stack.spacing = 10
        stack.setCustomSpacing(12, after: label)
        stack.edgeInsets = NSEdgeInsets(top: 0, left: 12, bottom: 0, right: 16)
        stack.translatesAutoresizingMaskIntoConstraints = false

        let background = NSVisualEffectView()
        background.material = .hudWindow
        background.blendingMode = .behindWindow
        background.state = .active
        background.autoresizingMask = [.width, .height]

        let container = NSView()
        container.wantsLayer = true
        container.layer?.cornerRadius = height / 2
        container.layer?.masksToBounds = true
        container.addSubview(background)
        container.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            stack.centerYAnchor.constraint(equalTo: container.centerYAnchor),
        ])

        panel.contentView = container
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.level = .statusBar
        panel.ignoresMouseEvents = true
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.alphaValue = 0
    }

    func show(state: String, text: String) {
        self.state = state
        label.stringValue = text
        dot.layer?.backgroundColor = color(for: state).cgColor
        setPulsing(state == "loading")
        layout()

        guard !isVisible else { return }
        isVisible = true
        panel.orderFrontRegardless()
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.12
            panel.animator().alphaValue = 1
        }
    }

    func finish() {
        guard isVisible else { exit(0) }
        let hold: TimeInterval = state == "failure" ? 3 : 1.4
        DispatchQueue.main.asyncAfter(deadline: .now() + hold) { [self] in
            NSAnimationContext.runAnimationGroup(
                { context in
                    context.duration = 0.25
                    panel.animator().alphaValue = 0
                },
                completionHandler: { exit(0) }
            )
        }
    }

    private func layout() {
        stack.layoutSubtreeIfNeeded()
        let screen = screenUnderMouse()
        let visible = screen.visibleFrame
        let width = min(ceil(stack.fittingSize.width), visible.width - 40)
        panel.setFrame(
            NSRect(
                x: visible.midX - width / 2,
                y: visible.minY + bottomOffset,
                width: width,
                height: height
            ),
            display: true
        )
        panel.contentView?.subviews.first?.frame = panel.contentView?.bounds ?? .zero
        panel.invalidateShadow()
    }

    private func screenUnderMouse() -> NSScreen {
        let mouse = NSEvent.mouseLocation
        return NSScreen.screens.first { $0.frame.contains(mouse) } ?? NSScreen.main ?? NSScreen.screens[0]
    }

    private func color(for state: String) -> NSColor {
        switch state {
        case "success": return .systemGreen
        case "failure": return .systemRed
        default: return .systemOrange
        }
    }

    private func setPulsing(_ pulsing: Bool) {
        guard pulsing else {
            dot.layer?.removeAnimation(forKey: "pulse")
            return
        }
        let pulse = CABasicAnimation(keyPath: "opacity")
        pulse.fromValue = 1
        pulse.toValue = 0.25
        pulse.duration = 0.5
        pulse.autoreverses = true
        pulse.repeatCount = .infinity
        dot.layer?.add(pulse, forKey: "pulse")
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let hud = HUD(iconPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : nil)

Thread.detachNewThread {
    while let line = readLine() {
        let parts = line.split(separator: "\t", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { continue }
        DispatchQueue.main.async { hud.show(state: parts[0], text: parts[1]) }
    }
    DispatchQueue.main.async { hud.finish() }
}

// Never outlive a hung caller.
DispatchQueue.main.asyncAfter(deadline: .now() + 30) { exit(0) }

app.run()
