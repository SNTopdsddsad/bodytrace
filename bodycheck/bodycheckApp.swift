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
                .appChineseLocale()
                .task {
                    await cloudSync.start()
                    await HealthKitWeightService.shared.startObserving(container: modelContainer)
                }
        }
        .modelContainer(modelContainer)
    }
}
