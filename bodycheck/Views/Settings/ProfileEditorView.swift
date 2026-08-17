//
//  ProfileEditorView.swift
//  bodycheck
//

import SwiftData
import SwiftUI

struct ProfileEditorView: View {
    @Environment(\.modelContext) private var modelContext
    @AppStorage("weightUnit") private var weightUnitRaw: String = WeightUnit.kg.rawValue
    @Environment(\.dismiss) private var dismiss
    @Query private var profiles: [UserProfile]

    @State private var nameText = ""
    @State private var ageText = ""
    @State private var sex: UserSex = .unspecified
    @State private var heightText = ""
    @State private var targetWeightText = ""
    @State private var validationMessage: String?
    @State private var didLoad = false

    private var weightUnit: WeightUnit {
        WeightUnit(rawValue: weightUnitRaw) ?? .kg
    }

    private var profile: UserProfile? {
        UserProfile.current(from: profiles)
    }

    var body: some View {
        Form {
            Section {
                TextField("用户名", text: $nameText)
                    .textInputAutocapitalization(.never)
                TextField("年龄", text: $ageText)
                    .keyboardType(.numberPad)
                Picker("性别", selection: $sex) {
                    ForEach(UserSex.allCases) { item in
                        Text(item.displayName).tag(item)
                    }
                }
            } header: {
                Text("基本")
            }

            Section {
                TextField("身高", text: $heightText)
                    .keyboardType(.decimalPad)
                LabeledContent("单位", value: "厘米")
            } header: {
                Text("身高")
            }

            Section {
                TextField("目标体重", text: $targetWeightText)
                    .keyboardType(.decimalPad)
                LabeledContent("单位", value: weightUnit.shortLabel)
            } header: {
                Text("目标体重")
            } footer: {
                Text("按当前体重单位填写，保存为公斤。概览会对照最新体重显示差距。")
            }

            if let validationMessage {
                Section {
                    FormErrorText(message: validationMessage)
                }
            }
        }
        .navigationTitle("个人资料")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("取消") { dismiss() }
                    .keyboardShortcut(.cancelAction)
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("保存") { save() }
                    .fontWeight(.semibold)
                    .keyboardShortcut(.defaultAction)
            }
        }
        .onAppear(perform: loadIfNeeded)
        .tint(AppTheme.brandTeal)
    }

    private func loadIfNeeded() {
        guard !didLoad else { return }
        didLoad = true
        guard let profile else { return }
        nameText = profile.name
        if let age = profile.age {
            ageText = "\(age)"
        }
        sex = profile.sex
        if let height = profile.heightCm {
            heightText = Self.formatNumber(height)
        }
        if let target = profile.targetWeightKg {
            targetWeightText = Self.formatNumber(weightUnit.fromKilograms(target))
        }
    }

    private func save() {
        let name = nameText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else {
            validationMessage = "请填写用户名"
            return
        }

        let age: Int?
        let ageTrimmed = ageText.trimmingCharacters(in: .whitespacesAndNewlines)
        if ageTrimmed.isEmpty {
            age = nil
        } else if let value = Int(ageTrimmed), (1...120).contains(value) {
            age = value
        } else {
            validationMessage = "请输入 1 到 120 之间的年龄"
            return
        }

        let height: Double?
        let heightTrimmed = heightText.trimmingCharacters(in: .whitespacesAndNewlines)
        if heightTrimmed.isEmpty {
            height = nil
        } else if let value = Double(heightTrimmed.replacingOccurrences(of: ",", with: ".")),
                  (50...250).contains(value) {
            height = value
        } else {
            validationMessage = "请输入 50 到 250 之间的身高（厘米）"
            return
        }

        let targetKg: Double?
        let targetTrimmed = targetWeightText.trimmingCharacters(in: .whitespacesAndNewlines)
        if targetTrimmed.isEmpty {
            targetKg = nil
        } else if let value = Double(targetTrimmed.replacingOccurrences(of: ",", with: ".")), value > 0 {
            let kg = weightUnit.toKilograms(value)
            if (20...400).contains(kg) {
                targetKg = kg
            } else {
                validationMessage = "请输入合理的目标体重"
                return
            }
        } else {
            validationMessage = "请输入有效的目标体重"
            return
        }

        let record = profile ?? UserProfile()
        if profile == nil {
            modelContext.insert(record)
        }
        record.name = name
        record.age = age
        record.sexRaw = sex.rawValue
        record.heightCm = height
        record.targetWeightKg = targetKg
        record.updatedAt = Date()
        validationMessage = nil
        try? modelContext.save()
        dismiss()
    }

    private static func formatNumber(_ value: Double) -> String {
        if value == value.rounded() {
            return String(format: "%.0f", value)
        }
        return String(format: "%.1f", value)
    }
}

struct ProfileEditorSheet: View {
    var body: some View {
        NavigationStack {
            ProfileEditorView()
        }
        .tint(AppTheme.brandTeal)
        .appChineseLocale()
    }
}

#Preview {
    ProfileEditorSheet()
        .modelContainer(for: [WeightEntry.self, FoodEntry.self, ExerciseEntry.self, UserProfile.self], inMemory: true)
}
