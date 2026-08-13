//
//  bodycheckApp.swift
//  bodycheck
//
//  Created by xuwudi on 2026/8/11.
//

import SwiftData
import SwiftUI

@main
struct bodycheckApp: App {
    private let modelContainer: ModelContainer
    @State private var cloudSync: CloudSyncMonitor

    init() {
        let persistence = PersistenceController.load()
        modelContainer = persistence.container
        _cloudSync = State(initialValue: persistence.cloudSync)
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(cloudSync)
                .task {
                    await cloudSync.start()
                }
        }
        .modelContainer(modelContainer)
        #if os(macOS)
        .defaultSize(width: MacLayout.windowDefaultWidth, height: MacLayout.windowDefaultHeight)
        .windowResizability(.contentMinSize)
        .commands {
            CommandGroup(replacing: .newItem) {}
        }
        #endif

        #if os(macOS)
        Settings {
            SettingsView()
                .modelContainer(modelContainer)
                .environment(cloudSync)
                .frame(minWidth: 520, idealWidth: 560, minHeight: 360)
        }
        #endif
    }
}
