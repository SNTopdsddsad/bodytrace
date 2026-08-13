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

    @AppStorage("weightUnit") private var weightUnitRaw: String = WeightUnit.kg.rawValue
    @Query(sort: [
        SortDescriptor(\WeightEntry.date, order: .reverse),
        SortDescriptor(\WeightEntry.createdAt, order: .reverse)
    ]) private var weights: [WeightEntry]
    @Query(sort: \FoodEntry.date, order: .reverse) private var foods: [FoodEntry]
    @Query(sort: \ExerciseEntry.date, order: .reverse) private var exercises: [ExerciseEntry]

    @State private var weightEditor: WeightEditorMode?
    #if os(iOS)
    @State private var activeKcal: Double?
    @State private var restingKcal: Double?
    #endif

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

    private var activeValue: Double? {
        #if os(iOS)
        activeKcal
        #else
        nil
        #endif
    }

    private var restingValue: Double? {
        #if os(iOS)
        restingKcal
        #else
        nil
        #endif
    }

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
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .sheet(item: $weightEditor) { mode in
            WeightEditorView(mode: mode)
        }
        #if os(iOS)
        .task(id: day.startOfDay) {
            let totals = await HealthKitAccess.energyTotals(on: day)
            activeKcal = totals.active
            restingKcal = totals.resting
        }
        #endif
    }

    private var weightHero: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("体重")
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
                    if dayWeights.count > 1 {
                        Text("当天 \(dayWeights.count) 条")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                }
            } else {
                Text("这一天没有体重记录")
                    .font(.title3.weight(.semibold))
                Text("趋势图上的点来自体重。若只看饮食和运动，仍会列在下面。")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .appSurface(padding: AppTheme.cardPadding)
    }

    private var energyCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text("当天热量")
                    .font(.system(size: 14, weight: .semibold))
                Text(energyCaption)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("热量差")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
                Text(netText ?? "—")
                    .font(.system(size: 32, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(netTone)
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                if netText != nil {
                    Text("千卡")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }

            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 0) {
                    energyCell("摄入", intake.map { "\(Int($0.rounded()))" }, AppTheme.intakeAmber)
                    energyRule
                    energyCell("活动能量", activeDisplay, AppTheme.activityGreen)
                    energyRule
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
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .appSurface()
    }

    private var energyCaption: String {
        guard netCalories != nil else { return "记录饮食或同步健康后计算" }
        #if os(iOS)
        return TodayEnergyMath.caption(
            activeKcal: activeKcal,
            noteMissingResting: restingKcal == nil
        )
        #else
        return TodayEnergyMath.caption(activeKcal: nil, noteMissingResting: true)
        #endif
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
        #if os(iOS)
        activeKcal.map { "\(Int($0.rounded()))" }
        #else
        nil
        #endif
    }

    private var restingDisplay: String? {
        #if os(iOS)
        restingKcal.map { "\(Int($0.rounded()))" }
        #else
        nil
        #endif
    }

    private var energyRule: some View {
        Rectangle()
            .fill(Color.primary.opacity(0.08))
            .frame(width: 1)
            .padding(.vertical, 8)
    }

    private func energyCell(_ label: String, _ value: String?, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.secondary)
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(value ?? "—")
                    .font(.system(size: 22, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(value == nil ? Color.secondary : tint)
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                Text("千卡")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var weightSection: some View {
        daySection(title: "当天体重", empty: dayWeights.isEmpty ? "没有体重记录" : nil) {
            ForEach(dayWeights) { entry in
                Button {
                    weightEditor = .edit(entry)
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(weightUnit.format(entry.weight))
                                .font(.body.weight(.semibold).monospacedDigit())
                                .foregroundStyle(.primary)
                            Text(entry.weightSource.displayName)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 8)
                        if let note = entry.note, !note.isEmpty {
                            Text(note)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    .padding(.vertical, 10)
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
                    HStack(spacing: 12) {
                        FoodPhotoThumb(data: entry.photoData)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(entry.name)
                                .font(.body.weight(.medium))
                                .foregroundStyle(.primary)
                            Text(entry.date, format: AppLocale.time)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 8)
                        Text("\(Int(entry.calories.rounded())) 千卡")
                            .font(.subheadline.monospacedDigit().weight(.semibold))
                            .foregroundStyle(AppTheme.intakeAmber)
                    }
                    .padding(.vertical, 10)
                }
                if entry.id != dayFoods.last?.id {
                    Divider()
                }
            }
        }
    }

    private var exerciseSection: some View {
        daySection(title: "当天运动", empty: dayExercises.isEmpty ? "没有运动记录" : nil) {
            ForEach(dayExercises) { entry in
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(entry.name)
                            .font(.body.weight(.medium))
                        Text(entry.date, format: AppLocale.time)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 8)
                    VStack(alignment: .trailing, spacing: 4) {
                        Text("\(entry.durationMinutes) 分钟")
                            .font(.subheadline.monospacedDigit().weight(.semibold))
                        if let burn = entry.caloriesBurned {
                            Text("\(Int(burn.rounded())) 千卡")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(.vertical, 10)
                if entry.id != dayExercises.last?.id {
                    Divider()
                }
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
                .font(.headline)
                .padding(.horizontal, AppTheme.cardPadding)
                .padding(.top, 14)
                .padding(.bottom, 8)

            if let empty {
                Text(empty)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, AppTheme.cardPadding)
                    .padding(.bottom, 14)
            } else {
                VStack(spacing: 0) {
                    content()
                }
                .padding(.horizontal, AppTheme.cardPadding)
                .padding(.bottom, 8)
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
    .modelContainer(for: [WeightEntry.self, FoodEntry.self, ExerciseEntry.self], inMemory: true)
}
