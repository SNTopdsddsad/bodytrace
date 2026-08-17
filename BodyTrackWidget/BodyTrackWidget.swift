//
//  BodyTrackWidget.swift
//  BodyTrackWidget
//

import AppIntents
import SwiftUI
import WidgetKit

@main
struct BodyTrackWidgetBundle: WidgetBundle {
    var body: some Widget {
        WeightWidget()
    }
}

struct WeightWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: WidgetSnapshotStore.widgetKind,
            provider: WeightWidgetProvider()
        ) { entry in
            WeightWidgetView(entry: entry)
        }
        .configurationDisplayName("体重")
        .description("查看最新体重，点按即可记录。")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct WeightWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

/// WidgetKit calls these off the main actor. Keep the type nonisolated so
/// the extension can launch from SpringBoard without a MainActor hop.
struct WeightWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> WeightWidgetEntry {
        WeightWidgetEntry(date: Date(), snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (WeightWidgetEntry) -> Void) {
        let snapshot = context.isPreview ? WidgetSnapshot.placeholder : WidgetSnapshotStore.load()
        completion(WeightWidgetEntry(date: Date(), snapshot: snapshot))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WeightWidgetEntry>) -> Void) {
        let entry = WeightWidgetEntry(date: Date(), snapshot: WidgetSnapshotStore.load())
        let nextRefresh = Calendar.current.nextDate(
            after: Date(),
            matching: DateComponents(hour: 0, minute: 1),
            matchingPolicy: .nextTime
        ) ?? Date().addingTimeInterval(3600)
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }
}

// MARK: - Views

private enum WidgetPalette {
    static let brand = BrandColor.teal
    static let intake = BrandColor.amber
    static let activity = BrandColor.green
}

struct WeightWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WeightWidgetEntry

    var body: some View {
        Group {
            switch family {
            case .systemMedium:
                mediumLayout
            default:
                smallLayout
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(for: .widget) {
            Color(.systemBackground)
        }
        .widgetURL(DeepLink.logWeightURL)
        .environment(\.locale, Locale(identifier: "zh-Hans"))
    }

    private var snapshot: WidgetSnapshot { entry.snapshot }

    private var smallLayout: some View {
        VStack(alignment: .leading, spacing: 6) {
            header(title: "最新体重", symbol: "scalemass")
            weightBlock
            Spacer(minLength: 0)
            deltaLine
        }
    }

    private var mediumLayout: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    header(title: "最新体重", symbol: "scalemass")
                    weightBlock
                    deltaLine
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                VStack(alignment: .leading, spacing: 6) {
                    header(title: "今日热量差", symbol: "plusminus", tint: netTint)
                    netBlock
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            Spacer(minLength: 0)

            Button(intent: LogWeightIntent()) {
                Label("记录体重", systemImage: "plus")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
            }
            .tint(WidgetPalette.brand)
            .buttonStyle(.borderedProminent)
        }
    }

    private func header(title: String, symbol: String, tint: Color = WidgetPalette.brand) -> some View {
        HStack(spacing: 4) {
            Image(systemName: symbol)
            Text(title)
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(tint)
        .lineLimit(1)
    }

    @ViewBuilder
    private var weightBlock: some View {
        if let kg = snapshot.latestWeightKg {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(String(format: "%.1f", snapshot.weightUnit.fromKilograms(kg)))
                    .font(.system(size: family == .systemSmall ? 32 : 28, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text(snapshot.weightUnit.shortLabel)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
            }
        } else {
            Text("暂无体重")
                .font(.headline)
            Text("点按记录")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var deltaLine: some View {
        if snapshot.latestWeightKg != nil {
            HStack(spacing: 6) {
                if let delta = snapshot.deltaKg {
                    Text(deltaText(delta))
                        .font(.caption.weight(.semibold).monospacedDigit())
                        .foregroundStyle(WidgetPalette.brand)
                }
                if let date = snapshot.latestWeightDate {
                    Text(date, format: .dateTime.month().day().locale(Locale(identifier: "zh-Hans")))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .lineLimit(1)
        }
    }

    private var netTint: Color {
        guard let net = snapshot.displayedTodayNetCalories, abs(net) >= 0.5 else {
            return .secondary
        }
        return net > 0 ? WidgetPalette.intake : WidgetPalette.activity
    }

    @ViewBuilder
    private var netBlock: some View {
        if let net = snapshot.displayedTodayNetCalories {
            if let presentation = FatMeatEquivalent.presentation(netKcal: net) {
                meatNetBlock(presentation, net: net)
            } else {
                kcalOnlyBlock(net)
            }
        } else {
            Text("—")
                .font(.system(size: 28, weight: .semibold, design: .rounded))
                .foregroundStyle(.secondary)
            Text("记录后计算")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func meatNetBlock(_ presentation: FatMeatEquivalent.Presentation, net: Double) -> some View {
        let units = presentation.unitFractions(maxVisible: 1)
        return HStack(alignment: .center, spacing: 8) {
            ZStack(alignment: .bottomTrailing) {
                WidgetFatChunkImage(fraction: units.fractions.first ?? 1)
                    .frame(width: 56, height: 44)

                if presentation.wholeBlocks > 1 {
                    Text("×\(presentation.wholeBlocks)")
                        .font(.caption2.weight(.bold).monospacedDigit())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 1)
                        .background(netTint, in: Capsule())
                }
            }
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 1) {
                Text(presentation.verb)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(netTint)
                    .lineLimit(1)
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text("\(presentation.grams)")
                        .font(.system(size: 22, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .minimumScaleFactor(0.7)
                        .lineLimit(1)
                        .foregroundStyle(netTint)
                    Text("克")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(netTint)
                }
                Text("\(netText(net)) 千卡")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(presentation.verb) \(presentation.grams) 克肥肉，\(netText(net)) 千卡")
    }

    private func kcalOnlyBlock(_ net: Double) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(netText(net))
                    .font(.system(size: 28, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .minimumScaleFactor(0.55)
                    .lineLimit(1)
                    .foregroundStyle(netTint)
                Text("千卡")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
            }
            Text(snapshot.displayedNetCaption ?? "摄入 − 活动能量 − 静息能量")
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
        }
    }

    private func netText(_ net: Double) -> String {
        if abs(net) < 0.5 { return "0" }
        let amount = "\(Int(abs(net).rounded()))"
        return net > 0 ? "+\(amount)" : "−\(amount)"
    }

    private func deltaText(_ deltaKg: Double) -> String {
        let unit = snapshot.weightUnit
        let display = unit.fromKilograms(deltaKg)
        if abs(deltaKg) < 0.000_1 { return "持平" }
        let absText = String(format: "%.1f", abs(display))
        return deltaKg > 0
            ? "↑ \(absText) \(unit.shortLabel)"
            : "↓ \(absText) \(unit.shortLabel)"
    }
}

private struct WidgetFatChunkImage: View {
    var fraction: Double

    var body: some View {
        let scale = min(max(fraction, 0.45), 1)
        Image("FatMeatChunk")
            .resizable()
            .scaledToFit()
            .scaleEffect(scale, anchor: .bottom)
    }
}

#Preview("小", as: .systemSmall) {
    WeightWidget()
} timeline: {
    WeightWidgetEntry(date: Date(), snapshot: .placeholder)
    WeightWidgetEntry(date: Date(), snapshot: .empty)
}

#Preview("中", as: .systemMedium) {
    WeightWidget()
} timeline: {
    WeightWidgetEntry(date: Date(), snapshot: .placeholder)
    WeightWidgetEntry(date: Date(), snapshot: .empty)
}
