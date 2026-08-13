//
//  WeightEntry.swift
//  bodycheck
//

import Foundation
import SwiftData

enum WeightSource: String, Codable, CaseIterable, Identifiable {
    case healthkit
    case manual

    var id: String { rawValue }

    /// User-facing labels per design terminology.
    var displayName: String {
        switch self {
        case .healthkit: "健康同步"
        case .manual: "手动记录"
        }
    }
}

@Model
final class WeightEntry {
    /// Defaults required for SwiftData + CloudKit.
    var id: UUID = UUID()
    var date: Date = Date()
    /// Stored in kilograms.
    var weight: Double = 0
    /// `WeightSource.rawValue`
    var source: String = WeightSource.manual.rawValue
    var healthKitUUID: UUID?
    var note: String?
    var createdAt: Date = Date()
    var updatedAt: Date = Date()

    init(
        weight: Double,
        date: Date = Date(),
        source: WeightSource = .manual,
        healthKitUUID: UUID? = nil,
        note: String? = nil
    ) {
        self.id = UUID()
        self.date = date
        self.weight = weight
        self.source = source.rawValue
        self.healthKitUUID = healthKitUUID
        self.note = note
        self.createdAt = Date()
        self.updatedAt = Date()
    }

    var weightSource: WeightSource {
        WeightSource(rawValue: source) ?? .manual
    }
}
