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

    @Environment(\.modelContext) private var modelContext
    #if os(iOS)
    @Environment(\.scenePhase) private var scenePhase
    #endif
    @AppStorage("weightUnit") private var weightUnitRaw: String = WeightUnit.kg.rawValue
    @Query(sort: [
        SortDescriptor(\WeightEntry.date, order: .reverse),
        SortDescriptor(\WeightEntry.createdAt, order: .reverse)
    ]) private var weights: [WeightEntry]
    @Query(sort: \FoodEntry.date, order: .reverse) private var foods: [FoodEntry]
    @Query(sort: \ExerciseEntry.date, order: .reverse) private var exercises: [ExerciseEntry]

    @State private var showQuickWeight = false
    @State private var showQuickFood = false
    @State private var chartRange: ChartRange = .days30
    #if os(iOS)
    @State private var todayRestingKcal: Double?
    @State private var todayActiveKcal: Double?
    #endif

    private var weightUnit: WeightUnit {
        WeightUnit(rawValue: weightUnitRaw) ?? .kg
    }

    private var orderedWeights: [WeightEntry] {
        weights.sorted(by: WeightEntry.chronologicalDescending)
    }

    private var latestWeight: WeightEntry? { orderedWeights.first }
    private var previousWeight: WeightEntry? { orderedWeights.count > 1 ? orderedWeights[1] : nil }

    private var weightDelta: Double? {
        guard let latest = latestWeight, let previous = previousWeight else { return nil }
        return latest.weight - previous.weight
    }

    private var todayFoods: [FoodEntry] {
        let day = Calendar.current.dayInterval(for: Date())
        return foods.filter { $0.date >= day.start && $0.date < day.end }
    }

    private var todayCalories: Double? {
        guard !todayFoods.isEmpty else { return nil }
        return todayFoods.reduce(0) { $0 + $1.calories }
    }

    private var chartPoints: [WeightChartPoint] {
        WeightChartPoint.points(from: weights, range: chartRange)
    }

    private var chartRangeDelta: Double? {
        guard let first = chartPoints.first, let last = chartPoints.last, chartPoints.count > 1 else { return nil }
        return last.weightKg - first.weightKg
    }

    private var recentItems: [RecentRecord] {
        RecentRecord.build(weights: weights, foods: foods, exercises: exercises, unit: weightUnit, limit: 8)
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
            #if os(iOS)
            .navigationBarTitleDisplayMode(.large)
            #endif
            #if os(macOS)
            .navigationSubtitle(Date.now.formatted(AppLocale.dayWeekday))
            #endif
            .toolbar { toolbarContent }
            .sheet(isPresented: $showQuickWeight) {
                WeightEditorView(mode: .create)
            }
            .sheet(isPresented: $showQuickFood) {
                FoodEditorSheet(mode: .create)
            }
            #if os(iOS)
            .task {
                await refreshHealthSummaries()
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active {
                    Task { await refreshHealthSummaries() }
                }
            }
            #endif
        }
    }

    #if os(iOS)
    @MainActor
    private func refreshHealthSummaries() async {
        _ = try? await HealthKitWeightService.shared.reconcile(
            into: modelContext,
            promptIfNeeded: false
        )
        let totals = await HealthKitAccess.todayEnergyTotals()
        todayActiveKcal = totals.active
        todayRestingKcal = totals.resting
    }
    #endif

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        #if os(iOS)
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button {
                    showQuickWeight = true
                } label: {
                    Label("记录体重", systemImage: "scalemass")
                }
                Button {
                    showQuickFood = true
                } label: {
                    Label("记录饮食", systemImage: "fork.knife")
                }
            } label: {
                Image(systemName: "plus.circle.fill")
                    .symbolRenderingMode(.hierarchical)
                    .font(.title3)
                    .foregroundStyle(AppTheme.brandTeal)
            }
            .accessibilityLabel("快速记录")
        }
        IOSSettingsToolbar()
        #else
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
        #endif
    }

    // MARK: - Lead

    private var leadSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.spaceL) {
            weightHero
            energySection
        }
    }

    private var weightHero: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("最新体重")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
                .tracking(0.4)

            if let latest = latestWeight {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(String(format: "%.1f", weightUnit.fromKilograms(latest.weight)))
                        .font(.system(size: AppTheme.heroWeightSize, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .minimumScaleFactor(0.7)
                        .lineLimit(1)
                    Text(weightUnit.shortLabel)
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(.secondary)
                }

                HStack(spacing: 9) {
                    if let delta = weightDelta {
                        DeltaChip(deltaKg: delta, unit: weightUnit)
                    }
                    Text(latest.date, format: AppLocale.day)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    Button("记录") { showQuickWeight = true }
                        .buttonStyle(.borderless)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(AppTheme.brandTeal)
                }

                #if os(macOS)
                Divider().padding(.top, 8)

                Text("数据保存在你的设备上，并通过你的私人 iCloud 在 iPhone 与 Mac 之间同步。")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 4)
                #endif
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
                        .controlSize(.large)
                        .padding(.top, 4)
                }
                .padding(.vertical, 8)
            }
        }
        .frame(maxWidth: .infinity, minHeight: platformHeroMinHeight, alignment: .topLeading)
        .appSurface(padding: AppTheme.cardPadding)
    }

    private var platformHeroMinHeight: CGFloat {
        #if os(iOS)
        140
        #else
        180
        #endif
    }

    private var todayActiveKcalValue: Double? {
        #if os(iOS)
        todayActiveKcal
        #else
        nil
        #endif
    }

    /// 摄入 − 活动能量 − 静息能量。
    private var netCalories: Double? {
        TodayEnergyMath.net(
            intake: todayCalories,
            activeKcal: todayActiveKcalValue,
            restingKcal: {
                #if os(iOS)
                todayRestingKcal
                #else
                nil
                #endif
            }()
        )
    }

    private var netCaloriesText: String? {
        guard let net = netCalories else { return nil }
        if abs(net) < 0.5 { return "0" }
        let amount = "\(Int(abs(net).rounded()))"
        return net > 0 ? "+\(amount)" : "−\(amount)"
    }

    private var netCaloriesTone: Color {
        guard let net = netCalories, abs(net) >= 0.5 else { return .secondary }
        return net > 0 ? AppTheme.intakeAmber : AppTheme.activityGreen
    }

    private var netCaloriesCaption: String {
        guard netCalories != nil else { return "记录饮食或同步健康后计算" }
        let missingResting: Bool = {
            #if os(iOS)
            todayRestingKcal == nil
            #else
            true
            #endif
        }()
        return TodayEnergyMath.caption(
            activeKcal: todayActiveKcalValue,
            noteMissingResting: missingResting
        )
    }

    private var energySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("今日热量")
                        .font(.system(size: 14, weight: .semibold))
                    Text(netCaloriesCaption)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                Button("记录饮食") { showQuickFood = true }
                    .buttonStyle(.borderless)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(AppTheme.intakeAmber)
            }

            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("净热量")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
                Text(netCaloriesText ?? "—")
                    .font(.system(size: 32, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(netCaloriesTone)
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                if netCaloriesText != nil {
                    Text("千卡")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }

            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 0) {
                    energyCell(intakeMetric)
                    energyRule
                    energyCell(activeMetric)
                    energyRule
                    energyCell(restingMetric)
                }
                VStack(spacing: 0) {
                    energyCell(intakeMetric)
                    Divider()
                    energyCell(activeMetric)
                    Divider()
                    energyCell(restingMetric)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .appSurface()
    }

    private var intakeMetric: EnergyMetric {
        EnergyMetric(
            symbol: "fork.knife",
            tint: AppTheme.intakeAmber,
            label: "摄入",
            value: todayCalories.map { "\(Int($0.rounded()))" },
            unit: "千卡",
            meta: todayFoods.isEmpty ? "自己填写后相加" : "\(todayFoods.count) 条记录相加"
        )
    }

    private var activeMetric: EnergyMetric {
        EnergyMetric(
            symbol: "flame.fill",
            tint: AppTheme.activityGreen,
            label: "活动能量",
            value: todayActiveDisplay,
            unit: "千卡",
            meta: activeEnergyMeta
        )
    }

    private var restingMetric: EnergyMetric {
        EnergyMetric(
            symbol: "bed.double.fill",
            tint: AppTheme.brandTeal,
            label: "静息能量",
            value: todayRestingDisplay,
            unit: "千卡",
            meta: restingEnergyMeta
        )
    }

    private var todayActiveDisplay: String? {
        #if os(iOS)
        todayActiveKcal.map { "\(Int($0.rounded()))" }
        #else
        nil
        #endif
    }

    private var todayRestingDisplay: String? {
        #if os(iOS)
        todayRestingKcal.map { "\(Int($0.rounded()))" }
        #else
        nil
        #endif
    }

    private var activeEnergyMeta: String {
        #if os(iOS)
        todayActiveKcal == nil ? "需授权读取健康" : "健康今日合计"
        #else
        "请在 iPhone 上读取"
        #endif
    }

    private var restingEnergyMeta: String {
        #if os(iOS)
        todayRestingKcal == nil ? "需授权读取健康" : "健康今日合计"
        #else
        "请在 iPhone 上读取"
        #endif
    }

    private var energyRule: some View {
        Rectangle()
            .fill(Color.primary.opacity(0.08))
            .frame(width: 1)
            .padding(.vertical, 8)
    }

    private func energyCell(_ metric: EnergyMetric) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: metric.symbol)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(metric.tint)
                Text(metric.label)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
            }
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(metric.value ?? "—")
                    .font(.system(size: 22, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                Text(metric.unit)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
            }
            Text(metric.meta)
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Chart

    private var chartSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            #if os(iOS)
            VStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("体重趋势")
                        .font(.headline)
                    Text(chartSubtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Picker("范围", selection: $chartRange) {
                    ForEach(ChartRange.allCases) { range in
                        Text(range.label).tag(range)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
            }
            #else
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
            #endif

            if chartPoints.count >= 2 {
                Chart(chartPoints) { point in
                    LineMark(
                        x: .value("日期", point.day),
                        y: .value("体重", weightUnit.fromKilograms(point.weightKg))
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(AppTheme.brandTeal)
                    .lineStyle(StrokeStyle(lineWidth: 2.5))

                    AreaMark(
                        x: .value("日期", point.day),
                        y: .value("体重", weightUnit.fromKilograms(point.weightKg))
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(
                        LinearGradient(
                            colors: [AppTheme.brandTeal.opacity(0.22), AppTheme.brandTeal.opacity(0.02)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )

                    PointMark(
                        x: .value("日期", point.day),
                        y: .value("体重", weightUnit.fromKilograms(point.weightKg))
                    )
                    .foregroundStyle(AppTheme.brandTeal)
                    .symbolSize(28)
                }
                .chartXAxis {
                    AxisMarks(values: .automatic) { value in
                        AxisGridLine()
                        AxisTick()
                        if let date = value.as(Date.self) {
                            AxisValueLabel {
                                Text(date, format: AppLocale.monthDay)
                            }
                        }
                    }
                }
                .chartYScale(domain: .automatic(includesZero: false))
                .environment(\.locale, AppLocale.chinese)
                .frame(height: chartHeight)
                .padding(.top, 4)
            } else if chartPoints.count == 1 {
                ContentUnavailableView(
                    "再记录一次即可查看变化",
                    systemImage: "chart.xyaxis.line",
                    description: Text("趋势图会在有至少两条体重后显示。")
                )
                .frame(height: chartHeight - 20)
            } else {
                ContentUnavailableView(
                    "暂无趋势",
                    systemImage: "chart.xyaxis.line",
                    description: Text("记录体重后即可查看趋势。")
                )
                .frame(height: chartHeight - 20)
            }
        }
        .appSurface(padding: AppTheme.cardPadding)
    }

    private var chartHeight: CGFloat {
        #if os(iOS)
        180
        #else
        200
        #endif
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
                        .font(.headline)
                    Text("体重、饮食与运动")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button {
                    onOpenWeight?()
                } label: {
                    HStack(spacing: 2) {
                        Text("体重")
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                    }
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.brandTeal)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, AppTheme.cardPadding)
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
                        Text(item.date, format: AppLocale.monthDayTime)
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
                        HStack(alignment: .center, spacing: 12) {
                            RecordDot(kind: item.dot)
                                .frame(width: 10)

                            VStack(alignment: .leading, spacing: 3) {
                                Text(item.title)
                                    .font(.body.weight(.medium))
                                    .lineLimit(1)
                                HStack(spacing: 6) {
                                    Text(item.typeLabel)
                                    Text("·")
                                    Text(item.date, format: AppLocale.monthDayTime)
                                }
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            }

                            Spacer(minLength: 8)

                            Text(item.valueText)
                                .font(.subheadline.monospacedDigit().weight(.medium))
                                .foregroundStyle(.primary)
                                .multilineTextAlignment(.trailing)
                        }
                        .padding(.horizontal, AppTheme.cardPadding)
                        .padding(.vertical, 12)
                        if item.id != recentItems.last?.id {
                            Divider().padding(.leading, AppTheme.cardPadding + 22)
                        }
                    }
                }
                #endif
            }
        }
        .appSurface()
    }
}

private struct EnergyMetric {
    let symbol: String
    let tint: Color
    let label: String
    let value: String?
    let unit: String
    let meta: String
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
            guard let last = grouped[day]?.sorted(by: WeightEntry.chronologicalDescending).first else {
                return nil
            }
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
        unit: WeightUnit,
        limit: Int
    ) -> [RecentRecord] {
        var items: [RecentRecord] = []
        items += weights.map {
            RecentRecord(
                id: "w-\($0.id.uuidString)",
                date: $0.createdAt,
                typeLabel: "体重",
                title: $0.note?.isEmpty == false ? ($0.note ?? "体重") : "体重记录",
                valueText: unit.format($0.weight),
                dot: .weight
            )
        }
        items += foods.map {
            RecentRecord(
                id: "f-\($0.id.uuidString)",
                date: $0.date,
                typeLabel: "饮食",
                title: $0.name,
                valueText: "\(Int($0.calories.rounded())) 千卡",
                dot: .food
            )
        }
        items += exercises.map {
            let value: String
            if let burn = $0.caloriesBurned {
                value = "\($0.durationMinutes) 分钟 · \(Int(burn.rounded())) 千卡"
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
