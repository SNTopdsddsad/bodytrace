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
    #if os(macOS)
    @State private var columnVisibility: NavigationSplitViewVisibility = .all
    #endif
    #if os(iOS)
    @State private var showSettings = false
    #endif

    var body: some View {
        Group {
            #if os(macOS)
            macRoot
            #else
            iosRoot
            #endif
        }
        .onAppear {
            if let restored = AppSection(rawValue: lastSectionRaw) {
                section = restored
            }
        }
        .onChange(of: section) { _, newValue in
            lastSectionRaw = newValue.rawValue
        }
        .tint(AppTheme.brandTeal)
    }

    #if os(macOS)
    private var macRoot: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            VStack(spacing: 0) {
                brandHeader
                    .padding(.horizontal, 8)
                    .padding(.top, 6)
                    .padding(.bottom, 4)

                List(selection: $section) {
                    Section("记录") {
                        ForEach(AppSection.allCases) { item in
                            Label(item.title, systemImage: item.systemImage)
                                .tag(item)
                        }
                    }
                }
                .listStyle(.sidebar)
                .scrollContentBackground(.hidden)

                Spacer(minLength: 0)

                sidebarFooter
                    .padding(.horizontal, 8)
                    .padding(.bottom, 10)
            }
            .background(Color(nsColor: .controlBackgroundColor).opacity(0.55))
            .navigationSplitViewColumnWidth(
                min: MacLayout.sidebarMin,
                ideal: MacLayout.sidebarIdeal,
                max: MacLayout.sidebarMax
            )
        } detail: {
            detail(for: section)
                .frame(minWidth: 420, maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(nsColor: .windowBackgroundColor))
        }
        .navigationSplitViewStyle(.balanced)
        // Keep sidebar visible when window is resized; user can still collapse via toolbar.
        .onAppear {
            if columnVisibility == .detailOnly {
                columnVisibility = .all
            }
        }
        .frame(minWidth: MacLayout.windowMinWidth, minHeight: MacLayout.windowMinHeight)
    }

    private var brandHeader: some View {
        HStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(Color.primary)
                    .frame(width: 28, height: 28)
                VStack(spacing: 4) {
                    Capsule().fill(Color(nsColor: .windowBackgroundColor)).frame(width: 12, height: 2)
                        .rotationEffect(.degrees(-8))
                    Capsule().fill(Color(nsColor: .windowBackgroundColor)).frame(width: 9, height: 2)
                        .rotationEffect(.degrees(7))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.leading, 7)
                }
            }
            VStack(alignment: .leading, spacing: 1) {
                Text("BodyTrack")
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .lineLimit(1)
                Text("健康记录")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
    }

    private var sidebarFooter: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: cloudSync.systemImage)
                    .font(.system(size: 12))
                    .frame(width: 14)
                VStack(alignment: .leading, spacing: 2) {
                    Text(cloudSync.title)
                        .font(.system(size: 11, weight: .medium))
                        .lineLimit(1)
                    Text(cloudSync.subtitle)
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)

            Text("设置 ⌘,")
                .font(.system(size: 10))
                .foregroundStyle(.tertiary)
                .padding(.horizontal, 8)
        }
    }
    #endif

    private var iosRoot: some View {
        TabView(selection: $section) {
            ForEach(AppSection.allCases) { item in
                detail(for: item)
                    .tabItem {
                        Label(item.title, systemImage: item.systemImage)
                    }
                    .tag(item)
            }
        }
        #if os(iOS)
        // Toolbar must live inside each page's NavigationStack — TabView itself has no nav bar.
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
        #endif
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
