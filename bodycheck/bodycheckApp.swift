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

    init() {
        do {
            let configuration = ModelConfiguration(
                "BodyTrack",
                isStoredInMemoryOnly: false,
                cloudKitDatabase: .none
            )
            modelContainer = try ModelContainer(
                for: WeightEntry.self, FoodEntry.self, ExerciseEntry.self,
                configurations: configuration
            )
        } catch {
            fatalError("Failed to create ModelContainer: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
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
                .frame(minWidth: 520, idealWidth: 560, minHeight: 360)
        }
        #endif
    }
}
