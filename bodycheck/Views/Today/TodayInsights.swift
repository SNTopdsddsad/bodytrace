//
//  TodayInsights.swift
//  bodycheck
//
//  概览：热量主卡 + 体重摘要条。
//

import SwiftUI

struct WeightSummaryBar: View {
    let recentText: String
    var recentTint: Color = .primary
    var recentDeltaKg: Double? = nil
    var weightUnit: WeightUnit = .kg
    let recentHint: String
    let recentAction: () -> Void

    var body: some View {
        Button(action: recentAction) {
            VStack(alignment: .leading, spacing: AppTheme.stackTight) {
                Text("最近")
                    .font(AppFont.compactUnit)
                    .foregroundStyle(.secondary)
                HStack(alignment: .firstTextBaseline, spacing: AppTheme.space8) {
                    Text(recentText)
                        .font(AppFont.rowTitleEmphasis)
                        .foregroundStyle(recentTint)
                        .multilineTextAlignment(.leading)
                        .lineLimit(2)
                        .minimumScaleFactor(0.85)
                    if let recentDeltaKg {
                        DeltaChip(deltaKg: recentDeltaKg, unit: weightUnit)
                    }
                }
            }
            .padding(.horizontal, AppTheme.cardPadding)
            .padding(.vertical, AppTheme.space12)
            .frame(maxWidth: .infinity, minHeight: 48, alignment: .topLeading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .appSurface()
        .accessibilityLabel(accessibilityText)
        .accessibilityHint(recentHint)
    }

    private var accessibilityText: String {
        guard let recentDeltaKg else { return "最近，\(recentText)" }
        if abs(recentDeltaKg) < 0.000_1 { return "最近，\(recentText)，持平" }
        let change = weightUnit.format(abs(recentDeltaKg))
        return recentDeltaKg > 0
            ? "最近，\(recentText)，重了 \(change)"
            : "最近，\(recentText)，轻了 \(change)"
    }
}

struct TodayInsightCard<Content: View>: View {
    let title: String
    var actionTitle: String
    var actionTint: Color = AppTheme.brandTeal
    var action: () -> Void
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.stackLoose) {
            HStack(alignment: .firstTextBaseline, spacing: AppTheme.space8) {
                Text(title)
                    .font(AppFont.sectionTitle)
                Spacer(minLength: AppTheme.space8)
                Button(actionTitle, action: action)
                    .buttonStyle(.borderless)
                    .font(AppFont.inlineAction)
                    .foregroundStyle(actionTint)
            }
            content()
        }
        .padding(AppTheme.cardPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .appSurface()
    }
}
