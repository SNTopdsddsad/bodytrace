//
//  FoodEntry.swift
//  bodycheck
//

import Foundation
import SwiftData

@Model
final class FoodEntry {
    var id: UUID
    var date: Date
    var name: String
    var calories: Double
    var healthKitUUID: UUID?
    var note: String?
    var createdAt: Date
    var updatedAt: Date

    init(
        name: String,
        calories: Double,
        date: Date = Date(),
        healthKitUUID: UUID? = nil,
        note: String? = nil
    ) {
        self.id = UUID()
        self.date = date
        self.name = name
        self.calories = calories
        self.healthKitUUID = healthKitUUID
        self.note = note
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}
