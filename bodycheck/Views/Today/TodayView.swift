//
//  TodayView.swift
//  bodycheck
//
//  Overview page — design: mac-overview.html / design.md §4.1
//

import Charts
import SwiftData
import SwiftUI

struct TodayView: View {
    var onOpenWeight: (() -> Void)?

    @AppStorage("weightUnit") private var weightUnitRaw: String = WeightUnit.kg.rawValue
    @Query(sort: \WeightEntry.date, order: .reverse) private var weights: [WeightEntry]
    @Query(sort: \FoodEntry.date, order: .reverse) private var foods: [FoodEntry]
    @Query(sort: \ExerciseEntry.date, order: .reverse) private var exercises: [ExerciseEntry]

    @State private var showQuickWeight = false
    @State private var showQuickFood = false
    @State private var chartRange: ChartRange = .days30

    private var weightUnit: WeightUnit {
        WeightUnit(rawValue: weightUnitRaw) ?? .kg
    }

    private var latestWeight: WeightEntry? { weights.first }
    private var previousWeight: WeightEntry? { weights.count > 1 ? weights[1] : nil }

    private var weightDelta: Double? {
        guard let latest = latestWeight, let previous = previousWeight else { return nil }
        return latest.weight - previous.weight
    }

    private var todayFoods: [FoodEntry] {
        let day = Calendar.current.dayInterval(for: Date())
        return foods.filter { $0.date >= day.start && $0.date < day.end }
    }

    private var todayExercises: [ExerciseEntry] {
        let day = Calendar.current.dayInterval(for: Date())
        return exercises.filter { $0.date >= day.start && $0.date < day.end }
    }

    private var todayCalories: Double? {
        guard !todayFoods.isEmpty else { return nil }
        return todayFoods.reduce(0) { $0 + $1.calories }
    }

    private var todayExerciseMinutes: Int? {
        guard !todayExercises.isEmpty else { return nil }
        return todayExercises.reduce(0) { $0 + $1.durationMinutes }
    }

    private var todayExerciseBurn: Double? {
        let burns = todayExercises.compactMap(\.caloriesBurned)
        guard !burns.isEmpty else { return nil }
        return burns.reduce(0, +)
    }

    private var chartPoints: [WeightChartPoint] {
        WeightChartPoint.points(from: weights, range: chartRange)
    }

    private var chartRangeDelta: Double? {
        guard let first = chartPoints.first, let last = chartPoints.last, chartPoints.count > 1 else { return nil }
        return last.weightKg - first.weightKg
    }

