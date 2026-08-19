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
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openSettings) private var openSettings
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
    @State private var openedDay: CalendarDayItem?
    @State private var todayRestingKcal: Double?
    @State private var todayActiveKcal: Double?
    @State private var energyAsOf = Date()
    @State private var healthConnected = false

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

    private var todayExercises: [ExerciseEntry] {
        let day = Calendar.current.dayInterval(for: Date())
        return exercises.filter { $0.date >= day.start && $0.date < day.end }
    }

    /// 今天没有锻炼就不展示。文案例如「今天有 2 次锻炼，共 77 分钟」。
    private var todayExerciseSummary: String? {
        let count = todayExercises.count
        guard count > 0 else { return nil }
        let minutes = todayExercises.reduce(0) { $0 + $1.durationMinutes }
        return "今天有 \(count) 次锻炼，共 \(minutes) 分钟"
    }

    private var todayCalories: Double? {
        guard !todayFoods.isEmpty else { return nil }
        return todayFoods.reduce(0) { $0 + $1.calories }
    }

    /// 没记饮食时不算「吃了 0」，不给出差值。
    private var todayNetCalories: Double? {
        guard todayCalories != nil else { return nil }
        return TodayEnergyMath.net(
            intake: todayCalories,
            activeKcal: todayActiveKcal,
            restingKcal: todayRestingKcal
        )
    }

    /// 活动能量 + 静息能量。两项都没有则不展示数字。
    private var todayHealthBurnKcal: Double? {
        if todayActiveKcal == nil && todayRestingKcal == nil { return nil }
        return (todayActiveKcal ?? 0) + (todayRestingKcal ?? 0)
    }

    private var energyCompletenessText: String {
        var parts: [String] = []
        if todayCalories == nil { parts.append("未记饮食") }
        if todayActiveKcal == nil { parts.append("未计入活动能量") }
        if todayRestingKcal == nil { parts.append("未计入静息") }
        if parts.isEmpty { parts.append("按当前记录计算") }
        parts.append("截至 \(energyAsOf.formatted(AppLocale.time))")
        return parts.joined(separator: " · ")
    }

    private var healthBurnMeta: String {
        switch (todayActiveKcal != nil, todayRestingKcal != nil) {
        case (true, true): "活动 + 静息"
        case (true, false): "仅活动能量"
        case (false, true): "仅静息"
        case (false, false): "需授权读取健康"
        }
    }

    private var deltaMeta: String {
        if todayCalories == nil { return "记饮食后计算" }
        if todayActiveKcal == nil || todayRestingKcal == nil { return "缺项按 0" }
        return "摄入 − 健康消耗"
    }

    private var chartPoints: [WeightChartPoint] {
        WeightChartPoint.points(from: weights, range: chartRange)
    }

    private var paceSamples: [WeightPace.Sample] {
        chartPoints.map { WeightPace.Sample(day: $0.day, weightKg: $0.weightKg) }
    }

    private var weightTrend: WeightPace.Trend {
        WeightPace.trend(from: paceSamples)
    }

    private var trendGlance: String {
        switch weightTrend {
        case .notEnough:
            return latestWeight == nil ? "还没记体重" : "再记一次才看得出"
        case .flat(let window), .down(let window), .up(let window):
            return "近 \(window.spanDays) 天"
        }
    }

    private var trendDeltaKg: Double? {
        switch weightTrend {
        case .flat(let window), .down(let window), .up(let window):
            return window.deltaKg
        case .notEnough:
            return nil
        }
    }

    private var trendVerdictTint: Color {
        switch weightTrend {
        case .down: AppTheme.brandTeal
        case .up: AppTheme.intakeAmber
        case .flat, .notEnough: .secondary
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AppTheme.spaceL) {
                    eatInsightCard
                    weightSummaryBar
                    if latestWeight != nil {
                        trendInsightCard
                    }
                }
                .padding(AppTheme.contentInset)
                .appReadableWidth()
            }
            .pageBackground()
            .navigationTitle("今日概览")
            .navigationBarTitleDisplayMode(.large)
            .toolbar { toolbarContent }
            .navigationDestination(item: $openedDay) { item in
                DayDetailView(day: item.date)
            }
            .sheet(isPresented: $showQuickWeight) {
                WeightEditorView(mode: .create)
            }
            .sheet(isPresented: $showQuickFood) {
                FoodEditorSheet(mode: .create)
            }
            .task {
                await refreshHealthSummaries()
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active {
                    Task { await refreshHealthSummaries() }
                }
            }
        }
    }

    @MainActor
    private func refreshHealthSummaries() async {
        _ = try? await HealthKitWeightService.shared.reconcile(
            into: modelContext,
            promptIfNeeded: false
        )
        _ = try? await HealthKitExerciseService.shared.syncWorkouts(
            into: modelContext,
            userInitiated: false
        )
        let todayTotals = await HealthKitAccess.todayEnergyTotals()
        todayActiveKcal = todayTotals.active
        todayRestingKcal = todayTotals.resting
        energyAsOf = Date()
        refreshHealthConnection()
    }

    private func refreshHealthConnection() {
        healthConnected = HealthKitWeightService.shared.isSharingAuthorized
            || todayActiveKcal != nil
            || todayRestingKcal != nil
    }

    @MainActor
    private func handleHealthStatusTap() async {
        if healthConnected {
            openSettings()
            return
        }
        await HealthKitWeightService.shared.requestAuthorization()
        await refreshHealthSummaries()
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
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
                    .font(AppFont.toolbarIcon)
                    .foregroundStyle(AppTheme.brandTeal)
            }
            .accessibilityLabel("快速记录")
        }
        IOSSettingsToolbar()
    }

    // MARK: - 今天热量

    private var eatInsightCard: some View {
        TodayInsightCard(
            title: "今天热量",
            actionTitle: "记录饮食",
            actionTint: AppTheme.intakeAmber,
            action: { showQuickFood = true }
        ) {
            VStack(alignment: .leading, spacing: AppTheme.stackLoose) {
                energyBreakdown
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(eatInsightAccessibilityLabel)

                VStack(alignment: .leading, spacing: AppTheme.stackTight) {
                    Text(energyCompletenessText)
                        .font(AppFont.rowMeta)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    HStack(alignment: .center, spacing: AppTheme.space8) {
                        healthCaptionRow
                        Spacer(minLength: AppTheme.space8)
                        consumptionDetailLink
                    }
                }

                if let todayExerciseSummary {
                    todayExerciseSummaryRow(todayExerciseSummary)
                }
            }
        }
    }

    private var healthCaptionRow: some View {
        Button {
            Task { await handleHealthStatusTap() }
        } label: {
            HStack(spacing: AppTheme.space4) {
                Image(systemName: healthConnected ? "heart.fill" : "heart")
                    .font(AppFont.badge)
                    .foregroundStyle(healthConnected ? AppTheme.activityGreen : .secondary)
                    .accessibilityHidden(true)
                Text(healthConnected ? "Apple 健康已连接" : "未连接 Apple 健康")
                    .font(AppFont.badge)
                    .foregroundStyle(healthConnected ? AppTheme.activityGreen : .secondary)
                    .lineLimit(1)
            }
            .padding(.horizontal, AppTheme.chipHorizontal)
            .padding(.vertical, AppTheme.chipVertical)
            .background(
                (healthConnected ? AppTheme.activityGreen : Color.secondary).opacity(AppTheme.chipFillOpacity),
                in: Capsule()
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(minHeight: 44)
        .accessibilityLabel(healthConnected ? "Apple 健康已连接" : "未连接 Apple 健康")
        .accessibilityHint(healthConnected ? "打开设置查看健康授权" : "允许读取健康数据")
    }

    private var consumptionDetailLink: some View {
        Button {
            openedDay = CalendarDayItem(date: Date().startOfDay)
        } label: {
            HStack(spacing: AppTheme.space2) {
                Text("消耗详情")
                Image(systemName: "chevron.right")
            }
            .font(AppFont.inlineAction)
            .foregroundStyle(AppTheme.activityGreen)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("消耗详情")
        .accessibilityHint("查看活动能量、静息和当天运动")
    }

    private var eatInsightAccessibilityLabel: String {
        var parts = [
            "今天热量",
            "摄入 \(intakeMetric.value.map { "\($0) 千卡" } ?? "未记")",
            "健康消耗 \(healthBurnMetric.value.map { "\($0) 千卡" } ?? "未计入")",
            "差值 \(deltaMetric.value.map { "\($0) 千卡" } ?? "未计算")",
            energyCompletenessText
        ]
        if let todayExerciseSummary {
            parts.append(todayExerciseSummary)
        }
        return parts.joined(separator: "。")
    }

    private var weightSummaryBar: some View {
        WeightSummaryBar(
            recentText: trendGlance,
            recentTint: trendVerdictTint,
            recentDeltaKg: trendDeltaKg,
            weightUnit: weightUnit,
            recentHint: "记录体重",
            recentAction: { showQuickWeight = true }
        )
    }

    private func todayExerciseSummaryRow(_ summary: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: AppTheme.space8) {
            Image(systemName: "figure.run")
                .font(AppFont.icon)
                .foregroundStyle(AppTheme.activityGreen)
                .accessibilityHidden(true)
            Text(summary)
                .font(AppFont.sectionSubtitle)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, AppTheme.space12)
        .padding(.vertical, AppTheme.space8)
        .background(
            AppTheme.activityGreen.opacity(AppTheme.chipFillOpacity),
            in: RoundedRectangle(cornerRadius: AppTheme.iconWellRadius, style: .continuous)
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(summary)
    }

    private var energyBreakdown: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: 0) {
                energyCell(intakeMetric)
                VerticalHairline()
                energyCell(healthBurnMetric)
                VerticalHairline()
                energyCell(deltaMetric)
            }
            VStack(spacing: 0) {
                energyCell(intakeMetric)
                Divider()
                energyCell(healthBurnMetric)
                Divider()
                energyCell(deltaMetric)
            }
        }
    }

    private var intakeMetric: EnergyMetric {
        EnergyMetric(
            symbol: "fork.knife",
            tint: AppTheme.intakeAmber,
            label: "摄入",
            value: todayCalories.map { "\(Int($0.rounded()))" },
            unit: "千卡",
            meta: todayFoods.isEmpty ? "未记" : "\(todayFoods.count) 条记录"
        )
    }

    private var healthBurnMetric: EnergyMetric {
        EnergyMetric(
            symbol: "flame.fill",
            tint: AppTheme.activityGreen,
            label: "健康消耗",
            value: todayHealthBurnKcal.map { "\(Int($0.rounded()))" },
            unit: "千卡",
            meta: healthBurnMeta
        )
    }

    private var deltaMetric: EnergyMetric {
        EnergyMetric(
            symbol: "equal.circle.fill",
            tint: deltaTint,
            label: "当前差值",
            value: deltaText,
            unit: "千卡",
            meta: deltaMeta
        )
    }

    private var deltaText: String? {
        guard let net = todayNetCalories else { return nil }
        if abs(net) < 0.5 { return "0" }
        let amount = "\(Int(abs(net).rounded()))"
        return net > 0 ? "+\(amount)" : "−\(amount)"
    }

    private var deltaTint: Color {
        guard let net = todayNetCalories, abs(net) >= 0.5 else { return .secondary }
        return net > 0 ? AppTheme.intakeAmber : AppTheme.activityGreen
    }

    private func energyCell(_ metric: EnergyMetric) -> some View {
        EnergyBreakdownCell(
            label: metric.label,
            symbol: metric.symbol,
            tint: metric.tint,
            value: metric.value,
            unit: metric.unit,
            meta: metric.meta
        )
    }

    // MARK: - 最近体重

    private var trendInsightCard: some View {
        TodayInsightCard(title: "最近体重", actionTitle: "记录体重", action: { showQuickWeight = true }) {
            VStack(alignment: .leading, spacing: AppTheme.stackLoose) {
                if let latest = latestWeight {
                    HStack(spacing: AppTheme.space8) {
                        Text("现在 \(weightUnit.format(latest.weight))")
                        if let delta = weightDelta {
                            DeltaChip(deltaKg: delta, unit: weightUnit)
                        }
                        Text(latest.date, format: AppLocale.day)
                            .foregroundStyle(.secondary)
                    }
                    .font(AppFont.sectionSubtitle)
                }

                Picker("范围", selection: $chartRange) {
                    ForEach(ChartRange.allCases) { range in
                        Text(range.label).tag(range)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .accessibilityLabel("体重范围")

                weightChart
            }
        }
    }

    private var weightChart: some View {
        Group {
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
                    .symbolSize(openedDay?.date.isSameDay(as: point.day) == true ? 56 : 28)
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
                .chartOverlay { proxy in
                    GeometryReader { geo in
                        Rectangle()
                            .fill(.clear)
                            .contentShape(Rectangle())
                            .onTapGesture { location in
                                openChartDay(at: location, proxy: proxy, in: geo)
                            }
                    }
                }
                .environment(\.locale, AppLocale.chinese)
                .frame(height: chartHeight)
                .accessibilityHint("点某一天查看当天饮食、运动和热量")

                Text("点某一天，查看当天饮食、运动和热量")
                    .font(AppFont.rowMeta)
                    .foregroundStyle(.secondary)
            } else {
                Text(chartPoints.count == 1 ? "再记一次即可画出趋势" : "记录两次以上即可画出趋势")
                    .font(AppFont.sectionSubtitle)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var chartHeight: CGFloat { 160 }

    private func openChartDay(at location: CGPoint, proxy: ChartProxy, in geo: GeometryProxy) {
        let x: CGFloat
        if let plotFrame = proxy.plotFrame {
            x = location.x - geo[plotFrame].origin.x
        } else {
            x = location.x
        }
        guard let date: Date = proxy.value(atX: x) else { return }
        guard let nearest = nearestChartDay(to: date) else { return }
        openedDay = CalendarDayItem(date: nearest)
    }

    private func nearestChartDay(to date: Date) -> Date? {
        guard let nearest = chartPoints.min(by: {
            abs($0.day.timeIntervalSince(date)) < abs($1.day.timeIntervalSince(date))
        }) else { return nil }
        if abs(nearest.day.timeIntervalSince(date)) > 36 * 3_600 { return nil }
        return nearest.day.startOfDay
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

#Preview {
    TodayView()
        .modelContainer(for: [WeightEntry.self, FoodEntry.self, ExerciseEntry.self, UserProfile.self], inMemory: true)
}
