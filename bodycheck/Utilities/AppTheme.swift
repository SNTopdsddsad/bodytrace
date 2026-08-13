//
//  AppTheme.swift
//  bodycheck
//
//  iPhone visual tokens: color, type, spacing, shared chrome.
//  Mac layout constants stay below; do not restyle Mac UI from here.
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
    static let brandTeal = BrandColor.teal
    static let intakeAmber = BrandColor.amber
    static let activityGreen = BrandColor.green

    static let danger = Color.red
    static let hairline = Color.primary.opacity(0.08)
    static let chipFillOpacity = 0.12
    static let accentStrokeOpacity = 0.18

    /// 4pt grid. Prefer these over ad-hoc padding.
    static let space2: CGFloat = 2
    static let space4: CGFloat = 4
    static let space8: CGFloat = 8
    static let space12: CGFloat = 12
    static let space16: CGFloat = 16
    static let space20: CGFloat = 20
    static let space24: CGFloat = 24

    /// Title + caption stacked in a card.
    static let stackTight: CGFloat = space4
    /// Default in-card stack (icon + label, row title + meta).
    static let stackDefault: CGFloat = space8
    /// Card internals (eyebrow → number → chips).
    static let stackLoose: CGFloat = space12
    /// Extra inset on list rows that already have system padding.
    static let rowVertical: CGFloat = space4
    static let chipHorizontal: CGFloat = space8
    static let chipVertical: CGFloat = space4

    static let iconWellSize: CGFloat = 36
    static let iconWellRadius: CGFloat = 10
    static let thumbSize: CGFloat = 48
    static let thumbRadius: CGFloat = 8
    static let statusBarPadding: CGFloat = 12
    static let recordDotSize: CGFloat = 6
    static let recordDotColumn: CGFloat = 10

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
        space16
        #else
        space24
        #endif
    }

    static let contentMaxWidth: CGFloat = 1120
    static let spaceL: CGFloat = space16
    static let spaceXL: CGFloat = space24

    /// Hero weight number size (latest weight).
    static var heroWeightSize: CGFloat {
        #if os(iOS)
        48
        #else
        44
        #endif
    }

    /// Net calories / daily intake hero.
    static let metricNumberSize: CGFloat = 32
    /// Three-column tiles and list summary numbers.
    static let compactNumberSize: CGFloat = 22

    /// Inner padding for primary surface cards.
    static var cardPadding: CGFloat {
        #if os(iOS)
        space16
        #else
        22
        #endif
    }

    static var compactTilePadding: CGFloat {
        #if os(iOS)
        space12
        #else
        space16
        #endif
    }
}

/// Semantic type roles. Prefer these over raw `.system(size:)`.
enum AppFont {
    /// Uppercase card eyebrow: 最新体重 / 当天热量
    static let eyebrow = Font.caption.weight(.semibold)
    /// Card and section titles.
    static let sectionTitle = Font.headline
    /// Line under a section title.
    static let sectionSubtitle = Font.footnote

    static var heroNumber: Font {
        .system(size: AppTheme.heroWeightSize, weight: .semibold, design: .rounded)
    }

    static let heroUnit = Font.title3.weight(.medium)

    static let metricNumber = Font.system(size: AppTheme.metricNumberSize, weight: .semibold, design: .rounded)
    static let metricUnit = Font.subheadline.weight(.medium)

    static let compactNumber = Font.system(size: AppTheme.compactNumberSize, weight: .semibold, design: .rounded)
    static let compactUnit = Font.caption.weight(.medium)

    static let rowTitle = Font.body.weight(.medium)
    static let rowTitleEmphasis = Font.body.weight(.semibold)
    /// Primary number when the row *is* a measurement (体重列表).
    static let listHero = Font.title3.weight(.semibold)
    static let rowMeta = Font.caption
    static let rowDate = Font.subheadline
    static let rowValue = Font.subheadline.weight(.semibold).monospacedDigit()

    static let emptyTitle = Font.title3.weight(.semibold)
    static let emptyBody = Font.subheadline
    static let inlineAction = Font.caption.weight(.medium)
    static let chip = Font.caption.weight(.semibold).monospacedDigit()
    static let badge = Font.caption2.weight(.medium)
    static let formError = Font.footnote
    static let icon = Font.subheadline.weight(.semibold)
    static let toolbarIcon = Font.title3
    static let detailTitle = Font.title2.weight(.semibold)
    static let detailLabel = Font.footnote
    static let detailValue = Font.subheadline
    static let listSectionHeader = Font.subheadline
    /// Longer settings / privacy copy.
    static let prose = Font.callout
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

struct SectionEyebrow: View {
    let text: String

    var body: some View {
        Text(text)
            .font(AppFont.eyebrow)
            .foregroundStyle(.secondary)
            .textCase(.uppercase)
            .tracking(0.4)
    }
}

struct MeasurementValue: View {
    enum Size {
        case hero
        case metric
        case compact
    }

