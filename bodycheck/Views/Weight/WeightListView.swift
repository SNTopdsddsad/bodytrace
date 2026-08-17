//
//  WeightListView.swift
//  bodycheck
//

import SwiftData
import SwiftUI

enum WeightDateRange: String, CaseIterable, Identifiable {
    case days7, days30, days90, year, all

    var id: String { rawValue }

    var label: String {
        switch self {
        case .days7: "近 7 天"
        case .days30: "近 30 天"
        case .days90: "近 90 天"
        case .year: "今年"
        case .all: "全部记录"
        }
    }

    func contains(_ date: Date) -> Bool {
        let cal = Calendar.current
        switch self {
        case .days7:
            guard let start = cal.date(byAdding: .day, value: -7, to: Date()) else { return true }
            return date >= start
        case .days30:
            guard let start = cal.date(byAdding: .day, value: -30, to: Date()) else { return true }
            return date >= start
        case .days90:
            guard let start = cal.date(byAdding: .day, value: -90, to: Date()) else { return true }
            return date >= start
        case .year:
            let year = cal.component(.year, from: Date())
            return cal.component(.year, from: date) == year
        case .all:
            return true
        }
    }
}

enum WeightSourceFilter: String, CaseIterable, Identifiable {
    case all, manual, health

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: "全部来源"
        case .manual: "手动记录"
        case .health: "健康同步"
        }
    }

    func matches(_ source: WeightSource) -> Bool {
        switch self {
        case .all: return true
        case .manual: return source == .manual
        case .health: return source == .healthkit
        }
    }
}

enum WeightNoteFilter: String, CaseIterable, Identifiable {
    case all, with, without

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: "全部备注"
        case .with: "有备注"
        case .without: "无备注"
        }
    }

    func matches(_ note: String?) -> Bool {
        let has = !(note ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        switch self {
        case .all: return true
        case .with: return has
        case .without: return !has
        }
    }
}

