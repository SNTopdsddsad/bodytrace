//
//  FatMeatEquivalentView.swift
//  bodycheck
//
//  净热量的肥肉示意。1 块 = 100 克 = 800 千卡。
//  概览用大块主视觉；日详情用紧凑行。
//

import SwiftUI

struct FatMeatEquivalentView: View {
    enum Style {
        case hero
        case compact
    }

    let netKcal: Double
    var style: Style = .compact

    private var presentation: FatMeatEquivalent.Presentation? {
        FatMeatEquivalent.presentation(netKcal: netKcal)
    }

    var body: some View {
        if let presentation {
            Group {
                switch style {
                case .hero:
                    heroContent(presentation)
                case .compact:
                    compactContent(presentation)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilityText(presentation))
        }
    }

    private func heroContent(_ presentation: FatMeatEquivalent.Presentation) -> some View {
        let units = presentation.unitFractions(maxVisible: 3)
        return VStack(spacing: AppTheme.space16) {
            chunkStage(
                fractions: units.fractions,
                overflow: units.overflowLabel,
                surplus: presentation.isSurplus,
                hero: true
            )

            VStack(spacing: AppTheme.stackTight) {
                Text(presentation.verb)
                    .font(AppFont.sectionTitle)
                    .foregroundStyle(presentation.isSurplus ? AppTheme.intakeAmber : AppTheme.activityGreen)

                MeasurementValue(
                    value: "\(presentation.grams)",
                    unit: "克肥肉",
                    tint: presentation.isSurplus ? AppTheme.intakeAmber : AppTheme.activityGreen,
                    size: .hero
                )

                Text(kcalLine)
                    .font(AppFont.sectionSubtitle.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)

            Text("每块 100 克 · 约 800 千卡 · 估算")
                .font(AppFont.rowMeta)
                .foregroundStyle(.secondary)
        }
    }

    private func compactContent(_ presentation: FatMeatEquivalent.Presentation) -> some View {
        let units = presentation.unitFractions(maxVisible: FatMeatEquivalent.maxVisibleBlocks)
        return VStack(alignment: .leading, spacing: AppTheme.stackDefault) {
            Text(presentation.caption)
                .font(AppFont.sectionSubtitle.weight(.semibold))
                .foregroundStyle(presentation.isSurplus ? AppTheme.intakeAmber : AppTheme.activityGreen)
                .fixedSize(horizontal: false, vertical: true)

            if presentation.showsBlocks || !units.fractions.isEmpty {
                chunkStage(
                    fractions: units.fractions,
                    overflow: units.overflowLabel,
                    surplus: presentation.isSurplus,
                    hero: false
                )
            }

            Text("每块 100 克 · 约 800 千卡 · 估算")
                .font(AppFont.rowMeta)
                .foregroundStyle(.secondary)
        }
    }

    private var kcalLine: String {
        let amount = "\(Int(abs(netKcal).rounded()))"
        if abs(netKcal) < 0.5 { return "净热量 0 千卡" }
        return netKcal > 0 ? "净热量 +\(amount) 千卡" : "净热量 −\(amount) 千卡"
    }

    private func chunkStage(
        fractions: [Double],
        overflow: String?,
        surplus: Bool,
        hero: Bool
    ) -> some View {
        let height: CGFloat = {
            guard hero else { return AppTheme.fatMeatBlockHeight }
            return fractions.count <= 1
                ? AppTheme.fatMeatHeroSingleHeight
                : AppTheme.fatMeatHeroRowHeight
        }()
        let tint = surplus ? AppTheme.intakeAmber : AppTheme.activityGreen

        return VStack(spacing: AppTheme.space8) {
            GeometryReader { geo in
                let count = CGFloat(max(fractions.count, 1))
                let spacing = hero ? AppTheme.space12 : AppTheme.space8
                let width: CGFloat = {
                    if hero && fractions.count <= 1 {
                        return min(geo.size.width * 0.72, 220)
                    }
                    let available = geo.size.width - spacing * max(count - 1, 0)
                    return min(hero ? 128 : AppTheme.fatMeatBlockWidth, available / count)
                }()
                HStack(alignment: .bottom, spacing: spacing) {
                    ForEach(Array(fractions.enumerated()), id: \.offset) { _, fraction in
                        FatMeatChunkImage(fraction: fraction)
                            .frame(width: width, height: height)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            }
            .frame(height: height)

            if let overflow {
                Text(overflow)
                    .font(AppFont.chip)
                    .foregroundStyle(tint)
                    .padding(.horizontal, AppTheme.chipHorizontal)
                    .padding(.vertical, AppTheme.chipVertical)
                    .background(tint.opacity(AppTheme.chipFillOpacity), in: Capsule())
            }
        }
        .padding(.vertical, hero ? AppTheme.space12 : AppTheme.space4)
        .padding(.horizontal, hero ? AppTheme.space8 : 0)
        .frame(maxWidth: .infinity)
        .background {
            if hero {
                RoundedRectangle(cornerRadius: AppTheme.cardCornerRadius, style: .continuous)
                    .fill(tint.opacity(0.10))
            }
        }
    }

    private func accessibilityText(_ presentation: FatMeatEquivalent.Presentation) -> String {
        "\(presentation.verb) \(presentation.grams) 克肥肉。\(kcalLine)。每块 100 克约 800 千卡，估算，不是当天体脂变化。"
    }
}

private struct FatMeatChunkImage: View {
    var fraction: Double

    var body: some View {
        let scale = min(max(fraction, 0.42), 1)
        Image("FatMeatChunk")
            .resizable()
            .scaledToFit()
            .scaleEffect(scale, anchor: .bottom)
            .shadow(color: .black.opacity(0.16), radius: 8, x: 0, y: 5)
            .accessibilityHidden(true)
    }
}

#Preview("概览 81 克") {
    FatMeatEquivalentView(netKcal: -650, style: .hero)
        .padding()
}

#Preview("概览 150 克") {
    FatMeatEquivalentView(netKcal: 1_200, style: .hero)
        .padding()
}

#Preview("概览超过 3 块") {
    FatMeatEquivalentView(netKcal: 4_000, style: .hero)
        .padding()
}

#Preview("日详情") {
    FatMeatEquivalentView(netKcal: -650, style: .compact)
        .padding()
}