    let value: String
    var unit: String? = nil
    var tint: Color = .primary
    var size: Size = .hero
    var dimmed: Bool = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: AppTheme.space4) {
            Text(value)
                .font(numberFont)
                .monospacedDigit()
                .foregroundStyle(dimmed ? Color.secondary : tint)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
            if let unit {
                Text(unit)
                    .font(unitFont)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var numberFont: Font {
        switch size {
        case .hero: AppFont.heroNumber
        case .metric: AppFont.metricNumber
        case .compact: AppFont.compactNumber
        }
    }

    private var unitFont: Font {
        switch size {
        case .hero: AppFont.heroUnit
        case .metric: AppFont.metricUnit
        case .compact: AppFont.compactUnit
        }
    }
}

struct IconWell: View {
    let systemName: String
    var tint: Color = AppTheme.brandTeal

    var body: some View {
        Image(systemName: systemName)
            .font(AppFont.icon)
            .foregroundStyle(tint)
            .frame(width: AppTheme.iconWellSize, height: AppTheme.iconWellSize)
            .background {
                RoundedRectangle(cornerRadius: AppTheme.iconWellRadius, style: .continuous)
                    .fill(tint.opacity(AppTheme.chipFillOpacity))
            }
    }
}

struct VerticalHairline: View {
    var body: some View {
        Rectangle()
            .fill(AppTheme.hairline)
            .frame(width: 1)
            .padding(.vertical, AppTheme.space8)
    }
}

struct EnergyBreakdownCell: View {
    let label: String
    var symbol: String? = nil
    var tint: Color = .secondary
    let value: String?
    var unit: String = "千卡"
    var meta: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.stackDefault) {
            HStack(spacing: AppTheme.space4) {
                if let symbol {
                    Image(systemName: symbol)
                        .font(AppFont.eyebrow)
                        .foregroundStyle(tint)
                }
                Text(label)
                    .font(AppFont.compactUnit)
                    .foregroundStyle(.secondary)
            }
            MeasurementValue(
                value: value ?? "—",
                unit: unit,
                tint: value == nil ? .secondary : tint,
                size: .compact,
                dimmed: value == nil
            )
            if let meta {
                Text(meta)
                    .font(AppFont.rowMeta)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, AppTheme.space12)
        .padding(.vertical, AppTheme.space8)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct FormErrorText: View {
    let message: String

    var body: some View {
        Text(message)
            .font(AppFont.formError)
            .foregroundStyle(AppTheme.danger)
    }
}

struct TintedChip: View {
    let text: String
    var tint: Color = AppTheme.brandTeal

    var body: some View {
        Text(text)
            .font(AppFont.badge)
            .foregroundStyle(tint)
            .padding(.horizontal, AppTheme.chipHorizontal)
            .padding(.vertical, AppTheme.chipVertical)
            .background(tint.opacity(AppTheme.chipFillOpacity), in: Capsule())
    }
}

struct SummaryMetricTile: View {
    let label: String
    let value: String?
    var unit: String? = nil
    var symbol: String? = nil
    var tint: Color = AppTheme.brandTeal
    var showAccentStroke: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.stackDefault) {
            if let symbol {
                IconWell(systemName: symbol, tint: tint)
            }
            Text(label)
                .font(AppFont.rowMeta)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            MeasurementValue(
                value: value ?? "—",
                unit: (value != nil) ? unit : nil,
                tint: value == nil ? .secondary : .primary,
                size: .compact,
                dimmed: value == nil
            )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(AppTheme.compactTilePadding)
        .background {
            RoundedRectangle(cornerRadius: AppTheme.cardCornerRadius, style: .continuous)
                .fill(tileFill)
                .overlay {
                    if showAccentStroke {
                        RoundedRectangle(cornerRadius: AppTheme.cardCornerRadius, style: .continuous)
                            .strokeBorder(tint.opacity(AppTheme.accentStrokeOpacity), lineWidth: 1)
                    }
                }
        }
    }

    private var tileFill: Color {
        #if os(iOS)
        Color(.secondarySystemGroupedBackground)
        #else
        Color(nsColor: .controlBackgroundColor)
        #endif
    }
}

#if os(iOS)
struct IOSCircleAddButton: View {
    let accessibilityLabel: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "plus.circle.fill")
                .symbolRenderingMode(.hierarchical)
                .font(AppFont.toolbarIcon)
                .foregroundStyle(AppTheme.brandTeal)
        }
        .accessibilityLabel(accessibilityLabel)
    }
}
#endif

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
            .font(AppFont.chip)
            .foregroundStyle(AppTheme.brandTeal)
            .padding(.horizontal, AppTheme.chipHorizontal)
            .padding(.vertical, AppTheme.chipVertical)
            .background(AppTheme.brandTeal.opacity(AppTheme.chipFillOpacity), in: Capsule())
    }
}

struct SourceBadge: View {
    let source: WeightSource

    var body: some View {
        Text(source.displayName)
            .font(AppFont.badge)
            .foregroundStyle(source == .healthkit ? AppTheme.brandTeal : .secondary)
            .padding(.horizontal, AppTheme.chipHorizontal)
            .padding(.vertical, AppTheme.chipVertical)
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
            .frame(width: AppTheme.recordDotSize, height: AppTheme.recordDotSize)
    }

    private var color: Color {
        switch kind {
        case .weight: AppTheme.brandTeal
        case .food: AppTheme.intakeAmber
        case .activity: AppTheme.activityGreen
        }
    }
}
