//
//  DayDetailView.swift
//  bodycheck
//
//  One local calendar day: weight, intake, active/resting energy, food, exercise.
//

import SwiftData
import SwiftUI

struct CalendarDayItem: Identifiable, Hashable {
    let date: Date
    var id: Date { date }
}

struct DayDetailView: View {
    let day: Date

    @Environment(\.modelContext) private var modelContext
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("weightUnit") private var weightUnitRaw: String = WeightUnit.kg.rawValue
    @Query(sort: [
        SortDescriptor(\WeightEntry.date, order: .reverse),
        SortDescriptor(\WeightEntry.createdAt, order: .reverse)
    ]) private var weights: [WeightEntry]
    @Query(sort: \FoodEntry.date, order: .reverse) private var foods: [FoodEntry]
    @Query(sort: \ExerciseEntry.date, order: .reverse) private var exercises: [ExerciseEntry]

    @State private var weightEditor: WeightEditorMode?
    @State private var activeKcal: Double?
    @State private var restingKcal: Double?
    @State private var isExerciseSyncing = false
    @State private var exerciseSyncMessage: String?
    @State private var exerciseSyncIsError = false
    @State private var showExerciseHelp = false

    private var weightUnit: WeightUnit {
        WeightUnit(rawValue: weightUnitRaw) ?? .kg
    }

    private var dayInterval: (start: Date, end: Date) {
        Calendar.current.dayInterval(for: day)
    }

    private var dayWeights: [WeightEntry] {
        weights.filter { $0.date.isSameDay(as: day) }
            .sorted(by: WeightEntry.chronologicalDescending)
    }

    private var dayFoods: [FoodEntry] {
        let range = dayInterval
        return foods.filter { $0.date >= range.start && $0.date < range.end }
            .sorted { $0.date > $1.date }
    }

    private var dayExercises: [ExerciseEntry] {
        let range = dayInterval
        return exercises.filter { $0.date >= range.start && $0.date < range.end }
            .sorted { $0.date > $1.date }
    }

    private var latestWeight: WeightEntry? { dayWeights.first }

    private var previousWeight: WeightEntry? {
        guard let latest = latestWeight else { return nil }
        let ordered = weights.sorted(by: WeightEntry.chronologicalDescending)
        guard let index = ordered.firstIndex(where: { $0.id == latest.id }),
              index + 1 < ordered.count else { return nil }
        return ordered[index + 1]
    }

    private var weightDelta: Double? {
        guard let latest = latestWeight, let previous = previousWeight else { return nil }
        return latest.weight - previous.weight
    }

    private var intake: Double? {
        guard !dayFoods.isEmpty else { return nil }
        return dayFoods.reduce(0) { $0 + $1.calories }
    }

    private var activeValue: Double? { activeKcal }

    private var restingValue: Double? { restingKcal }