    private var recentItems: [RecentRecord] {
        RecentRecord.build(weights: weights, foods: foods, exercises: exercises, limit: 8)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AppTheme.spaceL) {
                    leadSection
                    chartSection
                    recentSection
                }
                .padding(AppTheme.contentInset)
                .appReadableWidth()
            }
            .pageBackground()
            .navigationTitle("今日概览")
            #if os(macOS)
            .navigationSubtitle(Date.now.formatted(.dateTime.year().month().day().weekday(.wide)))
            #endif
            .toolbar { toolbarContent }
            .sheet(isPresented: $showQuickWeight) {
                WeightEditorView(mode: .create)
            }
            .sheet(isPresented: $showQuickFood) {
                FoodEditorSheet()
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItemGroup(placement: .primaryAction) {
            Button {
                showQuickFood = true
            } label: {
                Label("记录饮食", systemImage: "fork.knife")
            }

            Button {
                showQuickWeight = true
            } label: {
                Label("记录体重", systemImage: "plus")
            }
            .keyboardShortcut("n", modifiers: [.command])

            Menu {
                Button("记录体重") { showQuickWeight = true }
                Button("记录饮食") { showQuickFood = true }
                // 运动仅来自 Apple 健康，不在此手动录入
            } label: {
                Image(systemName: "chevron.down")
            }
            .help("选择记录类型")
            .accessibilityLabel("选择记录类型")
        }
    }

    // MARK: - Lead

    private var leadSection: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: AppTheme.spaceL) {
                weightHero
                todaySummary
                    .frame(maxWidth: 340)
            }
            VStack(spacing: AppTheme.spaceL) {
                weightHero
                todaySummary
            }
        }
    }

    private var weightHero: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("最新体重")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
                .tracking(0.4)

            if let latest = latestWeight {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(String(format: "%.1f", weightUnit.fromKilograms(latest.weight)))
                        .font(.system(size: 44, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                    Text(weightUnit.shortLabel)
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(.secondary)
                }

                HStack(spacing: 9) {
                    if let delta = weightDelta {
                        DeltaChip(deltaKg: delta, unit: weightUnit)
                    }
                    Text(latest.date, format: .dateTime.year().month().day())
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }

                Divider().padding(.top, 8)

                Text("数据保存在你的设备上，并通过你的私人 iCloud 在 iPhone 与 Mac 之间同步。")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 4)
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    Text("还没有体重记录")
                        .font(.title3.weight(.semibold))
                    Text("记录第一条体重，开始了解自己的变化。")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Button("记录体重") { showQuickWeight = true }
                        .buttonStyle(.borderedProminent)
                        .tint(AppTheme.brandTeal)
                        .padding(.top, 4)
                }
                .padding(.vertical, 12)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 180, alignment: .topLeading)
        .appSurface(padding: 22)
    }

    private var todaySummary: some View {
        VStack(spacing: 0) {
            summaryRow(
                symbol: "flame.fill",
                tint: AppTheme.intakeAmber,
                label: "今日摄入",
                value: todayCalories.map { "\(Int($0.rounded()))" },
                unit: "kcal",
                meta: todayFoods.isEmpty ? nil : "\(todayFoods.count) 条饮食记录"
            )
            Divider()
            summaryRow(
                symbol: "timer",
                tint: AppTheme.activityGreen,
                label: "今日运动",
                value: todayExerciseMinutes.map { "\($0)" },
                unit: "分钟",
                meta: exerciseMeta ?? healthExerciseHint
            )
        }
        .frame(maxWidth: .infinity, minHeight: 180)
        .appSurface()
    }

    private var exerciseMeta: String? {
        if todayExercises.isEmpty { return nil }
        if let burn = todayExerciseBurn {
            return "消耗 \(Int(burn.rounded())) kcal · 健康"
        }
        return "\(todayExercises.count) 条 · 来自健康"
    }

    private var healthExerciseHint: String {
        #if os(macOS)
        "来自 Apple 健康（iPhone 同步）"
        #else
        "在「运动」页从健康同步"
        #endif
    }

    private func summaryRow(
        symbol: String,
        tint: Color,
        label: String,
        value: String?,
        unit: String,
        meta: String?
    ) -> some View {
        HStack(spacing: 16) {
            Image(systemName: symbol)
                .font(.system(size: 15))
                .foregroundStyle(tint)
                .frame(width: 36, height: 36)
                .background {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color.primary.opacity(0.03))
                        .overlay {
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
                        }
                }

            VStack(alignment: .leading, spacing: 3) {
                Text(label)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(value ?? "—")
                        .font(.system(size: 22, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                    if value != nil {
                        Text(unit)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(.secondary)
                    }
                }
                if let meta {
                    Text(meta)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(maxWidth: .infinity, minHeight: 100, alignment: .leading)
    }

    // MARK: - Chart

    private var chartSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("体重趋势")
                        .font(.system(size: 14, weight: .semibold))
                    Text(chartSubtitle)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Picker("范围", selection: $chartRange) {
                    ForEach(ChartRange.allCases) { range in
                        Text(range.label).tag(range)
                    }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 280)
                .labelsHidden()
            }

            if chartPoints.count >= 2 {
                Chart(chartPoints) { point in
                    LineMark(
                        x: .value("日期", point.day),
                        y: .value("体重", weightUnit.fromKilograms(point.weightKg))
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(AppTheme.brandTeal)
                    .lineStyle(StrokeStyle(lineWidth: 2))

                    PointMark(
                        x: .value("日期", point.day),
                        y: .value("体重", weightUnit.fromKilograms(point.weightKg))
                    )
                    .foregroundStyle(AppTheme.brandTeal)
                    .symbolSize(24)
                }
                .chartYScale(domain: .automatic(includesZero: false))
                .frame(height: 200)
                .padding(.top, 4)
            } else if chartPoints.count == 1 {
                ContentUnavailableView(
                    "再记录一次即可查看变化",
                    systemImage: "chart.xyaxis.line",
                    description: Text("趋势图会在有至少两条体重后显示。")
                )
                .frame(height: 180)
            } else {
                ContentUnavailableView(
                    "暂无趋势",
                    systemImage: "chart.xyaxis.line",
                    description: Text("记录体重后即可查看趋势。")
                )
                .frame(height: 180)
            }
        }
        .appSurface(padding: 20)
    }

    private var chartSubtitle: String {
        if let delta = chartRangeDelta {
            let sign = delta > 0 ? "+" : ""
            let text = String(format: "%@%.1f", sign, weightUnit.fromKilograms(delta))
            return "\(chartRange.summaryLabel) · 变化 \(text) \(weightUnit.shortLabel)"
        }
        return chartRange.summaryLabel
    }

    // MARK: - Recent

    private var recentSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("最近记录")
                        .font(.system(size: 14, weight: .semibold))
                    Text("体重、饮食与运动")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("查看体重记录 →") {
                    onOpenWeight?()
                }
                .buttonStyle(.plain)
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 14)

            Divider()

            if recentItems.isEmpty {
                ContentUnavailableView(
                    "还没有记录",
                    systemImage: "list.bullet",
                    description: Text("记录体重、饮食或运动后会显示在这里。")
                )
                .frame(minHeight: 140)
                .padding(.vertical, 12)
            } else {
                #if os(macOS)
                Table(recentItems) {
                    TableColumn("时间") { item in
                        Text(item.date, format: .dateTime.month().day().hour().minute())
                            .foregroundStyle(.secondary)
                    }
                    .width(min: 100, ideal: 118)

                    TableColumn("类型") { item in
                        HStack(spacing: 7) {
                            RecordDot(kind: item.dot)
                            Text(item.typeLabel)
                        }
                    }
                    .width(min: 80, ideal: 104)

                    TableColumn("内容") { item in
                        Text(item.title)
                    }

                    TableColumn("数值") { item in
                        Text(item.valueText)
                            .font(.body.monospacedDigit())
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                    .width(min: 90, ideal: 120)
                }
                .frame(minHeight: CGFloat(min(recentItems.count, 8)) * 40 + 36)
                #else
                VStack(spacing: 0) {
                    ForEach(recentItems) { item in
                        HStack {
                            Text(item.date, format: .dateTime.month().day().hour().minute())
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .frame(width: 72, alignment: .leading)
                            HStack(spacing: 6) {
                                RecordDot(kind: item.dot)
                                Text(item.typeLabel)
                                    .font(.subheadline)
                            }
                            .frame(width: 56, alignment: .leading)
                            Text(item.title)
                                .font(.subheadline)
                                .lineLimit(1)
                            Spacer()
                            Text(item.valueText)
                                .font(.subheadline.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        if item.id != recentItems.last?.id {
                            Divider().padding(.leading, 16)
                        }
                    }
                }
                #endif
            }
        }
        .appSurface()
    }
}

