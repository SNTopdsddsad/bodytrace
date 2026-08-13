//
//  WeightListView.swift
//  bodycheck
//
//  Weight management — design: mac-weight.html / design.md §4.2
//  Layout is width-adaptive (works from min window size, not only fullscreen).
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
    @AppStorage("weightUnit") private var weightUnitRaw: String = WeightUnit.kg.rawValue
    @Query(sort: [
        SortDescriptor(\WeightEntry.date, order: .reverse),
        SortDescriptor(\WeightEntry.createdAt, order: .reverse)
    ]) private var weights: [WeightEntry]

    @State private var selection: UUID?
    @State private var editorMode: WeightEditorMode?
    @State private var showInspector = true
    @State private var searchText = ""
    @State private var dateRange: WeightDateRange = .days30
    @State private var sourceFilter: WeightSourceFilter = .all
    @State private var noteFilter: WeightNoteFilter = .all
    @State private var pendingDeleteIDs: Set<UUID> = []
    @State private var sortNewestFirst = true
    @State private var contentWidth: CGFloat = 800
    #if os(iOS)
    @Environment(\.scenePhase) private var scenePhase
    @State private var isHealthSyncing = false
    @State private var healthSyncMessage: String?
    @State private var healthSyncIsError = false
    #endif

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

    /// Newest calendar day first; same-day rows use `createdAt`.
    private var orderedWeights: [WeightEntry] {
        matchingWeights.sorted(by: WeightEntry.chronologicalDescending)
    }

    private var filteredWeights: [WeightEntry] {
        sortNewestFirst ? orderedWeights : Array(orderedWeights.reversed())
    }

    private var selectedEntry: WeightEntry? {
        guard let selection else { return nil }
        return weights.first { $0.id == selection }
    }

    private var latestInFilter: WeightEntry? { orderedWeights.first }

    private var lastChange: Double? {
        guard orderedWeights.count > 1 else { return nil }
        return orderedWeights[0].weight - orderedWeights[1].weight
    }

    private var rangeChange: Double? {
        guard let newest = orderedWeights.first, let oldest = orderedWeights.last, orderedWeights.count > 1 else {
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

    /// Main pane width after optional inspector.
    private var listPaneWidth: CGFloat {
        #if os(macOS)
        if showInspector {
            let inspector = min(MacLayout.inspectorMax, max(MacLayout.inspectorMin, contentWidth * 0.28))
            return max(280, contentWidth - inspector - 1)
        }
        #endif
        return contentWidth
    }

    private var columns: WeightColumnMetrics {
        WeightColumnMetrics.metrics(forAvailableWidth: listPaneWidth)
    }

    private var inspectorWidth: CGFloat {
        min(MacLayout.inspectorMax, max(MacLayout.inspectorMin, contentWidth * 0.28))
    }

    private var isCompactMetrics: Bool {
        listPaneWidth < 560
    }

    var body: some View {
        NavigationStack {
            #if os(macOS)
            macBody
            #elseif os(iOS)
            iosBody
            #endif
        }
    }

    // MARK: - macOS

    #if os(macOS)
    private var macBody: some View {
        GeometryReader { geo in
            HStack(spacing: 0) {
                mainPane
                    .frame(maxWidth: .infinity, maxHeight: .infinity)

                if showInspector {
                    Rectangle()
                        .fill(Color(nsColor: .separatorColor))
                        .frame(width: 1)
                        .frame(maxHeight: .infinity)

                    inspectorPane
                        .frame(width: inspectorWidth)
                        .frame(maxHeight: .infinity)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .onAppear {
                contentWidth = geo.size.width
                applyWidthPolicy(geo.size.width)
            }
            .onChange(of: geo.size.width) { _, width in
                contentWidth = width
                applyWidthPolicy(width)
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .navigationTitle("体重")
        .navigationSubtitle(filteredWeights.isEmpty ? "暂无记录" : "\(filteredWeights.count) 条记录")
        .searchable(text: $searchText, prompt: "搜索备注或来源")
        .toolbar { macToolbar }
        .sheet(item: $editorMode) { mode in
            WeightEditorView(mode: mode)
        }
        .alert(
            pendingDeleteIDs.count <= 1 ? "删除这条体重记录？" : "删除这 \(pendingDeleteIDs.count) 条体重记录？",
            isPresented: showDeleteConfirm
        ) {
            Button("取消", role: .cancel) { pendingDeleteIDs = [] }
            Button("删除", role: .destructive) { confirmDelete() }
        } message: {
            Text("删除后无法恢复。Mac 端仅修改本地业务数据。")
        }
        .onAppear {
            if selection == nil {
                selection = filteredWeights.first?.id
            }
        }
        .onChange(of: filteredWeights.map(\.id)) { _, ids in
            if let selection, !ids.contains(selection) {
                self.selection = ids.first
            } else if selection == nil {
                self.selection = ids.first
            }
        }
    }

    /// When window is narrow, close inspector so list stays usable.
    private func applyWidthPolicy(_ width: CGFloat) {
        if width < MacLayout.compactContentWidth + MacLayout.inspectorMin {
            // Keep user's choice if they re-open; only auto-close when severely tight
            if width < 520, showInspector {
                showInspector = false
            }
        }
    }

    private var mainPane: some View {
        VStack(spacing: 0) {
            metricStrip
            filterBar
            columnHeader
            weightList
            tableFooter
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ToolbarContentBuilder
    private var macToolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .primaryAction) {
            Button {
                showInspector.toggle()
            } label: {
                Label("检查器", systemImage: "sidebar.trailing")
            }
            .help("显示或隐藏检查器")

            Button {
                editorMode = .create
            } label: {
                Label("记录体重", systemImage: "plus")
            }
            .keyboardShortcut("n", modifiers: [.command])
        }
    }

    // MARK: Metrics

    private var metricStrip: some View {
        Group {
            if isCompactMetrics {
                VStack(spacing: 0) {
                    stripCell(
                        label: "最新体重",
                        value: latestInFilter.map { String(format: "%.1f", weightUnit.fromKilograms($0.weight)) },
                        unit: weightUnit.shortLabel,
                        meta: latestInFilter.map { $0.date.formatted(AppLocale.day) }
                    )
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Divider()
                    HStack(spacing: 0) {
                        stripCell(
                            label: "与上一条相比",
                            value: lastChange.map { deltaText($0) },
                            unit: lastChange == nil ? nil : weightUnit.shortLabel,
                            meta: nil
                        )
                        verticalRule
                        stripCell(
                            label: "范围变化",
                            value: rangeChange.map { deltaText($0) },
                            unit: rangeChange == nil ? nil : weightUnit.shortLabel,
                            meta: dateRange.label
                        )
                    }
                    .frame(height: 64)
                }
                .frame(height: 130)
            } else {
                HStack(alignment: .center, spacing: 0) {
                    stripCell(
                        label: "最新体重",
                        value: latestInFilter.map { String(format: "%.1f", weightUnit.fromKilograms($0.weight)) },
                        unit: weightUnit.shortLabel,
                        meta: latestInFilter.map { $0.date.formatted(AppLocale.day) }
                    )
                    verticalRule
                    stripCell(
                        label: "与上一条相比",
                        value: lastChange.map { deltaText($0) },
                        unit: lastChange == nil ? nil : weightUnit.shortLabel,
                        meta: "方向只表示数据变化"
                    )
                    verticalRule
                    stripCell(
                        label: "当前范围变化",
                        value: rangeChange.map { deltaText($0) },
                        unit: rangeChange == nil ? nil : weightUnit.shortLabel,
                        meta: dateRange.label
                    )
                }
                .frame(height: 78)
            }
        }
        .background(Color(nsColor: .controlBackgroundColor))
        .overlay(alignment: .bottom) { Divider() }
    }

    private var verticalRule: some View {
        Rectangle()
            .fill(Color(nsColor: .separatorColor))
            .frame(width: 1)
            .padding(.vertical, 12)
    }

    private func stripCell(label: String, value: String?, unit: String?, meta: String?) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(.system(size: 10))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(value ?? "—")
                    .font(.system(size: isCompactMetrics ? 18 : 21, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if let unit, value != nil {
                    Text(unit)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.secondary)
                }
            }
            if let meta {
                Text(meta)
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
        .padding(.horizontal, isCompactMetrics ? 12 : 16)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    // MARK: Filters

    private var filterBar: some View {
        ViewThatFits(in: .horizontal) {
            filterRow(compact: false)
            filterRow(compact: true)
        }
        .padding(.horizontal, 12)
        .frame(height: 48)
        .background(Color(nsColor: .controlBackgroundColor))
        .overlay(alignment: .bottom) { Divider() }
    }

    private func filterRow(compact: Bool) -> some View {
        HStack(spacing: 8) {
            Picker("时间范围", selection: $dateRange) {
                ForEach(WeightDateRange.allCases) { item in
                    Text(item.label).tag(item)
                }
            }
            .labelsHidden()
            .frame(minWidth: compact ? 88 : 110, idealWidth: 120)

            Picker("来源", selection: $sourceFilter) {
                ForEach(WeightSourceFilter.allCases) { item in
                    Text(item.label).tag(item)
                }
            }
            .labelsHidden()
            .frame(minWidth: compact ? 88 : 110, idealWidth: 120)

            if !compact {
                Picker("备注", selection: $noteFilter) {
                    ForEach(WeightNoteFilter.allCases) { item in
                        Text(item.label).tag(item)
                    }
                }
                .labelsHidden()
                .frame(width: 110)
            }

            if dateRange != .days30 || sourceFilter != .all || noteFilter != .all || !searchText.isEmpty {
                Button("清除") {
                    dateRange = .days30
                    sourceFilter = .all
                    noteFilter = .all
                    searchText = ""
                }
                .buttonStyle(.borderless)
            }

            Spacer(minLength: 4)
            Text("\(filteredWeights.count) 条")
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
                .layoutPriority(1)
        }
    }

    // MARK: Columns + list

    private var columnHeader: some View {
        HStack(spacing: 0) {
            headerButton("日期", width: columns.date)
            headerLabel("体重", width: columns.weight, alignment: .trailing)
            if columns.showDelta {
                headerLabel("与上次相比", width: columns.delta, alignment: .trailing)
            }
            if columns.showSource {
                headerLabel("来源", width: columns.source, alignment: .leading)
            }
            if columns.showNote {
                Text("备注")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 8)
            } else {
                Spacer(minLength: 0)
            }
        }
        .frame(height: 32)
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.95))
        .overlay(alignment: .bottom) { Divider() }
    }

    private func headerButton(_ title: String, width: CGFloat) -> some View {
        Button {
            sortNewestFirst.toggle()
        } label: {
            HStack(spacing: 4) {
                Text(title)
                Image(systemName: sortNewestFirst ? "chevron.down" : "chevron.up")
                    .font(.system(size: 9, weight: .semibold))
            }
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(.secondary)
            .frame(width: width, alignment: .leading)
            .padding(.horizontal, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func headerLabel(_ title: String, width: CGFloat, alignment: Alignment) -> some View {
        Text(title)
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .frame(width: width, alignment: alignment)
            .padding(.horizontal, 8)
    }

    private var weightList: some View {
        Group {
            if filteredWeights.isEmpty {
                ContentUnavailableView {
                    Label(
                        weights.isEmpty ? "还没有体重记录" : "没有匹配的体重记录",
                        systemImage: "scalemass"
                    )
                } description: {
                    Text(
                        weights.isEmpty
                            ? "记录第一条体重，之后就能在这里查看趋势。"
                            : "试试调整筛选条件，或清除筛选。"
                    )
                } actions: {
                    if weights.isEmpty {
                        Button("记录体重") { editorMode = .create }
                            .buttonStyle(.borderedProminent)
                            .tint(AppTheme.brandTeal)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                // Use ForEach + optional tags so row selection works for UUID? binding.
                // Do NOT attach onTapGesture to rows — it steals clicks from List selection
                // (especially on the first/date column on macOS).
                List(selection: $selection) {
                    ForEach(filteredWeights, id: \.id) { entry in
                        weightRow(entry, columns: columns)
                            .tag(Optional.some(entry.id))
                            .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                            .contextMenu {
                                Button("编辑") {
                                    selection = entry.id
                                    editorMode = .edit(entry)
                                }
                                Button("删除", role: .destructive) {
                                    selection = entry.id
                                    pendingDeleteIDs = [entry.id]
                                }
                            }
                    }
                }
                .listStyle(.inset(alternatesRowBackgrounds: true))
                .scrollContentBackground(.hidden)
                .background(Color(nsColor: .controlBackgroundColor))
                .onDeleteCommand {
                    if let selection {
                        pendingDeleteIDs = [selection]
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func weightRow(_ entry: WeightEntry, columns: WeightColumnMetrics) -> some View {
        HStack(spacing: 0) {
            Text(entry.date, format: AppLocale.day)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .frame(width: columns.date, alignment: .leading)
                .padding(.horizontal, 8)
                // Avoid text becoming a separate focus/drag target that blocks row selection.
                .allowsHitTesting(false)

            Text(weightUnit.format(entry.weight))
                .font(.body.monospacedDigit())
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .frame(width: columns.weight, alignment: .trailing)
                .padding(.horizontal, 8)
                .allowsHitTesting(false)

            if columns.showDelta {
                Text(deltaVersusPrevious(entry))
                    .font(.body.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                    .frame(width: columns.delta, alignment: .trailing)
                    .padding(.horizontal, 8)
                    .allowsHitTesting(false)
            }

            if columns.showSource {
                SourceBadge(source: entry.weightSource)
                    .frame(width: columns.source, alignment: .leading)
                    .padding(.horizontal, 8)
                    .allowsHitTesting(false)
            }

            if columns.showNote {
                Text(entry.note?.isEmpty == false ? (entry.note ?? "—") : "—")
                    .foregroundStyle(entry.note?.isEmpty == false ? Color.primary : Color.secondary)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 8)
                    .allowsHitTesting(false)
            }
        }
        .font(.system(size: 13))
        .frame(maxWidth: .infinity, minHeight: 36, alignment: .leading)
        .contentShape(Rectangle())
    }

    private var tableFooter: some View {
        HStack {
            Text(selection == nil ? "未选择记录" : "已选择 1 条")
                .font(.system(size: 10))
                .foregroundStyle(.secondary)
            Spacer()
            Button {
                if let selection {
                    pendingDeleteIDs = [selection]
                }
            } label: {
                Label("删除所选", systemImage: "trash")
            }
            .disabled(selection == nil)
            .buttonStyle(.borderless)
            .foregroundStyle(selection == nil ? Color.secondary : Color.red)
        }
        .padding(.horizontal, 12)
        .frame(height: 36)
        .background(Color(nsColor: .controlBackgroundColor))
        .overlay(alignment: .top) { Divider() }
    }

    // MARK: Inspector

    private var inspectorPane: some View {
        VStack(spacing: 0) {
            HStack {
                Text("记录详情")
                    .font(.system(size: 12, weight: .semibold))
                    .lineLimit(1)
                Spacer(minLength: 8)
                Button {
                    showInspector = false
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                }
                .buttonStyle(.borderless)
                .help("关闭检查器")
            }
            .padding(.horizontal, 14)
            .frame(height: 44)
            .overlay(alignment: .bottom) { Divider() }

            if let entry = selectedEntry {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text(String(format: "%.1f", weightUnit.fromKilograms(entry.weight)))
                                .font(.system(size: 30, weight: .semibold, design: .rounded))
                                .monospacedDigit()
                                .minimumScaleFactor(0.7)
                                .lineLimit(1)
                            Text(weightUnit.shortLabel)
                                .font(.system(size: 12))
                                .foregroundStyle(.secondary)
                        }

                        inspectorRow("日期", entry.date.formatted(AppLocale.day))
                        inspectorRow("来源", entry.weightSource.displayName)
                        inspectorRow(
                            "备注",
                            (entry.note?.isEmpty == false) ? (entry.note ?? "—") : "—"
                        )
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                VStack(spacing: 8) {
                    Button {
                        editorMode = .edit(entry)
                    } label: {
                        Text("编辑")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(AppTheme.brandTeal)

                    Button(role: .destructive) {
                        pendingDeleteIDs = [entry.id]
                    } label: {
                        Text("删除")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
                .padding(12)
                .overlay(alignment: .top) { Divider() }
            } else {
                VStack(spacing: 10) {
                    Image(systemName: "sidebar.trailing")
                        .font(.system(size: 20))
                        .foregroundStyle(.secondary)
                    Text("选择一条记录")
                        .font(.system(size: 12, weight: .semibold))
                    Text("点选左侧列表中的体重记录。")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(16)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Color(nsColor: .controlBackgroundColor))
    }

    private func inspectorRow(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Divider()
            HStack(alignment: .top, spacing: 10) {
                Text(title)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .frame(width: 36, alignment: .leading)
                Text(value)
                    .font(.system(size: 12))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.top, 8)
        }
    }
    #endif

    // MARK: - iOS

    #if os(iOS)
    private var iosBody: some View {
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
                        iosMetricCards
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
                                    iosWeightRow(entry)
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
        .alert(
            "删除这条体重记录？",
            isPresented: showDeleteConfirm
        ) {
            Button("取消", role: .cancel) { pendingDeleteIDs = [] }
            Button("删除", role: .destructive) { confirmDelete() }
        } message: {
            Text("删除后无法恢复。")
        }
        #if os(iOS)
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
        #endif
    }

    private var hasActiveFilters: Bool {
        dateRange != .days30 || sourceFilter != .all || noteFilter != .all || !searchText.isEmpty
    }

    private var iosMetricCards: some View {
        VStack(spacing: AppTheme.space8) {
            HStack(spacing: AppTheme.space8) {
                iosMetricTile(
                    label: "最新",
                    value: latestInFilter.map { String(format: "%.1f", weightUnit.fromKilograms($0.weight)) },
                    unit: weightUnit.shortLabel,
                    accent: AppTheme.brandTeal
                )
                iosMetricTile(
                    label: "与上一条",
                    value: lastChange.map { deltaText($0) },
                    unit: lastChange == nil ? nil : weightUnit.shortLabel,
                    accent: AppTheme.brandTeal
                )
            }
            iosMetricTile(
                label: "范围变化 · \(dateRange.label)",
                value: rangeChange.map { deltaText($0) },
                unit: rangeChange == nil ? nil : weightUnit.shortLabel,
                accent: AppTheme.activityGreen
            )
        }
    }

    private func iosMetricTile(
        label: String,
        value: String?,
        unit: String?,
        accent: Color
    ) -> some View {
        SummaryMetricTile(
            label: label,
            value: value,
            unit: unit,
            tint: accent,
            showAccentStroke: true
        )
    }

    private func iosWeightRow(_ entry: WeightEntry) -> some View {
        HStack(alignment: .center, spacing: AppTheme.space12) {
            VStack(alignment: .leading, spacing: AppTheme.stackTight) {
                HStack(alignment: .firstTextBaseline, spacing: AppTheme.space8) {
                    Text(weightUnit.format(entry.weight))
                        .font(AppFont.listHero.monospacedDigit())
                    if let delta = iosDelta(for: entry) {
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

    private func iosDelta(for entry: WeightEntry) -> Double? {
        let ordered = weights.sorted { $0.date > $1.date }
        guard let idx = ordered.firstIndex(where: { $0.id == entry.id }),
              idx + 1 < ordered.count else {
            return nil
        }
        return entry.weight - ordered[idx + 1].weight
    }
    #endif

    // MARK: - Helpers

    private func deltaText(_ deltaKg: Double) -> String {
        let display = weightUnit.fromKilograms(deltaKg)
        if abs(deltaKg) < 0.000_1 { return "0.0" }
        let absText = String(format: "%.1f", abs(display))
        return deltaKg > 0 ? "↑ \(absText)" : "↓ \(absText)"
    }

    private func deltaVersusPrevious(_ entry: WeightEntry) -> String {
        let ordered = weights.sorted(by: WeightEntry.chronologicalDescending)
        guard let idx = ordered.firstIndex(where: { $0.id == entry.id }),
              idx + 1 < ordered.count else {
            return "—"
        }
        let delta = entry.weight - ordered[idx + 1].weight
        return "\(deltaText(delta)) \(weightUnit.shortLabel)"
    }

    #if os(iOS)
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
    #endif

    private func deleteEntries(_ entries: [WeightEntry]) {
        #if os(iOS)
        let healthRemovals: [UUID] = entries.compactMap { entry in
            guard entry.weightSource == .manual else { return nil }
            return entry.healthKitUUID
        }
        #endif
        for entry in entries {
            modelContext.delete(entry)
        }
        try? modelContext.save()
        #if os(iOS)
        Task {
            for uuid in healthRemovals {
                await HealthKitWeightService.shared.deleteSample(uuid: uuid)
            }
        }
        #endif
    }

    private func confirmDelete() {
        let targets = pendingDeleteIDs.compactMap { id in
            weights.first(where: { $0.id == id })
        }
        deleteEntries(targets)
        if let selection, pendingDeleteIDs.contains(selection) {
            self.selection = nil
        }
        pendingDeleteIDs = []
    }
}

#Preview {
    WeightListView()
        .modelContainer(for: [WeightEntry.self, FoodEntry.self, ExerciseEntry.self], inMemory: true)
}
