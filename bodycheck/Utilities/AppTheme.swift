//
//  AppTheme.swift
//  bodycheck
//
//  Visual system mapped from opendesign BodyTrack macOS design.md
//

import SwiftUI

enum AppSection: String, CaseIterable, Identifiable, Hashable {
    case today
    case weight
    case food
    case exercise

    var id: String { rawValue }

    var title: String {
        switch self {
        case .today: "概览"
        case .weight: "体重"
        case .food: "饮食"
        case .exercise: "运动"
        }
    }

    var systemImage: String {
        switch self {
        case .today: "rectangle.3.group"
        case .weight: "scalemass"
        case .food: "fork.knife"
        case .exercise: "figure.run"
        }
    }
}

enum AppTheme {
    /// Brand teal — primary actions & chart line. Design: #267A78 / #4FA7A3
    static let brandTeal = Color(light: Color(red: 0.149, green: 0.478, blue: 0.471),
                                 dark: Color(red: 0.310, green: 0.655, blue: 0.639))
    /// Intake amber. Design: #B56A22 / #D99550
    static let intakeAmber = Color(light: Color(red: 0.710, green: 0.416, blue: 0.133),
                                   dark: Color(red: 0.851, green: 0.584, blue: 0.314))
    /// Activity green. Design: #587448 / #7F9C6B
    static let activityGreen = Color(light: Color(red: 0.345, green: 0.455, blue: 0.282),
                                     dark: Color(red: 0.498, green: 0.612, blue: 0.420))

    /// Platform-aware card radius (softer on iPhone).
    static var cardCornerRadius: CGFloat {
        #if os(iOS)
        16
        #else
        12
        #endif
    }

    /// Page horizontal/vertical inset for scroll content.
    static var contentInset: CGFloat {
        #if os(iOS)
        16
        #else
        24
        #endif
    }

    static let contentMaxWidth: CGFloat = 1120
    static let spaceL: CGFloat = 16
    static let spaceXL: CGFloat = 24

    /// Hero weight number size (latest weight).
    static var heroWeightSize: CGFloat {
        #if os(iOS)
        48
        #else
        44
        #endif
    }

    /// Inner padding for primary surface cards.
    static var cardPadding: CGFloat {
        #if os(iOS)
        16
        #else
        22
        #endif
    }
}

enum MacLayout {
    static let windowDefaultWidth: CGFloat = 1100
    static let windowDefaultHeight: CGFloat = 720
    /// Comfortable non-fullscreen default; layout must work down to this size.
    static let windowMinWidth: CGFloat = 880
    static let windowMinHeight: CGFloat = 580

    static let sidebarMin: CGFloat = 176
    static let sidebarIdeal: CGFloat = 200
    static let sidebarMax: CGFloat = 240

    static let inspectorMin: CGFloat = 240
    static let inspectorIdeal: CGFloat = 280
    static let inspectorMax: CGFloat = 320

    /// Below this content width, hide inspector by default / use compact columns.
    static let compactContentWidth: CGFloat = 640
}

// MARK: - Open settings (iOS)

#if os(iOS)
private struct OpenSettingsActionKey: EnvironmentKey {
    static let defaultValue: () -> Void = {}
}

extension EnvironmentValues {
    var openSettings: () -> Void {
        get { self[OpenSettingsActionKey.self] }
        set { self[OpenSettingsActionKey.self] = newValue }
    }
}

/// Trailing gear used on each iPhone tab's navigation bar.
struct IOSSettingsToolbar: ToolbarContent {
    @Environment(\.openSettings) private var openSettings

    var body: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button(action: openSettings) {
                Image(systemName: "gearshape")
            }
            .accessibilityLabel("设置")
        }
    }
}
#endif

/// Flexible table column widths for the weight list.
struct WeightColumnMetrics: Equatable {
    var date: CGFloat
    var weight: CGFloat
    var delta: CGFloat
    var source: CGFloat
    var showDelta: Bool
    var showSource: Bool
    var showNote: Bool

