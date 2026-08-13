//
//  ExerciseEntry.swift
//  bodycheck
//
//  Exercise records are sourced from Apple Health (workouts) on iOS,
//  then available read-only on Mac via local / synced store.
//

import Foundation
import SwiftData

enum ExerciseSource: String, Codable, CaseIterable {
    case healthkit
    case manual

    var displayName: String {
        switch self {
        case .healthkit: "健康同步"
        case .manual: "手动记录"
        }
    }
}

@Model
final class ExerciseEntry {
    /// Defaults required for SwiftData + CloudKit.
    var id: UUID = UUID()
    var date: Date = Date()
    var name: String = ""
    var durationMinutes: Int = 0
    var caloriesBurned: Double?
    var note: String?
    /// `ExerciseSource.rawValue` — default healthkit for lightweight migration.
    var source: String = ExerciseSource.healthkit.rawValue
    /// HKWorkout / sample UUID for idempotent Health import.
    var healthKitUUID: UUID?
    var createdAt: Date = Date()
    var updatedAt: Date = Date()

    init(
        name: String,
        durationMinutes: Int,
        caloriesBurned: Double? = nil,
        date: Date = Date(),
        note: String? = nil,
        source: ExerciseSource = .healthkit,
        healthKitUUID: UUID? = nil
    ) {
        self.id = UUID()
        self.date = date
        self.name = name
        self.durationMinutes = durationMinutes
        self.caloriesBurned = caloriesBurned
        self.note = note
        self.source = source.rawValue
        self.healthKitUUID = healthKitUUID
        self.createdAt = Date()
        self.updatedAt = Date()
    }

    var exerciseSource: ExerciseSource {
        ExerciseSource(rawValue: source) ?? .healthkit
    }
}
