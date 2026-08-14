//
//  ExerciseListView.swift
//  bodycheck
//
//  Exercise records are imported from Apple Health. No free-form entry.
//

import SwiftData
import SwiftUI

struct ExerciseListView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \ExerciseEntry.date, order: .reverse) private var exercises: [ExerciseEntry]

    @State private var isSyncing = false
    @State private var statusMessage: String?
    @State private var statusIsError = false
    @State private var todayRestingKcal: Double?
    @State private var todayActiveKcal: Double?

    private var todayExercises: [ExerciseEntry] {
        let day = Calendar.current.dayInterval(for: Date())
        return exercises.filter { $0.date >= day.start && $0.date < day.end }
    }

    private var todayMinutes: Int {
        todayExercises.reduce(0) { $0 + $1.durationMinutes }
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
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
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
            }
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
                if exercises.isEmpty {
                    await syncFromHealth(silent: true)
                } else {
                    await refreshEnergyTotals()
                }
            }
        }
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("还没有运动记录", systemImage: "figure.run")
        } description: {
            Text("点右上角「从健康同步」，读取 Apple 健康中的锻炼记录。")
        } actions: {
            Button {
                Task { await syncFromHealth() }
            } label: {
                Label("从健康同步", systemImage: "heart.text.square")
            }
            .buttonStyle(.borderedProminent)
            .tint(AppTheme.brandTeal)
            .disabled(isSyncing)
        }
    }

    private var listContent: some View {
        List {
            Section {
                HStack(spacing: AppTheme.space12) {
                    SummaryMetricTile(
                        label: "今日时长",
                        value: todayExercises.isEmpty ? nil : "\(todayMinutes)",
                        unit: todayExercises.isEmpty ? nil : "分钟",
                        symbol: "timer",
                        tint: AppTheme.activityGreen
                    )
                    SummaryMetricTile(
                        label: "活动能量",
                        value: todayActiveKcal.map { "\(Int($0.rounded()))" },
                        unit: todayActiveKcal == nil ? nil : "千卡",
                        symbol: "flame.fill",
                        tint: AppTheme.activityGreen
                    )
                    SummaryMetricTile(
                        label: "静息能量",
                        value: todayRestingKcal.map { "\(Int($0.rounded()))" },
                        unit: todayRestingKcal == nil ? nil : "千卡",
                        symbol: "bed.double.fill",
                        tint: AppTheme.activityGreen
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
                Text("活动能量、静息能量是健康今日合计。概览净热量 = 摄入 − 活动能量 − 静息能量。")
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
        }
        .listStyle(.insetGrouped)
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
}

#Preview {
    ExerciseListView()
        .modelContainer(for: [WeightEntry.self, FoodEntry.self, ExerciseEntry.self], inMemory: true)
}
