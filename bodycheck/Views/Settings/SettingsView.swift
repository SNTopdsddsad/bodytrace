//
//  SettingsView.swift
//  bodycheck
//

import SwiftData
import SwiftUI

struct SettingsView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(CloudSyncMonitor.self) private var cloudSync
    @AppStorage("weightUnit") private var weightUnitRaw: String = WeightUnit.kg.rawValue
    @Query private var profiles: [UserProfile]
    @Query private var weights: [WeightEntry]
    @Query private var foods: [FoodEntry]
    @Query private var exercises: [ExerciseEntry]
    @State private var weightWriteStatus = "检查中"
    @State private var showResetConfirm = false
    @State private var isResetting = false
    @State private var resetMessage: String?
    @State private var resetFailed = false

    private var weightUnitBinding: Binding<WeightUnit> {
        Binding(
            get: { WeightUnit(rawValue: weightUnitRaw) ?? .kg },
            set: { weightUnitRaw = $0.rawValue }
        )
    }

    var body: some View {
        Form {
            profileSection
            generalSection
            healthSection
            syncSection
            dataSection
            privacySection
            aboutSection
        }
        .navigationTitle("设置")
        .navigationBarTitleDisplayMode(.inline)
        .tint(AppTheme.brandTeal)
        .appChineseLocale()
        .task { await cloudSync.refresh() }
        .alert("清除我的全部数据？", isPresented: $showResetConfirm) {
            Button("取消", role: .cancel) {}
            Button("清除全部数据", role: .destructive) {
                Task { await resetAllRecords() }
            }
        } message: {
            Text(resetConfirmMessage)
        }
    }

    private var profile: UserProfile? {
        UserProfile.current(from: profiles)
    }

    private var profileSection: some View {
        Section {
            NavigationLink {
                ProfileEditorView()
            } label: {
                LabeledContent("个人资料", value: profileSummary)
            }
        } header: {
            Text("我")
        } footer: {
            Text("也可在概览页填写。资料只用于本应用展示，不单独上传给开发者。打开 iCloud 时会随私人库同步。")
        }
    }

    private var profileSummary: String {
        let name = profile?.trimmedName ?? ""
        return name.isEmpty ? "未填写" : name
    }

    private var generalSection: some View {
        Section {
            Picker("体重单位", selection: weightUnitBinding) {
                ForEach(WeightUnit.allCases) { unit in
                    Text(unit.displayName).tag(unit)
                }
            }
        } header: {
            Text("通用")
        } footer: {
            Text("只改界面显示的单位，已有记录不用重填。")
        }
    }

    private var syncSection: some View {
        Section {
            LabeledContent("iCloud 同步", value: cloudSync.settingsValue)
            LabeledContent("最近同步", value: cloudSync.lastSyncText)
            if let lastError = cloudSync.lastError {
                FormErrorText(message: lastError)
            }
            Button("重新检查") {
                Task { await cloudSync.refresh() }
            }
        } header: {
            Text("同步")
        } footer: {
            Text(cloudSync.settingsFooter)
        }
    }

    private var healthSection: some View {
        Section {
            LabeledContent("写入健康", value: weightWriteStatus)
            LabeledContent("运动记录", value: "来自 Apple 健康")
            LabeledContent("活动能量", value: "来自 Apple 健康")
            LabeledContent("静息能量", value: "来自 Apple 健康")
            Button("允许健康数据") {
                Task {
                    await HealthKitWeightService.shared.requestAuthorization()
                    weightWriteStatus = HealthKitWeightService.shared.shareStatusText
                }
            }
            if let url = URL(string: UIApplication.openSettingsURLString) {
                Link("打开系统设置", destination: url)
            }
            Text("可把体重写入 Apple 健康，并读取锻炼、活动能量和静息能量。授权后，健康里新增或修改的体重会自动出现在本应用。概览净热量 = 摄入 − 活动能量 − 静息能量。")
                .font(AppFont.rowMeta)
                .foregroundStyle(.secondary)
        } header: {
            Text("健康")
        }
        .onAppear {
            weightWriteStatus = HealthKitWeightService.shared.shareStatusText
        }
    }

    private var hasAnyRecords: Bool {
        !weights.isEmpty || !foods.isEmpty || !exercises.isEmpty || !profiles.isEmpty
    }

    private var recordSummary: String {
        var parts: [String] = []
        if !weights.isEmpty { parts.append("\(weights.count) 条体重") }
        if !foods.isEmpty { parts.append("\(foods.count) 条饮食") }
        if !exercises.isEmpty { parts.append("\(exercises.count) 条运动") }
        if !profiles.isEmpty { parts.append("个人资料") }
        return parts.joined(separator: "、")
    }

    private var resetConfirmMessage: String {
        let target = hasAnyRecords ? recordSummary : "本应用保存的全部数据"
        return "将删除 \(target)，包括饮食照片。打开 iCloud 时，删除会同步到你的其他设备。本应用写入健康的手动体重会尝试一并删除。健康 App 里其他来源的数据不会动。清除后不会再自动从健康导入，除非你再次点「从健康同步」。此操作无法撤销。"
    }

    private var dataSection: some View {
        Section {
            Button("清除我的全部数据", role: .destructive) {
                resetMessage = nil
                resetFailed = false
                showResetConfirm = true
            }
            .disabled(isResetting)
            if isResetting {
                HStack(spacing: AppTheme.space8) {
                    ProgressView()
                    Text("正在清除…")
                        .font(AppFont.rowMeta)
                        .foregroundStyle(.secondary)
                }
            } else if let resetMessage {
                if resetFailed {
                    FormErrorText(message: resetMessage)
                } else {
                    Text(resetMessage)
                        .font(AppFont.rowMeta)
                        .foregroundStyle(.secondary)
                }
            }
        } header: {
            Text("数据")
        } footer: {
            Text("你可以随时删除本应用保存的体重、饮食、运动和个人资料。健康 App 中的源数据不会删除。体重单位等显示偏好会保留。")
        }
    }

    @MainActor
    private func resetAllRecords() async {
        isResetting = true
        resetFailed = false
        defer { isResetting = false }
        do {
            try await LocalDataReset.wipeAll(in: modelContext)
            resetMessage = "已清除全部数据"
        } catch {
            resetFailed = true
            resetMessage = "清除失败：\(error.localizedDescription)"
        }
    }

    private var privacySection: some View {
        Section {
            Text("BodyTrack 不会将健康数据用于广告或出售给第三方。")
                .font(AppFont.prose)
                .foregroundStyle(.secondary)
            NavigationLink("查看完整隐私政策") {
                PrivacyPolicyView()
            }
            if let mail = AppLegal.supportMailURL {
                Link("邮件询问隐私问题", destination: mail)
            }
        } header: {
            Text("数据与隐私")
        }
    }

    private var aboutSection: some View {
        Section("关于") {
            LabeledContent("应用", value: "BodyTrack")
            LabeledContent("版本", value: "1.0")
        }
    }
}

#Preview {
    SettingsView()
        .environment(CloudSyncMonitor(kind: .cloudEnabled))
        .modelContainer(for: [WeightEntry.self, FoodEntry.self, ExerciseEntry.self, UserProfile.self], inMemory: true)
}
