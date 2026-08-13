//
//  ExerciseListView.swift
//  bodycheck
//
//  Mac: read-only list of Health-sourced workouts (via iPhone sync / local store).
//  iOS: import from Apple Health; no free-form Mac editing.
//

import SwiftData
import SwiftUI

struct ExerciseListView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \ExerciseEntry.date, order: .reverse) private var exercises: [ExerciseEntry]

    #if os(iOS)
    @State private var isSyncing = false
    @State private var statusMessage: String?
    @State private var statusIsError = false
    @State private var todayRestingKcal: Double?
    @State private var todayActiveKcal: Double?
    #endif

    private var todayExercises: [ExerciseEntry] {
        let day = Calendar.current.dayInterval(for: Date())
        return exercises.filter { $0.date >= day.start && $0.date < day.end }
    }

    private var todayMinutes: Int {
        todayExercises.reduce(0) { $0 + $1.durationMinutes }
    }

    private var todayRestingDisplay: String {
        #if os(iOS)
        todayRestingKcal.map { "\(Int($0.rounded()))" } ?? "—"
        #else
        "—"
        #endif
    }

    private var todayRestingUnit: String? {
        #if os(iOS)
        todayRestingKcal == nil ? nil : "千卡"
        #else
        nil
        #endif
    }

    private var todayActiveDisplay: String {
        #if os(iOS)
        todayActiveKcal.map { "\(Int($0.rounded()))" } ?? "—"
        #else
        "—"
        #endif
    }

    private var todayActiveUnit: String? {
        #if os(iOS)
        todayActiveKcal == nil ? nil : "千卡"
        #else
        nil
        #endif
    }

    var body: some View {
        NavigationStack {
            Group {
                if exercises.isEmpty {
                    emptyState
                } else {
                    listContent
                }
            }
            .navigationTitle("运动")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.large)
            #endif
            #if os(macOS)
            .navigationSubtitle(macSubtitle)
            #endif
            .toolbar {
                #if os(iOS)
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await syncFromHealth() }
                    } label: {
                        if isSyncing {
                            ProgressView()
                        } else {
                            Label("同步", systemImage: "arrow.triangle.2.circlepath")
                        }
                    }
                    .disabled(isSyncing)
                    .accessibilityLabel("从健康同步")
                }
                IOSSettingsToolbar()
                #endif
            }
            #if os(iOS)
            .safeAreaInset(edge: .bottom) {
                if let statusMessage {
                    Text(statusMessage)
                        .font(AppFont.formError)
                        .foregroundStyle(statusIsError ? AppTheme.danger : .secondary)
                        .frame(maxWidth: .infinity)
                        .padding(AppTheme.statusBarPadding)
                        .background(.bar)
                }
            }
            .task {
                // Soft auto-sync on first open (won't crash if denied).
                if exercises.isEmpty {
                    await syncFromHealth(silent: true)
                } else {
                    await refreshEnergyTotals()
                }
            }
            #endif
        }
    }

    #if os(macOS)
    private var macSubtitle: String {
        if exercises.isEmpty {
            return "数据来自 Apple 健康"
        }
        return "\(exercises.count) 条 · 来自 Apple 健康 · 仅查看"
    }
    #endif

    private var emptyState: some View {
        ContentUnavailableView {
            Label("还没有运动记录", systemImage: "figure.run")
        } description: {
            #if os(macOS)
            Text("运动数据来自 Apple 健康，由 iPhone 同步到此 Mac。请在 iPhone 上打开 BodyTrack 并从「健康」同步锻炼记录。")
            #else
            Text("点右上角「从健康同步」，读取 Apple 健康中的锻炼记录。Mac 端仅可查看。")
            #endif
        } actions: {
            #if os(iOS)
            Button {
                Task { await syncFromHealth() }
            } label: {
                Label("从健康同步", systemImage: "heart.text.square")
            }
            .buttonStyle(.borderedProminent)
            .tint(AppTheme.brandTeal)
            .disabled(isSyncing)
            #endif
        }
    }

    private var listContent: some View {
        List {
            Section {
                HStack(spacing: AppTheme.space12) {
                    exerciseSummaryTile(
                        symbol: "timer",
                        label: "今日时长",
                        value: todayExercises.isEmpty ? nil : "\(todayMinutes)",
                        unit: todayExercises.isEmpty ? nil : "分钟"
                    )
                    exerciseSummaryTile(
                        symbol: "flame.fill",
                        label: "活动能量",
                        value: todayActiveUnit == nil ? nil : todayActiveDisplay,
                        unit: todayActiveUnit
                    )
                    exerciseSummaryTile(
                        symbol: "bed.double.fill",
                        label: "静息能量",
                        value: todayRestingUnit == nil ? nil : todayRestingDisplay,
                        unit: todayRestingUnit
                    )
                }
                .listRowInsets(EdgeInsets(
                    top: AppTheme.space8,
                    leading: AppTheme.contentInset,
                    bottom: AppTheme.space8,
                    trailing: AppTheme.contentInset
                ))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            } footer: {
                #if os(macOS)
                Text("运动记录来自 Apple 健康，Mac 端仅支持查看。活动能量和静息能量请在 iPhone 上读取。")
                #else
                Text("活动能量、静息能量是健康今日合计。概览净热量 = 摄入 − 活动能量 − 静息能量。")
                #endif
            }

            Section {
                ForEach(exercises) { entry in
                    exerciseRow(entry)
                }
            } header: {
                Text("全部记录")
                    .font(AppFont.listSectionHeader)
                    .textCase(nil)
            }
            // Mac: no swipe-to-delete. iOS: also no delete of Health-sourced rows
            // to keep Health as source of truth (re-sync restores them).
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        #endif
    }

    private func exerciseSummaryTile(
        symbol: String,
        label: String,
        value: String?,
        unit: String?
    ) -> some View {
        SummaryMetricTile(
            label: label,
            value: value,
            unit: unit,
            symbol: symbol,
            tint: AppTheme.activityGreen
        )
    }

    private func exerciseRow(_ entry: ExerciseEntry) -> some View {
        HStack(alignment: .center, spacing: AppTheme.space12) {
            VStack(alignment: .leading, spacing: AppTheme.stackTight) {
                Text(entry.name)
                    .font(AppFont.rowTitle)
                Text(entry.date, format: AppLocale.dateTime)
                    .font(AppFont.rowMeta)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: AppTheme.space8)
            VStack(alignment: .trailing, spacing: AppTheme.stackTight) {
                Text(durationText(entry.durationMinutes))
                    .font(AppFont.rowValue)
                Text(entry.caloriesBurned.map { "\(Int($0.rounded())) 千卡" } ?? "—")
                    .font(AppFont.rowMeta)
                    .foregroundStyle(.secondary)
                TintedChip(text: entry.exerciseSource.displayName, tint: AppTheme.activityGreen)
            }
        }
        .padding(.vertical, AppTheme.rowVertical)
    }

    private func durationText(_ minutes: Int) -> String {
        if minutes < 60 {
            return "\(minutes) 分钟"
        }
        let h = minutes / 60
        let m = minutes % 60
        if m == 0 {
            return "\(h) 小时"
        }
        return "\(h) 小时 \(m) 分钟"
    }

    #if os(iOS)
    @MainActor
    private func syncFromHealth(silent: Bool = false) async {
        isSyncing = true
        defer { isSyncing = false }
        statusIsError = false
        do {
            try await HealthKitExerciseService.shared.requestAuthorization()
            let count = try await HealthKitExerciseService.shared.syncWorkouts(into: modelContext)
            await refreshEnergyTotals()
            if !silent {
                statusMessage = count == 0
                    ? "健康中暂无最近的锻炼记录"
                    : "已同步 \(count) 条运动记录"
            }
        } catch {
            statusIsError = true
            if !silent {
                statusMessage = error.localizedDescription
            }
        }
    }

    @MainActor
    private func refreshEnergyTotals() async {
        let totals = await HealthKitAccess.todayEnergyTotals()
        todayActiveKcal = totals.active
        todayRestingKcal = totals.resting
    }
    #endif
}

#Preview {
    ExerciseListView()
        .modelContainer(for: [WeightEntry.self, FoodEntry.self, ExerciseEntry.self], inMemory: true)
}
