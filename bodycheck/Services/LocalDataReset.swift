//
//  LocalDataReset.swift
//  bodycheck
//
//  Deletes every BodyTrack record the user owns. Health App source data stays put.
//

import Foundation
import SwiftData

enum LocalDataReset {
    @MainActor
    static func wipeAll(in context: ModelContext) async throws {
        HealthAutoImport.pause()

        let weights = try context.fetch(FetchDescriptor<WeightEntry>())
        let foods = try context.fetch(FetchDescriptor<FoodEntry>())
        let exercises = try context.fetch(FetchDescriptor<ExerciseEntry>())
        let profiles = try context.fetch(FetchDescriptor<UserProfile>())

        let healthRemovals = weights.compactMap { entry -> UUID? in
            guard entry.weightSource == .manual else { return nil }
            return entry.healthKitUUID
        }

        for item in weights { context.delete(item) }
        for item in foods { context.delete(item) }
        for item in exercises { context.delete(item) }
        for item in profiles { context.delete(item) }
        try context.save()

        WidgetSnapshotStore.clear()

        for uuid in healthRemovals {
            await HealthKitWeightService.shared.deleteSample(uuid: uuid)
        }
    }
}
