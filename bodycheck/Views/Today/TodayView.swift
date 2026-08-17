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
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("weightUnit") private var weightUnitRaw: String = WeightUnit.kg.rawValue
    @Query(sort: [
        SortDescriptor(\WeightEntry.date, order: .reverse),
        SortDescriptor(\WeightEntry.createdAt, order: .reverse)
    ]) private var weights: [WeightEntry]
    @Query(sort: \FoodEntry.date, order: .reverse) private var foods: [FoodEntry]
    @Query(sort: \ExerciseEntry.date, order: .reverse) private var exercises: [ExerciseEntry]
    @Query private var profiles: [UserProfile]

    @State private var showQuickWeight = false
    @State private var showQuickFood = false
    @State private var showProfileEditor = false
    @State private var chartRange: ChartRange = .days30
    @State private var openedDay: CalendarDayItem?
    @State private var todayRestingKcal: Double?
    @State private var todayActiveKcal: Double?

    private var weightUnit: WeightUnit {
        WeightUnit(rawValue: weightUnitRaw) ?? .kg
    }

    private var orderedWeights: [WeightEntry] {
        weights.sorted(by: WeightEntry.chronologicalDescending)
    }

    private var profile: UserProfile? {
        UserProfile.current(from: profiles)
    }

    private var latestWeight: WeightEntry? { orderedWeights.first }
    private var previousWeight: WeightEntry? { orderedWeights.count > 1 ? orderedWeights[1] : nil }

    private var weightDelta: Double? {
        guard let latest = latestWeight, let previous = previousWeight else { return nil }
        return latest.weight - previous.weight
    }

    private var hasProfileContent: Bool {
        guard let profile else { return false }
        if !profile.trimmedName.isEmpty { return true }
        if profile.age != nil { return true }
        if profile.sex != .unspecified { return true }
        if profile.heightCm != nil { return true }
        if profile.targetWeightKg != nil { return true }
        return false
    }

    private var todayFoods: [FoodEntry] {
        let day = Calendar.current.dayInterval(for: Date())
        return foods.filter { $0.date >= day.start && $0.date < day.end }
    }

    private var todayCalories: Double? {
        guard !todayFoods.isEmpty else { return nil }
        return todayFoods.reduce(0) { $0 + $1.calories }
    }

    /// 没记饮食时不算「吃了 0」，今天热量结论为空。
    private var todayNetCalories: Double? {
        guard todayCalories != nil else { return nil }
        return TodayEnergyMath.net(
            intake: todayCalories,
            activeKcal: todayActiveKcal,
            restingKcal: todayRestingKcal
        )
    }

    private var eatGlance: String {
        guard todayCalories != nil, let net = todayNetCalories else { return "还没记饮食" }
        if let meat = FatMeatEquivalent.presentation(netKcal: net) {
            return net > 0
                ? "多吃了 · 约 \(meat.grams) 克肥肉"
                : "没有吃多 · 约少了 \(meat.grams) 克"
        }
        return "差不多打平"
    }

    private var eatVerdict: String {
        guard todayCalories != nil, let net = todayNetCalories else {
            return "还没记今天的饮食"
        }
        if FatMeatEquivalent.presentation(netKcal: net) == nil {
            return "今天差不多打平"
        }
        return net > 0 ? "今天多吃了" : "今天没有吃多"
    }

    private var eatVerdictTint: Color {
        guard todayCalories != nil, let net = todayNetCalories,
              FatMeatEquivalent.presentation(netKcal: net) != nil else {
            return .secondary
        }
        return net > 0 ? AppTheme.intakeAmber : AppTheme.activityGreen
    }

    private var eatCaption: String {
        guard todayCalories != nil else {
            return "记下今天吃了什么，这里会对照消耗告诉你热量有没有多出来。"
        }
        return TodayEnergyMath.caption(
            activeKcal: todayActiveKcal,
            noteMissingResting: todayRestingKcal == nil
        )
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
        case .flat(let window):
            return "近 \(window.spanDays) 天几乎没变"
        case .down(let window):
            return "近 \(window.spanDays) 天轻了 \(weightUnit.format(abs(window.deltaKg)))"
        case .up(let window):
            return "近 \(window.spanDays) 天重了 \(weightUnit.format(abs(window.deltaKg)))"
        }
    }

    private var trendVerdictTint: Color {
        switch weightTrend {
        case .down: AppTheme.brandTeal
        case .up: AppTheme.intakeAmber
        case .flat, .notEnough: .secondary
        }
    }

    private var goalArrival: WeightPace.Arrival {
        WeightPace.arrival(
            latestKg: latestWeight?.weight,
            targetKg: profile?.targetWeightKg,
            samples: paceSamples
        )
    }

    private var goalGlance: String {
        switch goalArrival {
        case .needWeight:
            return "先记体重"
        case .needTarget:
            return "还没填目标"
        case .needMoreData:
            return "再记几天"
        case .reached:
            return "已经达到"
        case .tooSlow:
            return "几乎没变"
        case .wrongWay:
            return "在远离目标"
        case .tooFar:
            return "要两年以上"
        case .estimated(let days, _):
            return WeightPace.formatDuration(days: days)
        }
    }

    private var recentItems: [RecentRecord] {
        RecentRecord.build(weights: weights, foods: foods, exercises: exercises, unit: weightUnit, limit: 8)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AppTheme.spaceL) {
                    glanceBoard
                    if todayCalories != nil {
                        eatInsightCard
                    }
                    if latestWeight != nil {
                        trendInsightCard
                    }
                    recentSection
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
            .sheet(isPresented: $showProfileEditor) {
                ProfileEditorSheet()
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
        let todayTotals = await HealthKitAccess.todayEnergyTotals()
        todayActiveKcal = todayTotals.active
        todayRestingKcal = todayTotals.resting
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

    // MARK: - 一眼结论

    private var glanceBoard: some View {
        TodayGlanceBoard {
            TodayGlanceRow(
                label: "今天",
                value: eatGlance,
                tint: eatVerdictTint,
                actionHint: "记录饮食",
                action: { showQuickFood = true }
            )
            Divider().padding(.leading, AppTheme.cardPadding + 36 + AppTheme.space12)
            TodayGlanceRow(
                label: "最近",
                value: trendGlance,
                tint: trendVerdictTint,
                actionHint: "记录体重",
                action: { showQuickWeight = true }
            )
            Divider().padding(.leading, AppTheme.cardPadding + 36 + AppTheme.space12)
            TodayGlanceRow(
                label: "目标",
                value: goalGlance,
                tint: goalArrivalTint,
                actionHint: hasProfileContent ? "编辑资料" : "填写个人资料",
                action: { showProfileEditor = true }
            )
        }
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
                Text(eatCaption)
                    .font(AppFont.sectionSubtitle)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                if let net = todayNetCalories, FatMeatEquivalent.presentation(netKcal: net) != nil {
                    FatMeatEquivalentView(netKcal: net, style: .compact)
                }

                energyBreakdown
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(eatVerdict)。\(eatCaption)")
        }
    }

    private var energyBreakdown: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: 0) {
                energyCell(intakeMetric)
                VerticalHairline()
                energyCell(activeMetric)
                VerticalHairline()
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
            value: todayActiveKcal.map { "\(Int($0.rounded()))" },
            unit: "千卡",
            meta: todayActiveKcal == nil ? "需授权读取健康" : "健康今日合计"
        )
    }

    private var restingMetric: EnergyMetric {
        EnergyMetric(
            symbol: "bed.double.fill",
            tint: AppTheme.brandTeal,
            label: "静息能量",
            value: todayRestingKcal.map { "\(Int($0.rounded()))" },
            unit: "千卡",
            meta: todayRestingKcal == nil ? "需授权读取健康" : "健康今日合计"
        )
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

    private var goalArrivalTint: Color {
        switch goalArrival {
        case .estimated, .reached: AppTheme.brandTeal
        case .wrongWay, .tooFar: AppTheme.intakeAmber
        case .needWeight, .needTarget, .needMoreData, .tooSlow: .secondary
        }
    }

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

    // MARK: - Recent

    private var recentSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: AppTheme.stackTight) {
                    Text("最近记录")
                        .font(AppFont.sectionTitle)
                    Text("体重、饮食与运动")
                        .font(AppFont.sectionSubtitle)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button {
                    onOpenWeight?()
                } label: {
                    HStack(spacing: AppTheme.space2) {
                        Text("体重")
                        Image(systemName: "chevron.right")
                            .font(AppFont.inlineAction)
                    }
                    .font(AppFont.sectionSubtitle)
                    .foregroundStyle(AppTheme.brandTeal)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, AppTheme.cardPadding)
            .padding(.vertical, AppTheme.space12)

            Divider()

            if recentItems.isEmpty {
                ContentUnavailableView(
                    "还没有记录",
                    systemImage: "list.bullet",
                    description: Text("记录体重、饮食或运动后会显示在这里。")
                )
                .frame(minHeight: 140)
                .padding(.vertical, AppTheme.space12)
            } else {
                VStack(spacing: 0) {
                    ForEach(recentItems) { item in
                        HStack(alignment: .center, spacing: AppTheme.space12) {
                            RecordDot(kind: item.dot)
                                .frame(width: AppTheme.recordDotColumn)

                            VStack(alignment: .leading, spacing: AppTheme.stackTight) {
                                Text(item.title)
                                    .font(AppFont.rowTitle)
                                    .lineLimit(1)
                                HStack(spacing: AppTheme.space4) {
                                    Text(item.typeLabel)
                                    Text("·")
                                    Text(item.date, format: AppLocale.monthDayTime)
                                }
                                .font(AppFont.rowMeta)
                                .foregroundStyle(.secondary)
                            }

                            Spacer(minLength: AppTheme.space8)

                            Text(item.valueText)
                                .font(AppFont.rowValue)
                                .foregroundStyle(.primary)
                                .multilineTextAlignment(.trailing)
                        }
                        .padding(.horizontal, AppTheme.cardPadding)
                        .padding(.vertical, AppTheme.space12)
                        if item.id != recentItems.last?.id {
                            Divider().padding(.leading, AppTheme.cardPadding + AppTheme.recordDotColumn + AppTheme.space12)
                        }
                    }
                }
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
        .modelContainer(for: [WeightEntry.self, FoodEntry.self, ExerciseEntry.self, UserProfile.self], inMemory: true)
}
