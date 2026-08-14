//
//  ContentView.swift
//  bodycheck
//
//  Created by xuwudi on 2026/8/11.
//

import SwiftData
import SwiftUI

struct ContentView: View {
    @Environment(CloudSyncMonitor.self) private var cloudSync
    @AppStorage("lastAppSection") private var lastSectionRaw: String = AppSection.today.rawValue
    @State private var section: AppSection = .today
    @State private var showSettings = false
    @State private var showLogWeightFromLink = false

    var body: some View {
        TabView(selection: $section) {
            ForEach(AppSection.allCases) { item in
                detail(for: item)
                    .tabItem {
                        Label(item.title, systemImage: item.systemImage)
                    }
                    .tag(item)
            }
        }
        .onAppear {
            if let restored = AppSection(rawValue: lastSectionRaw) {
                section = restored
            }
        }
        .onChange(of: section) { _, newValue in
            lastSectionRaw = newValue.rawValue
        }
        .onOpenURL { url in
            handleDeepLink(url)
        }
        .sheet(isPresented: $showLogWeightFromLink) {
            WeightEditorView(mode: .create)
        }
        .environment(\.openSettings) { showSettings = true }
        .sheet(isPresented: $showSettings) {
            NavigationStack {
                SettingsView()
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("完成") { showSettings = false }
                                .fontWeight(.semibold)
                        }
                    }
            }
            .tint(AppTheme.brandTeal)
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
        }
        .syncsWidgetSnapshot()
        .tint(AppTheme.brandTeal)
        .appChineseLocale()
    }

    private func handleDeepLink(_ url: URL) {
        switch DeepLink.route(from: url) {
        case .logWeight:
            section = .weight
            showLogWeightFromLink = true
        case .today:
            section = .today
        case .none:
            break
        }
    }

    @ViewBuilder
    private func detail(for section: AppSection) -> some View {
        switch section {
        case .today:
            TodayView(onOpenWeight: { self.section = .weight })
        case .weight:
            WeightListView()
        case .food:
            FoodListView()
        case .exercise:
            ExerciseListView()
        }
    }
}

#Preview {
    ContentView()
        .environment(CloudSyncMonitor(kind: .cloudEnabled))
        .modelContainer(for: [WeightEntry.self, FoodEntry.self, ExerciseEntry.self], inMemory: true)
}
