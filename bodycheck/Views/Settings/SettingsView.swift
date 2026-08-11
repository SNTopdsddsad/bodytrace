//
//  SettingsView.swift
//  bodycheck
//

import SwiftUI

struct SettingsView: View {
    @AppStorage("weightUnit") private var weightUnitRaw: String = WeightUnit.kg.rawValue

    private var weightUnitBinding: Binding<WeightUnit> {
        Binding(
            get: { WeightUnit(rawValue: weightUnitRaw) ?? .kg },
            set: { weightUnitRaw = $0.rawValue }
        )
    }

    var body: some View {
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
        NavigationStack {
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
            .tint(AppTheme.brandTeal)
        }
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
            Text("单位切换只影响显示，底层始终以公斤存储。")
        }
    }

    private var syncSection: some View {
        Section {
            LabeledContent("iCloud 同步", value: "未启用")
            LabeledContent("说明", value: "后续阶段接入；离线时本地记录仍可用")
        } header: {
            Text("同步")
        } footer: {
            Text("数据保存在你的设备上，并通过你的私人 iCloud 在设备间同步（启用后）。")
        }
    }

    #if os(iOS)
    private var healthSection: some View {
        Section {
            LabeledContent("运动数据", value: "Apple 健康 workout")
            Text("在「运动」页可从健康同步。Mac 端仅查看，不支持编辑。")
                .font(.caption)
                .foregroundStyle(.secondary)
        } header: {
            Text("健康")
        }
    }
    #endif

    private var privacySection: some View {
        Section {
            Text("BodyTrack 不会将健康数据用于广告或出售给第三方。")
                .font(.callout)
                .foregroundStyle(.secondary)
        } header: {
            Text("数据与隐私")
        }
    }

    private var aboutSection: some View {
        Section("关于") {
            LabeledContent("应用", value: "BodyTrack")
            LabeledContent("版本", value: "1.0")
            LabeledContent("Bundle ID", value: "yinke.bodycheck")
        }
    }
}

#Preview {
    SettingsView()
}