    private var netCalories: Double? {
        TodayEnergyMath.net(
            intake: intake,
            activeKcal: activeValue,
            restingKcal: restingValue
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AppTheme.spaceL) {
                weightHero
                energyCard
                weightSection
                foodSection
                exerciseSection
            }
            .padding(AppTheme.contentInset)
            .appReadableWidth()
        }
        .pageBackground()
        .navigationTitle(day.formatted(AppLocale.dayWeekday))
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $weightEditor) { mode in
            WeightEditorView(mode: mode)
        }
        .sheet(isPresented: $showExerciseHelp) {
            exerciseHelpSheet
        }
        .task(id: day.startOfDay) {
            await refreshHealthForDay(userInitiated: false)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await refreshHealthForDay(userInitiated: false) }
            }
        }
    }

    private var weightHero: some View {
        VStack(alignment: .leading, spacing: AppTheme.stackLoose) {
            SectionEyebrow(text: "体重")

            if let latest = latestWeight {
                MeasurementValue(
                    value: String(format: "%.1f", weightUnit.fromKilograms(latest.weight)),
                    unit: weightUnit.shortLabel
                )
                HStack(spacing: AppTheme.space8) {
                    if let delta = weightDelta {
                        DeltaChip(deltaKg: delta, unit: weightUnit)
                    }
                    if dayWeights.count > 1 {
                        Text("当天 \(dayWeights.count) 条")
                            .font(AppFont.sectionSubtitle)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                }
            } else {
                Text("这一天没有体重记录")
                    .font(AppFont.emptyTitle)
                Text("趋势图上的点来自体重。若只看饮食和运动，仍会列在下面。")
                    .font(AppFont.emptyBody)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .appSurface(padding: AppTheme.cardPadding)
    }

    private var energyCard: some View {
        VStack(alignment: .leading, spacing: AppTheme.stackLoose) {
            VStack(alignment: .leading, spacing: AppTheme.stackTight) {
                Text("当天热量")
                    .font(AppFont.sectionTitle)
                Text(energyCaption)
                    .font(AppFont.sectionSubtitle)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(alignment: .firstTextBaseline, spacing: AppTheme.space8) {
                Text("热量差")
                    .font(AppFont.inlineAction)
                    .foregroundStyle(.secondary)
                MeasurementValue(
                    value: netText ?? "—",
                    unit: netText == nil ? nil : "千卡",
                    tint: netTone,
                    size: .metric,
                    dimmed: netText == nil
                )
                Spacer(minLength: 0)
            }

            if let netCalories {
                FatMeatEquivalentView(netKcal: netCalories, style: .compact)
            }

            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 0) {
                    energyCell("摄入", intake.map { "\(Int($0.rounded()))" }, AppTheme.intakeAmber)
                    VerticalHairline()
                    energyCell("活动能量", activeDisplay, AppTheme.activityGreen)
                    VerticalHairline()
                    energyCell("静息能量", restingDisplay, AppTheme.brandTeal)
                }
                VStack(spacing: 0) {
                    energyCell("摄入", intake.map { "\(Int($0.rounded()))" }, AppTheme.intakeAmber)
                    Divider()
                    energyCell("活动能量", activeDisplay, AppTheme.activityGreen)
                    Divider()
                    energyCell("静息能量", restingDisplay, AppTheme.brandTeal)
                }
            }
        }
        .padding(AppTheme.cardPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .appSurface()
    }

    private var energyCaption: String {
        guard netCalories != nil else { return "记录饮食或同步健康后计算" }
        return TodayEnergyMath.caption(
            activeKcal: activeKcal,
            noteMissingResting: restingKcal == nil
        )
    }

    private var netText: String? {
        guard let net = netCalories else { return nil }
        if abs(net) < 0.5 { return "0" }
        let amount = "\(Int(abs(net).rounded()))"
        return net > 0 ? "+\(amount)" : "−\(amount)"
    }

    private var netTone: Color {
        guard let net = netCalories, abs(net) >= 0.5 else { return .secondary }
        return net > 0 ? AppTheme.intakeAmber : AppTheme.activityGreen
    }

    private var activeDisplay: String? {
        activeKcal.map { "\(Int($0.rounded()))" }
    }

    private var restingDisplay: String? {
        restingKcal.map { "\(Int($0.rounded()))" }
    }

    private func energyCell(_ label: String, _ value: String?, _ tint: Color) -> some View {
        EnergyBreakdownCell(label: label, tint: tint, value: value)
    }

    private var weightSection: some View {
        daySection(title: "当天体重", empty: dayWeights.isEmpty ? "没有体重记录" : nil) {
            ForEach(dayWeights) { entry in
                Button {
                    weightEditor = .edit(entry)
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: AppTheme.stackTight) {
                            Text(weightUnit.format(entry.weight))
                                .font(AppFont.rowTitleEmphasis.monospacedDigit())
                                .foregroundStyle(.primary)
                            Text(entry.weightSource.displayName)
                                .font(AppFont.rowMeta)
                                .foregroundStyle(.secondary)
                        }
                        Spacer(minLength: AppTheme.space8)
                        if let note = entry.note, !note.isEmpty {
                            Text(note)
                                .font(AppFont.rowMeta)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    .padding(.vertical, AppTheme.space8)
                }
                .buttonStyle(.plain)
                if entry.id != dayWeights.last?.id {
                    Divider()
                }
            }
        }
    }

    private var foodSection: some View {
        daySection(title: "当天饮食", empty: dayFoods.isEmpty ? "没有饮食记录" : nil) {
            ForEach(dayFoods) { entry in
                NavigationLink {
                    FoodDetailView(entry: entry)
                } label: {
                    HStack(spacing: AppTheme.space12) {
                        FoodPhotoThumb(data: entry.photoData)
                        VStack(alignment: .leading, spacing: AppTheme.stackTight) {
                            Text(entry.name)
                                .font(AppFont.rowTitle)
                                .foregroundStyle(.primary)
                            Text(entry.date, format: AppLocale.time)
                                .font(AppFont.rowMeta)
                                .foregroundStyle(.secondary)
                        }
                        Spacer(minLength: AppTheme.space8)
                        Text("\(Int(entry.calories.rounded())) 千卡")
                            .font(AppFont.rowValue)
                            .foregroundStyle(AppTheme.intakeAmber)
                    }
                    .padding(.vertical, AppTheme.space8)
                }
                if entry.id != dayFoods.last?.id {
                    Divider()
                }
            }
        }
    }

    private var exerciseSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("当天运动")
                .font(AppFont.sectionTitle)
                .padding(.horizontal, AppTheme.cardPadding)
                .padding(.top, AppTheme.space12)
                .padding(.bottom, AppTheme.space8)

            if dayExercises.isEmpty {
                HStack(alignment: .center, spacing: AppTheme.space8) {
                    Text("没有运动记录")
                        .font(AppFont.emptyBody)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: AppTheme.space8)
                    Button {
                        exerciseSyncMessage = nil
                        exerciseSyncIsError = false
                        showExerciseHelp = true
                    } label: {
                        Image(systemName: "questionmark.circle")
                            .font(AppFont.icon)
                            .foregroundStyle(.secondary)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("如何补记锻炼")
                    .accessibilityHint("没戴手表时，可在健康里补记后再同步")
                }
                .padding(.horizontal, AppTheme.cardPadding)
                .padding(.bottom, AppTheme.space8)
            } else {
                VStack(spacing: 0) {
                    ForEach(dayExercises) { entry in
                        HStack(alignment: .center, spacing: AppTheme.space12) {
                            VStack(alignment: .leading, spacing: AppTheme.stackTight) {
                                Text(entry.name)
                                    .font(AppFont.rowTitle)
                                Text(entry.date, format: AppLocale.time)
                                    .font(AppFont.rowMeta)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer(minLength: AppTheme.space8)
                            VStack(alignment: .trailing, spacing: AppTheme.stackTight) {
                                Text("\(entry.durationMinutes) 分钟")
                                    .font(AppFont.rowValue)
                                if let burn = entry.caloriesBurned {
                                    Text("\(Int(burn.rounded())) 千卡")
                                        .font(AppFont.rowMeta)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .padding(.vertical, AppTheme.space8)
                        if entry.id != dayExercises.last?.id {
                            Divider()
                        }
                    }
                }
                .padding(.horizontal, AppTheme.cardPadding)
                .padding(.bottom, AppTheme.space8)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .appSurface()
    }

    private var exerciseHelpSheet: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AppTheme.stackLoose) {
                    Text("没戴手表时，健康不会自动记上这次运动。请在「健康」App 里补一条体能训练，「健身」App 主要是看圆环，不能在那里手补。")
                        .font(AppFont.emptyBody)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    VStack(alignment: .leading, spacing: AppTheme.stackDefault) {
                        hintStep(1, "打开 Apple 健康")
                        hintStep(2, "点底部「搜索」，进入「健身记录」")
                        hintStep(3, "点「体能训练」，再点右上角添加")
                        hintStep(4, "填写运动类型、开始时间和结束时间")
                        hintStep(5, "如果知道大致消耗，可填写千卡")
                        hintStep(6, "回到 BodyTrack 重新同步")
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("补记步骤。打开 Apple 健康。点底部搜索，进入健身记录。点体能训练，再点右上角添加。填写运动类型、开始时间和结束时间。如果知道大致消耗，可填写千卡。回到 BodyTrack 重新同步。")

                    VStack(spacing: AppTheme.space8) {
                        Button {
                            openHealthApp()
                        } label: {
                            Label("打开 Apple 健康", systemImage: "heart.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                        .tint(AppTheme.activityGreen)

                        Button {
                            Task { await refreshHealthForDay(userInitiated: true) }
                        } label: {
                            if isExerciseSyncing {
                                ProgressView()
                                    .frame(maxWidth: .infinity)
                            } else {
                                Label("从健康同步", systemImage: "arrow.triangle.2.circlepath")
                                    .frame(maxWidth: .infinity)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .tint(AppTheme.brandTeal)
                        .disabled(isExerciseSyncing)
                        .accessibilityLabel("从健康同步")
                    }

                    if let exerciseSyncMessage {
                        Text(exerciseSyncMessage)
                            .font(AppFont.formError)
                            .foregroundStyle(exerciseSyncIsError ? AppTheme.danger : .secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(AppTheme.cardPadding)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("如何补记锻炼")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") { showExerciseHelp = false }
                        .fontWeight(.semibold)
                }
            }
        }
        .tint(AppTheme.brandTeal)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func hintStep(_ number: Int, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: AppTheme.space8) {
            Text("\(number).")
                .font(AppFont.rowValue)
                .foregroundStyle(AppTheme.activityGreen)
                .monospacedDigit()
            Text(text)
                .font(AppFont.emptyBody)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func openHealthApp() {
        guard let url = URL(string: "x-apple-health://") else { return }
        openURL(url) { accepted in
            if !accepted {
                exerciseSyncIsError = true
                exerciseSyncMessage = "打不开 Apple 健康，请在主屏幕手动打开。"
            }
        }
    }

    @MainActor
    private func refreshHealthForDay(userInitiated: Bool) async {
        if userInitiated {
            isExerciseSyncing = true
            exerciseSyncIsError = false
            exerciseSyncMessage = nil
        }
        defer {
            if userInitiated { isExerciseSyncing = false }
        }

        do {
            if userInitiated {
                try await HealthKitExerciseService.shared.requestAuthorization()
            }
            let count = try await HealthKitExerciseService.shared.syncWorkouts(
                into: modelContext,
                userInitiated: userInitiated
            )
            let totals = await HealthKitAccess.energyTotals(on: day)
            activeKcal = totals.active
            restingKcal = totals.resting
            if userInitiated {
                if dayExercises.isEmpty {
                    exerciseSyncMessage = count == 0
                        ? "健康中暂无新的锻炼。补记后回到这里再同步一次。"
                        : "已同步健康，这一天仍没有锻炼。"
                } else {
                    showExerciseHelp = false
                }
            }
        } catch {
            if userInitiated {
                exerciseSyncIsError = true
                exerciseSyncMessage = error.localizedDescription
            }
        }
    }

    @ViewBuilder
    private func daySection<Content: View>(
        title: String,
        empty: String?,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(AppFont.sectionTitle)
                .padding(.horizontal, AppTheme.cardPadding)
                .padding(.top, AppTheme.space12)
                .padding(.bottom, AppTheme.space8)

            if let empty {
                Text(empty)
                    .font(AppFont.emptyBody)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, AppTheme.cardPadding)
                    .padding(.bottom, AppTheme.space12)
            } else {
                VStack(spacing: 0) {
                    content()
                }
                .padding(.horizontal, AppTheme.cardPadding)
                .padding(.bottom, AppTheme.space8)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .appSurface()
    }
}

#Preview {
    NavigationStack {
        DayDetailView(day: Date())
    }
    .modelContainer(for: [WeightEntry.self, FoodEntry.self, ExerciseEntry.self, UserProfile.self], inMemory: true)
}
