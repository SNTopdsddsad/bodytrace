//
//  WeightEditorView.swift
//  bodycheck
//

import SwiftData
import SwiftUI

enum WeightEditorMode: Identifiable {
    case create
    case edit(WeightEntry)

    var id: String {
        switch self {
        case .create: "create"
        case .edit(let entry): entry.id.uuidString
        }
    }

    var title: String {
        switch self {
        case .create: "记录体重"
        case .edit: "编辑体重"
        }
    }
}

struct WeightEditorView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @AppStorage("weightUnit") private var weightUnitRaw: String = WeightUnit.kg.rawValue

    let mode: WeightEditorMode

    @State private var weightText: String = ""
    @State private var date: Date = Date()
    @State private var note: String = ""
    @State private var validationMessage: String?
    @FocusState private var weightFocused: Bool

    private var weightUnit: WeightUnit {
        WeightUnit(rawValue: weightUnitRaw) ?? .kg
    }

    private var measurementFooter: String {
        #if os(iOS)
        "数值按当前设置单位输入，保存时统一换算为公斤。日期仅记录到天。首次保存会询问是否写入 Apple 健康。"
        #else
        "数值按当前设置单位输入，保存时统一换算为公斤。日期仅记录到天。Mac 上的修改不会写入 Apple 健康。"
        #endif
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("体重", text: $weightText)
                        #if os(iOS)
                        .keyboardType(.decimalPad)
                        #endif
                        .focused($weightFocused)
                    LabeledContent("单位", value: weightUnit.shortLabel)
                    DatePicker("日期", selection: $date, displayedComponents: [.date])
                        .environment(\.locale, AppLocale.chinese)
                        .environment(\.calendar, AppLocale.calendar)
                } header: {
                    Text("测量")
                } footer: {
                    Text(measurementFooter)
                }

                Section("备注（可选）") {
                    TextField("例如：空腹、晨起", text: $note, axis: .vertical)
                        .lineLimit(2...4)
                }

                if let validationMessage {
                    Section {
                        FormErrorText(message: validationMessage)
                    }
                }
            }
            .appFormStyle()
            .navigationTitle(mode.title)
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                        .keyboardShortcut(.cancelAction)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        Task { await save() }
                    }
                    .fontWeight(.semibold)
                    .keyboardShortcut(.defaultAction)
                }
            }
            .onAppear {
                hydrate()
                weightFocused = true
            }
            .tint(AppTheme.brandTeal)
        }
        .appChineseLocale()
        #if os(macOS)
        .frame(minWidth: 420, idealWidth: 460, minHeight: 320, idealHeight: 360)
        #endif
    }

    private func hydrate() {
        switch mode {
        case .create:
            weightText = ""
            date = Date()
            note = ""
        case .edit(let entry):
            weightText = String(format: "%.1f", weightUnit.fromKilograms(entry.weight))
            date = entry.date
            note = entry.note ?? ""
        }
    }

    private func save() async {
        let normalized = weightText
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: ",", with: ".")

        guard let value = Double(normalized), value > 0 else {
            validationMessage = "请输入有效的体重数值（大于 0）"
            return
        }

        let kg = weightUnit.toKilograms(value)
        guard kg < 500 else {
            validationMessage = "体重数值超出合理范围"
            return
        }

        let dayOnly = date.startOfDay
        let trimmedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let noteValue = trimmedNote.isEmpty ? nil : trimmedNote

        let entry: WeightEntry
        switch mode {
        case .create:
            let created = WeightEntry(weight: kg, date: dayOnly, source: .manual, note: noteValue)
            modelContext.insert(created)
            entry = created
        case .edit(let existing):
            existing.weight = kg
            existing.date = dayOnly
            existing.note = noteValue
            existing.updatedAt = Date()
            entry = existing
        }

        do {
            try modelContext.save()
        } catch {
            validationMessage = "保存失败，请重试"
            return
        }

        #if os(iOS)
        await HealthKitWeightService.shared.syncEntry(entry)
        try? modelContext.save()
        #endif

        dismiss()
    }
}

#Preview {
    WeightEditorView(mode: .create)
        .modelContainer(for: [WeightEntry.self, FoodEntry.self, ExerciseEntry.self], inMemory: true)
}
