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
    let goalText: String
    var goalTint: Color = .primary
    let goalHint: String
    let goalAction: () -> Void
    var goalFilled: Bool = true

    var body: some View {
        Group {
            if goalFilled {
                HStack(alignment: .top, spacing: 0) {
                    cell(
                        label: "最近",
                        value: recentText,
                        tint: recentTint,
                        showsDelta: true,
                        hint: recentHint,
                        action: recentAction
                    )
                    VerticalHairline()
                    cell(
                        label: "目标",
                        value: goalText,
                        tint: goalTint,
                        hint: goalHint,
                        action: goalAction
                    )
                }
            } else {
                VStack(alignment: .leading, spacing: AppTheme.stackTight) {
                    HStack(alignment: .center, spacing: AppTheme.space8) {
                        Text("最近")
                            .font(AppFont.compactUnit)
                            .foregroundStyle(.secondary)
                        Spacer(minLength: AppTheme.space8)
                        Button(action: goalAction) {
                            Text("填写目标体重")
                                .font(AppFont.inlineAction)
                                .foregroundStyle(.tertiary)
                                .frame(minHeight: 44)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("填写目标体重")
                        .accessibilityHint(goalHint)
                    }
                    Button(action: recentAction) {
                        recentValue
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("最近，\(recentText)")
                    .accessibilityHint(recentHint)
                }
                .padding(.horizontal, AppTheme.cardPadding)
                .padding(.vertical, AppTheme.space12)
            }
        }
        .appSurface()
        .accessibilityElement(children: .contain)
        .accessibilityLabel("体重摘要")
    }

    private var recentValue: some View {
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
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func cell(
        label: String,
        value: String,
        tint: Color,
        showsDelta: Bool = false,
        hint: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: AppTheme.stackTight) {
                Text(label)
                    .font(AppFont.compactUnit)
                    .foregroundStyle(.secondary)
                if showsDelta {
                    recentValue
                } else {
                    Text(value)
                        .font(AppFont.rowTitleEmphasis)
                        .foregroundStyle(tint)
                        .multilineTextAlignment(.leading)
                        .lineLimit(2)
                        .minimumScaleFactor(0.85)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, AppTheme.cardPadding)
            .padding(.vertical, AppTheme.space12)
            .frame(maxWidth: .infinity, minHeight: 48, alignment: .topLeading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityText(label: label, value: value, deltaKg: showsDelta ? recentDeltaKg : nil))
        .accessibilityHint(hint)
    }

    private func accessibilityText(label: String, value: String, deltaKg: Double?) -> String {
        guard let deltaKg else { return "\(label)，\(value)" }
        if abs(deltaKg) < 0.000_1 { return "\(label)，\(value)，持平" }
        let change = weightUnit.format(abs(deltaKg))
        return deltaKg > 0 ? "\(label)，\(value)，重了 \(change)" : "\(label)，\(value)，轻了 \(change)"
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
