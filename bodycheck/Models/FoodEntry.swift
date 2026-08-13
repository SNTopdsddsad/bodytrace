//
//  FoodEntry.swift
//  bodycheck
//

import Foundation
import SwiftData

@Model
final class FoodEntry {
    /// Defaults required for SwiftData + CloudKit.
    var id: UUID = UUID()
    var date: Date = Date()
    var name: String = ""
    var calories: Double = 0
    var healthKitUUID: UUID?
    var note: String?
    /// JPEG bytes; optional for CloudKit. Stored outside the main SQLite page.
    @Attribute(.externalStorage)
    var photoData: Data?
    var createdAt: Date = Date()
    var updatedAt: Date = Date()

    init(
        name: String,
        calories: Double,
        date: Date = Date(),
        healthKitUUID: UUID? = nil,
        note: String? = nil,
        photoData: Data? = nil
    ) {
        self.id = UUID()
        self.date = date
        self.name = name
        self.calories = calories
        self.healthKitUUID = healthKitUUID
        self.note = note
        self.photoData = photoData
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}
