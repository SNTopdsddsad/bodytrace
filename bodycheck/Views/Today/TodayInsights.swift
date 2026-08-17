//
//  TodayInsights.swift
//  bodycheck
//
//  概览三块结论：顶部对照表一眼看完；下面才是细节。
//

import SwiftUI

struct TodayGlanceBoard<Rows: View>: View {
    @ViewBuilder var rows: () -> Rows

    var body: some View {
        VStack(spacing: 0) {
            rows()
        }
        .appSurface()
        .accessibilityElement(children: .contain)
        .accessibilityLabel("今日结论")
    }
}

struct TodayGlanceRow: View {
    let label: String
    let value: String
    var tint: Color = .primary
    var actionHint: String
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: AppTheme.space12) {
                Text(label)
                    .font(AppFont.compactUnit)
                    .foregroundStyle(.secondary)
                    .frame(width: 36, alignment: .leading)
                Text(value)
                    .font(AppFont.rowTitleEmphasis)
                    .foregroundStyle(tint)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: AppTheme.space8)
                Image(systemName: "chevron.right")
                    .font(AppFont.inlineAction)
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, AppTheme.cardPadding)
            .padding(.vertical, AppTheme.space12)
            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(label)，\(value)")
        .accessibilityHint(actionHint)
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