    static func metrics(forAvailableWidth width: CGFloat) -> WeightColumnMetrics {
        let w = max(width, 280)
        if w < 420 {
            // Very narrow: date + weight only
            return WeightColumnMetrics(
                date: min(120, w * 0.42),
                weight: min(100, w * 0.32),
                delta: 0,
                source: 0,
                showDelta: false,
                showSource: false,
                showNote: false
            )
        }
        if w < 560 {
            // Compact: date + weight + source
            return WeightColumnMetrics(
                date: 110,
                weight: 88,
                delta: 0,
                source: 96,
                showDelta: false,
                showSource: true,
                showNote: true
            )
        }
        if w < 720 {
            return WeightColumnMetrics(
                date: 112,
                weight: 90,
                delta: 100,
                source: 96,
                showDelta: true,
                showSource: true,
                showNote: true
            )
        }
        // Comfortable
        return WeightColumnMetrics(
            date: 120,
            weight: 100,
            delta: 110,
            source: 100,
            showDelta: true,
            showSource: true,
            showNote: true
        )
    }
}

// MARK: - Adaptive color helper

extension Color {
    init(light: Color, dark: Color) {
        #if os(macOS)
        self.init(nsColor: NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            return NSColor(isDark ? dark : light)
        })
        #else
        self.init(uiColor: UIColor { trait in
            trait.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
        #endif
    }
}

// MARK: - Surface styles

struct SurfaceStyle: ViewModifier {
    var padding: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background {
                RoundedRectangle(cornerRadius: AppTheme.cardCornerRadius, style: .continuous)
                    .fill(surfaceFill)
                    .overlay {
                        RoundedRectangle(cornerRadius: AppTheme.cardCornerRadius, style: .continuous)
                            .strokeBorder(separatorColor.opacity(0.9), lineWidth: 1)
                    }
            }
    }

    private var surfaceFill: Color {
        #if os(macOS)
        Color(nsColor: .controlBackgroundColor)
        #else
        Color(.secondarySystemGroupedBackground)
        #endif
    }

    private var separatorColor: Color {
        #if os(macOS)
        Color(nsColor: .separatorColor)
        #else
        Color(.separator)
        #endif
    }
}

extension View {
    func appSurface(padding: CGFloat = 0) -> some View {
        modifier(SurfaceStyle(padding: padding))
    }

    func appReadableWidth(_ maxWidth: CGFloat = AppTheme.contentMaxWidth) -> some View {
        frame(maxWidth: maxWidth, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .center)
    }

    @ViewBuilder
    func appFormStyle() -> some View {
        #if os(macOS)
        formStyle(.grouped)
        #else
        self
        #endif
    }

    @ViewBuilder
    func pageBackground() -> some View {
        #if os(macOS)
        background(Color(nsColor: .windowBackgroundColor))
        #else
        background(Color(.systemGroupedBackground))
        #endif
    }
}

struct DeltaChip: View {
    let deltaKg: Double
    let unit: WeightUnit

    var body: some View {
        let display = unit.fromKilograms(deltaKg)
        let absText = String(format: "%.1f", abs(display))
        let text: String = {
            if abs(deltaKg) < 0.000_1 { return "持平" }
            return deltaKg > 0
                ? "↑ \(absText) \(unit.shortLabel)"
                : "↓ \(absText) \(unit.shortLabel)"
        }()

        Text(text)
            .font(.caption.weight(.semibold).monospacedDigit())
            .foregroundStyle(AppTheme.brandTeal)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(AppTheme.brandTeal.opacity(0.12), in: Capsule())
    }
}

struct SourceBadge: View {
    let source: WeightSource

    var body: some View {
        Text(source.displayName)
            .font(.caption2.weight(.medium))
            .foregroundStyle(source == .healthkit ? AppTheme.brandTeal : .secondary)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background {
                Capsule()
                    .fill(Color.primary.opacity(0.04))
                    .overlay {
                        Capsule().strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
                    }
            }
    }
}

struct RecordDot: View {
    enum Kind { case weight, food, activity }

    let kind: Kind

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 6, height: 6)
    }

    private var color: Color {
        switch kind {
        case .weight: AppTheme.brandTeal
        case .food: AppTheme.intakeAmber
        case .activity: AppTheme.activityGreen
        }
    }
}