// MARK: - Chart helpers

enum ChartRange: String, CaseIterable, Identifiable {
    case days7, days30, days90, all

    var id: String { rawValue }

    var label: String {
        switch self {
        case .days7: "7 天"
        case .days30: "30 天"
        case .days90: "90 天"
        case .all: "全部"
        }
    }

    var summaryLabel: String {
        switch self {
        case .days7: "近 7 天"
        case .days30: "近 30 天"
        case .days90: "近 90 天"
        case .all: "全部"
        }
    }

    var startDate: Date? {
        let cal = Calendar.current
        switch self {
        case .days7: return cal.date(byAdding: .day, value: -7, to: Date())
        case .days30: return cal.date(byAdding: .day, value: -30, to: Date())
        case .days90: return cal.date(byAdding: .day, value: -90, to: Date())
        case .all: return nil
        }
    }
}

struct WeightChartPoint: Identifiable {
    let id: Date
    let day: Date
    let weightKg: Double

    /// One point per local day — last entry of that day.
    static func points(from weights: [WeightEntry], range: ChartRange) -> [WeightChartPoint] {
        let filtered: [WeightEntry]
        if let start = range.startDate {
            filtered = weights.filter { $0.date >= start }
        } else {
            filtered = weights
        }

        let grouped = Dictionary(grouping: filtered) { entry in
            entry.date.startOfDay
        }

        return grouped.keys.sorted().compactMap { day in
            guard let last = grouped[day]?.max(by: { $0.date < $1.date }) else { return nil }
            return WeightChartPoint(id: day, day: day, weightKg: last.weight)
        }
    }
}

struct RecentRecord: Identifiable {
    let id: String
    let date: Date
    let typeLabel: String
    let title: String
    let valueText: String
    let dot: RecordDot.Kind

    static func build(
        weights: [WeightEntry],
        foods: [FoodEntry],
        exercises: [ExerciseEntry],
        limit: Int
    ) -> [RecentRecord] {
        var items: [RecentRecord] = []
        items += weights.map {
            RecentRecord(
                id: "w-\($0.id.uuidString)",
                date: $0.date,
                typeLabel: "体重",
                title: $0.note?.isEmpty == false ? ($0.note ?? "体重") : "体重记录",
                valueText: String(format: "%.1f kg", $0.weight),
                dot: .weight
            )
        }
        items += foods.map {
            RecentRecord(
                id: "f-\($0.id.uuidString)",
                date: $0.date,
                typeLabel: "饮食",
                title: $0.name,
                valueText: "\(Int($0.calories.rounded())) kcal",
                dot: .food
            )
        }
        items += exercises.map {
            let value: String
            if let burn = $0.caloriesBurned {
                value = "\($0.durationMinutes) 分钟 · \(Int(burn.rounded())) kcal"
            } else {
                value = "\($0.durationMinutes) 分钟"
            }
            return RecentRecord(
                id: "e-\($0.id.uuidString)",
                date: $0.date,
                typeLabel: "运动",
                title: $0.name,
                valueText: value,
                dot: .activity
            )
        }
        return Array(items.sorted { $0.date > $1.date }.prefix(limit))
    }
}

#Preview {
    TodayView()
        .modelContainer(for: [WeightEntry.self, FoodEntry.self, ExerciseEntry.self], inMemory: true)
}
