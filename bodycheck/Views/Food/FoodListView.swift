//
//  FoodListView.swift
//  bodycheck
//

import SwiftData
import SwiftUI

struct FoodListView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \FoodEntry.date, order: .reverse) private var foods: [FoodEntry]

    @State private var showEditor = false
    @State private var searchText = ""

    private var todayFoods: [FoodEntry] {
        let day = Calendar.current.dayInterval(for: Date())
        return foods.filter { $0.date >= day.start && $0.date < day.end }
    }

    private var todayCalories: Double {
        todayFoods.reduce(0) { $0 + $1.calories }
    }

    private var filteredFoods: [FoodEntry] {
        guard !searchText.isEmpty else { return foods }
        let q = searchText.lowercased()
        return foods.filter {
            $0.name.lowercased().contains(q) || ($0.note ?? "").lowercased().contains(q)
        }
    }

    private var groupedByDay: [(day: Date, items: [FoodEntry], total: Double)] {
        let cal = Calendar.current
        let groups = Dictionary(grouping: filteredFoods) { cal.startOfDay(for: $0.date) }
        return groups.keys.sorted(by: >).map { day in
            let items = (groups[day] ?? []).sorted { $0.date > $1.date }
            let total = items.reduce(0) { $0 + $1.calories }
            return (day, items, total)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if foods.isEmpty {
                    ContentUnavailableView {
                        Label("还没有饮食记录", systemImage: "fork.knife")
                    } description: {
                        Text("快速添加名称和热量即可。")
                    } actions: {
                        Button("添加食物") { showEditor = true }
                            .buttonStyle(.borderedProminent)
                            .tint(AppTheme.brandTeal)
                            .controlSize(.large)
                    }
                } else {
                    List {
                        Section {
                            HStack(spacing: 16) {
                                Image(systemName: "flame.fill")
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(AppTheme.intakeAmber)
                                    .frame(width: 36, height: 36)
                                    .background {
                                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                                            .fill(AppTheme.intakeAmber.opacity(0.12))
                                    }
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("今日摄入")
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                                        Text(todayFoods.isEmpty ? "—" : "\(Int(todayCalories.rounded()))")
                                            .font(.system(size: 28, weight: .semibold, design: .rounded))
                                            .monospacedDigit()
                                        if !todayFoods.isEmpty {
                                            Text("千卡")
                                                .font(.subheadline.weight(.medium))
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                    Text(todayFoods.isEmpty ? "还没有饮食记录" : "\(todayFoods.count) 条记录")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                            }
                            .padding(.vertical, 4)
                        }

                        ForEach(groupedByDay, id: \.day) { group in
                            Section {
                                ForEach(group.items) { entry in
                                    HStack(alignment: .center, spacing: 12) {
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(entry.name)
                                                .font(.body.weight(.medium))
                                            Text(entry.date, format: AppLocale.time)
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                        Spacer(minLength: 8)
                                        Text("\(Int(entry.calories.rounded())) 千卡")
                                            .font(.subheadline.monospacedDigit().weight(.semibold))
                                            .foregroundStyle(AppTheme.intakeAmber)
                                    }
                                    .padding(.vertical, 2)
                                }
                                .onDelete { offsets in
                                    delete(items: group.items, at: offsets)
                                }
                            } header: {
                                Text(sectionTitle(day: group.day, total: group.total))
                            }
                        }
                    }
                    #if os(iOS)
                    .listStyle(.insetGrouped)
                    #endif
                }
            }
            .navigationTitle("饮食")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.large)
            #endif
            #if os(macOS)
            .navigationSubtitle(
                todayFoods.isEmpty
                    ? "今日尚未记录"
                    : "今日 \(Int(todayCalories.rounded())) 千卡 · \(todayFoods.count) 条"
            )
            #endif
            .searchable(text: $searchText, prompt: "搜索食物名称")
            .toolbar {
                #if os(iOS)
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showEditor = true
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .symbolRenderingMode(.hierarchical)
                            .font(.title3)
                            .foregroundStyle(AppTheme.brandTeal)
                    }
                    .accessibilityLabel("添加食物")
                }
                IOSSettingsToolbar()
                #else
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showEditor = true
                    } label: {
                        Label("添加", systemImage: "plus")
                    }
                    .keyboardShortcut("n", modifiers: [.command])
                }
                #endif
            }
            .sheet(isPresented: $showEditor) {
                FoodEditorSheet()
            }
        }
    }

    private func sectionTitle(day: Date, total: Double) -> String {
        let datePart = day.formatted(AppLocale.monthDayWeekday)
        return "\(datePart) · \(Int(total.rounded())) 千卡"
    }

    private func delete(items: [FoodEntry], at offsets: IndexSet) {
        for index in offsets {
            modelContext.delete(items[index])
        }
        try? modelContext.save()
    }
}

struct FoodEditorSheet: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var nameText = ""
    @State private var caloriesText = ""
    @State private var date = Date()
    @State private var validationMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("名称", text: $nameText)
                    TextField("热量（千卡）", text: $caloriesText)
                        #if os(iOS)
                        .keyboardType(.decimalPad)
                        #endif
                    DatePicker("时间", selection: $date, displayedComponents: [.date, .hourAndMinute])
                        .environment(\.locale, AppLocale.chinese)
                        .environment(\.calendar, AppLocale.calendar)
                }
                if let validationMessage {
                    Section {
                        Text(validationMessage)
                            .foregroundStyle(.red)
                            .font(.footnote)
                    }
                }
            }
            .appFormStyle()
            .navigationTitle("添加食物")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                        .keyboardShortcut(.cancelAction)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") { saveFood() }
                        .fontWeight(.semibold)
                        .keyboardShortcut(.defaultAction)
                }
            }
        }
        .appChineseLocale()
        #if os(macOS)
        .frame(minWidth: 420, idealWidth: 460, minHeight: 280, idealHeight: 320)
        #endif
    }

    private func saveFood() {
        let name = nameText.trimmingCharacters(in: .whitespacesAndNewlines)
        let calText = caloriesText
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: ",", with: ".")

        guard !name.isEmpty else {
            validationMessage = "请输入食物名称"
            return
        }
        guard let calories = Double(calText), calories >= 0 else {
            validationMessage = "请输入有效的热量"
            return
        }

        modelContext.insert(FoodEntry(name: name, calories: calories, date: date))
        do {
            try modelContext.save()
            dismiss()
        } catch {
            validationMessage = "保存失败，请重试"
        }
    }
}

#Preview {
    FoodListView()
        .modelContainer(for: [WeightEntry.self, FoodEntry.self, ExerciseEntry.self], inMemory: true)
}
