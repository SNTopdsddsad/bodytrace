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
    #endif

    private var todayExercises: [ExerciseEntry] {
        let day = Calendar.current.dayInterval(for: Date())
        return exercises.filter { $0.date >= day.start && $0.date < day.end }
    }

    private var todayMinutes: Int {
        todayExercises.reduce(0) { $0 + $1.durationMinutes }
    }

    private var todayBurn: Double? {
        let burns = todayExercises.compactMap(\.caloriesBurned)
        return burns.isEmpty ? nil : burns.reduce(0, +)
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
                        .font(.footnote)
                        .foregroundStyle(statusIsError ? .red : .secondary)
                        .frame(maxWidth: .infinity)
                        .padding(10)
                        .background(.bar)
                }
            }
            .task {
                // Soft auto-sync on first open (won't crash if denied).
                if exercises.isEmpty {
                    await syncFromHealth(silent: true)
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
                HStack(spacing: 12) {
                    exerciseSummaryTile(
                        symbol: "timer",
                        label: "今日时长",
                        value: todayExercises.isEmpty ? "—" : "\(todayMinutes)",
                        unit: todayExercises.isEmpty ? nil : "分钟"
                    )
                    exerciseSummaryTile(
                        symbol: "flame.fill",
                        label: "今日消耗",
                        value: todayBurn.map { "\(Int($0.rounded()))" } ?? "—",
                        unit: todayBurn == nil ? nil : "千卡"
                    )
                }
                .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            } footer: {
                #if os(macOS)
                Text("运动记录来自 Apple 健康，Mac 端仅支持查看，不可新增或编辑。")
                #else
                Text("数据来自 Apple 健康中的锻炼记录；消耗为空时显示为 —。")
                #endif
            }

            Section("全部记录") {
                ForEach(exercises) { entry in
                    exerciseRow(entry)
                }
                // Mac: no swipe-to-delete. iOS: also no delete of Health-sourced rows
                // to keep Health as source of truth (re-sync restores them).
            }
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        #endif
    }

    private func exerciseSummaryTile(
        symbol: String,
        label: String,
        value: String,
        unit: String?
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(AppTheme.activityGreen)
                .frame(width: 32, height: 32)
                .background {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(AppTheme.activityGreen.opacity(0.12))
                }
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(value)
                    .font(.system(size: 22, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                if let unit {
                    Text(unit)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background {
            RoundedRectangle(cornerRadius: AppTheme.cardCornerRadius, style: .continuous)
                #if os(iOS)
                .fill(Color(.secondarySystemGroupedBackground))
                #else
                .fill(Color(nsColor: .controlBackgroundColor))
                #endif
        }
    }

    private func exerciseRow(_ entry: ExerciseEntry) -> some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.name)
                    .font(.body.weight(.medium))
                Text(entry.date, format: AppLocale.dateTime)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 4) {
                Text(durationText(entry.durationMinutes))
                    .font(.subheadline.monospacedDigit().weight(.semibold))
                Text(entry.caloriesBurned.map { "\(Int($0.rounded())) 千卡" } ?? "—")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(entry.exerciseSource.displayName)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(AppTheme.activityGreen)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(AppTheme.activityGreen.opacity(0.12), in: Capsule())
            }
        }
        .padding(.vertical, 4)
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
    #endif
}

#Preview {
    ExerciseListView()
        .modelContainer(for: [WeightEntry.self, FoodEntry.self, ExerciseEntry.self], inMemory: true)
}
