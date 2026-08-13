//
//  SettingsView.swift
//  bodycheck
//

import SwiftUI

struct SettingsView: View {
    @Environment(CloudSyncMonitor.self) private var cloudSync
    @AppStorage("weightUnit") private var weightUnitRaw: String = WeightUnit.kg.rawValue
    #if os(iOS)
    @State private var weightWriteStatus = "检查中"
    #endif

    private var weightUnitBinding: Binding<WeightUnit> {
        Binding(
            get: { WeightUnit(rawValue: weightUnitRaw) ?? .kg },
            set: { weightUnitRaw = $0.rawValue }
        )
    }

    var body: some View {
        settingsBody
            .appChineseLocale()
            .task { await cloudSync.refresh() }
    }

    @ViewBuilder
    private var settingsBody: some View {
        #if os(macOS)
        TabView {
            generalPane
                .tabItem { Label("通用", systemImage: "gearshape") }
            syncPane
                .tabItem { Label("同步", systemImage: "icloud") }
            privacyPane
                .tabItem { Label("隐私", systemImage: "hand.raised") }
            aboutPane
                .tabItem { Label("关于", systemImage: "info.circle") }
        }
        .tint(AppTheme.brandTeal)
        #else
        Form {
            generalSection
            #if os(iOS)
            healthSection
            #endif
            syncSection
            privacySection
            aboutSection
        }
        .navigationTitle("设置")
        .navigationBarTitleDisplayMode(.inline)
        .tint(AppTheme.brandTeal)
        #endif
    }

    #if os(macOS)
    private var generalPane: some View {
        Form {
            generalSection
        }
        .formStyle(.grouped)
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var syncPane: some View {
        Form {
            syncSection
        }
        .formStyle(.grouped)
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var privacyPane: some View {
        Form {
            privacySection
        }
        .formStyle(.grouped)
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var aboutPane: some View {
        Form {
            aboutSection
        }
        .formStyle(.grouped)
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
    #endif

    private var generalSection: some View {
        Section {
            Picker("体重单位", selection: weightUnitBinding) {
                ForEach(WeightUnit.allCases) { unit in
                    Text(unit.displayName).tag(unit)
                }
            }
            #if os(macOS)
            .pickerStyle(.radioGroup)
            #endif
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

    #if os(iOS)
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
    #endif

    private var privacySection: some View {
        Section {
            Text("BodyTrack 不会将健康数据用于广告或出售给第三方。")
                .font(AppFont.prose)
                .foregroundStyle(.secondary)
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
}