struct WeightListView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("weightUnit") private var weightUnitRaw: String = WeightUnit.kg.rawValue
    @Query(sort: [
        SortDescriptor(\WeightEntry.date, order: .reverse),
        SortDescriptor(\WeightEntry.createdAt, order: .reverse)
    ]) private var weights: [WeightEntry]

    @State private var editorMode: WeightEditorMode?
    @State private var searchText = ""
    @State private var dateRange: WeightDateRange = .days30
    @State private var sourceFilter: WeightSourceFilter = .all
    @State private var noteFilter: WeightNoteFilter = .all
    @State private var pendingDeleteIDs: Set<UUID> = []
    @State private var isHealthSyncing = false
    @State private var healthSyncMessage: String?
    @State private var healthSyncIsError = false

    private var weightUnit: WeightUnit {
        WeightUnit(rawValue: weightUnitRaw) ?? .kg
    }

    private var matchingWeights: [WeightEntry] {
        weights.filter { entry in
            guard dateRange.contains(entry.date) else { return false }
            guard sourceFilter.matches(entry.weightSource) else { return false }
            guard noteFilter.matches(entry.note) else { return false }
            if searchText.isEmpty { return true }
            let q = searchText.lowercased()
            let note = (entry.note ?? "").lowercased()
            let source = entry.weightSource.displayName.lowercased()
            return note.contains(q) || source.contains(q)
        }
    }

    private var filteredWeights: [WeightEntry] {
        matchingWeights.sorted(by: WeightEntry.chronologicalDescending)
    }

    private var latestInFilter: WeightEntry? { filteredWeights.first }

    private var lastChange: Double? {
        guard filteredWeights.count > 1 else { return nil }
        return filteredWeights[0].weight - filteredWeights[1].weight
    }

    private var rangeChange: Double? {
        guard let newest = filteredWeights.first, let oldest = filteredWeights.last, filteredWeights.count > 1 else {
            return nil
        }
        return newest.weight - oldest.weight
    }

    private var showDeleteConfirm: Binding<Bool> {
        Binding(
            get: { !pendingDeleteIDs.isEmpty },
            set: { if !$0 { pendingDeleteIDs = [] } }
        )
    }

    private var hasActiveFilters: Bool {
        dateRange != .days30 || sourceFilter != .all || noteFilter != .all || !searchText.isEmpty
    }

    var body: some View {
        NavigationStack {
            Group {
                if weights.isEmpty {
                    ContentUnavailableView {
                        Label("还没有体重记录", systemImage: "scalemass")
                    } description: {
                        Text("记录第一条体重，或从 Apple 健康同步已有记录。")
                    } actions: {
                        Button("记录体重") { editorMode = .create }
                            .buttonStyle(.borderedProminent)
                            .tint(AppTheme.brandTeal)
                            .controlSize(.large)
                        Button("从健康同步") {
                            Task { await syncWeightsFromHealth() }
                        }
                        .disabled(isHealthSyncing)
                    }
                } else {
                    List {
                        Section {
                            metricCards
                        }
                        .listRowInsets(EdgeInsets(
                            top: AppTheme.space8,
                            leading: AppTheme.contentInset,
                            bottom: AppTheme.space8,
                            trailing: AppTheme.contentInset
                        ))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)

                        Section {
                            if filteredWeights.isEmpty {
                                ContentUnavailableView {
                                    Label("没有匹配的记录", systemImage: "line.3.horizontal.decrease.circle")
                                } description: {
                                    Text("试试调整筛选条件，或清除筛选。")
                                } actions: {
                                    Button("清除筛选") {
                                        dateRange = .days30
                                        sourceFilter = .all
                                        noteFilter = .all
                                        searchText = ""
                                    }
                                }
                                .listRowBackground(Color.clear)
                            } else {
                                ForEach(filteredWeights) { entry in
                                    Button {
                                        editorMode = .edit(entry)
                                    } label: {
                                        weightRow(entry)
                                    }
                                    .foregroundStyle(.primary)
                                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                        Button(role: .destructive) {
                                            deleteEntries([entry])
                                        } label: {
                                            Label("删除", systemImage: "trash")
                                        }
                                    }
                                    .swipeActions(edge: .leading) {
                                        Button {
                                            editorMode = .edit(entry)
                                        } label: {
                                            Label("编辑", systemImage: "pencil")
                                        }
                                        .tint(AppTheme.brandTeal)
                                    }
                                }
                            }
                        } header: {
                            HStack {
                                Text(dateRange.label)
                                Spacer()
                                Text("\(filteredWeights.count) 条")
                                    .foregroundStyle(.secondary)
                            }
                            .font(AppFont.listSectionHeader)
                            .textCase(nil)
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("体重")
            .navigationBarTitleDisplayMode(.large)
            .searchable(text: $searchText, prompt: "搜索备注或来源")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Picker("时间范围", selection: $dateRange) {
                            ForEach(WeightDateRange.allCases) { item in
                                Text(item.label).tag(item)
                            }
                        }
                        Picker("来源", selection: $sourceFilter) {
                            ForEach(WeightSourceFilter.allCases) { item in
                                Text(item.label).tag(item)
                            }
                        }
                        Picker("备注", selection: $noteFilter) {
                            ForEach(WeightNoteFilter.allCases) { item in
                                Text(item.label).tag(item)
                            }
                        }
                        if dateRange != .days30 || sourceFilter != .all || noteFilter != .all {
                            Divider()
                            Button("清除筛选") {
                                dateRange = .days30
                                sourceFilter = .all
                                noteFilter = .all
                            }
                        }
                    } label: {
                        Image(systemName: hasActiveFilters ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                    }
                    .accessibilityLabel("筛选")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await syncWeightsFromHealth() }
                    } label: {
                        if isHealthSyncing {
                            ProgressView()
                        } else {
                            Image(systemName: "heart.text.square")
                        }
                    }
                    .disabled(isHealthSyncing)
                    .accessibilityLabel("从健康同步")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    IOSCircleAddButton(accessibilityLabel: "记录体重") {
                        editorMode = .create
                    }
                }
                IOSSettingsToolbar()
            }
            .sheet(item: $editorMode) { mode in
                WeightEditorView(mode: mode)
            }
            .alert("删除这条体重记录？", isPresented: showDeleteConfirm) {
                Button("取消", role: .cancel) { pendingDeleteIDs = [] }
                Button("删除", role: .destructive) { confirmDelete() }
            } message: {
                Text("删除后无法恢复。")
            }
            .safeAreaInset(edge: .bottom) {
                if let healthSyncMessage {
                    Text(healthSyncMessage)
                        .font(AppFont.formError)
                        .foregroundStyle(healthSyncIsError ? AppTheme.danger : .secondary)
                        .frame(maxWidth: .infinity)
                        .padding(AppTheme.statusBarPadding)
                        .background(.bar)
                }
            }
            .task {
                await reconcileWeightsFromHealth(prompt: false)
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active {
                    Task { await reconcileWeightsFromHealth(prompt: false) }
                }
            }
        }
    }

    private var metricCards: some View {
        VStack(spacing: AppTheme.space8) {
            HStack(spacing: AppTheme.space8) {
                SummaryMetricTile(
                    label: "最新",
                    value: latestInFilter.map { String(format: "%.1f", weightUnit.fromKilograms($0.weight)) },
                    unit: weightUnit.shortLabel,
                    tint: AppTheme.brandTeal,
                    showAccentStroke: true
                )
                SummaryMetricTile(
                    label: "与上一条",
                    value: lastChange.map { deltaText($0) },
                    unit: lastChange == nil ? nil : weightUnit.shortLabel,
                    tint: AppTheme.brandTeal,
                    showAccentStroke: true
                )
            }
            SummaryMetricTile(
                label: "范围变化 · \(dateRange.label)",
                value: rangeChange.map { deltaText($0) },
                unit: rangeChange == nil ? nil : weightUnit.shortLabel,
                tint: AppTheme.activityGreen,
                showAccentStroke: true
            )
        }
    }

    private func weightRow(_ entry: WeightEntry) -> some View {
        HStack(alignment: .center, spacing: AppTheme.space12) {
            VStack(alignment: .leading, spacing: AppTheme.stackTight) {
                HStack(alignment: .firstTextBaseline, spacing: AppTheme.space8) {
                    Text(weightUnit.format(entry.weight))
                        .font(AppFont.listHero.monospacedDigit())
                    if let delta = delta(for: entry) {
                        DeltaChip(deltaKg: delta, unit: weightUnit)
                    }
                }
                Text(entry.date, format: AppLocale.dayWeekday)
                    .font(AppFont.rowDate)
                    .foregroundStyle(.secondary)
                if let note = entry.note, !note.isEmpty {
                    Text(note)
                        .font(AppFont.rowMeta)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: AppTheme.space8)
            SourceBadge(source: entry.weightSource)
        }
        .padding(.vertical, AppTheme.rowVertical)
    }

    private func delta(for entry: WeightEntry) -> Double? {
        let ordered = weights.sorted { $0.date > $1.date }
        guard let idx = ordered.firstIndex(where: { $0.id == entry.id }),
              idx + 1 < ordered.count else {
            return nil
        }
        return entry.weight - ordered[idx + 1].weight
    }

    private func deltaText(_ deltaKg: Double) -> String {
        let display = weightUnit.fromKilograms(deltaKg)
        if abs(deltaKg) < 0.000_1 { return "0.0" }
        let absText = String(format: "%.1f", abs(display))
        return deltaKg > 0 ? "↑ \(absText)" : "↓ \(absText)"
    }

    @MainActor
    private func syncWeightsFromHealth() async {
        isHealthSyncing = true
        healthSyncIsError = false
        defer { isHealthSyncing = false }
        do {
            let count = try await HealthKitWeightService.shared.reconcile(
                into: modelContext,
                promptIfNeeded: true
            )
            healthSyncMessage = count == 0
                ? "健康中暂无新的体重记录"
                : "已从健康同步 \(count) 条体重"
        } catch {
            healthSyncIsError = true
            healthSyncMessage = error.localizedDescription
        }
    }

    @MainActor
    private func reconcileWeightsFromHealth(prompt: Bool) async {
        do {
            _ = try await HealthKitWeightService.shared.reconcile(
                into: modelContext,
                promptIfNeeded: prompt
            )
        } catch {
            // Silent path must not block the list.
        }
    }

    private func deleteEntries(_ entries: [WeightEntry]) {
        let healthRemovals: [UUID] = entries.compactMap { entry in
            guard entry.weightSource == .manual else { return nil }
            return entry.healthKitUUID
        }
        for entry in entries {
            modelContext.delete(entry)
        }
        try? modelContext.save()
        Task {
            for uuid in healthRemovals {
                await HealthKitWeightService.shared.deleteSample(uuid: uuid)
            }
        }
    }

    private func confirmDelete() {
        let targets = pendingDeleteIDs.compactMap { id in
            weights.first(where: { $0.id == id })
        }
        deleteEntries(targets)
        pendingDeleteIDs = []
    }
}

#Preview {
    WeightListView()
        .modelContainer(for: [WeightEntry.self, FoodEntry.self, ExerciseEntry.self, UserProfile.self], inMemory: true)
}
