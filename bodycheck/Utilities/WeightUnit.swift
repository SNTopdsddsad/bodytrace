//
//  WeightUnit.swift
//  bodycheck
//

import Foundation

enum WeightUnit: String, CaseIterable, Identifiable {
    case kg
    case lb

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .kg: "公斤 (kg)"
        case .lb: "磅 (lb)"
        }
    }

    var shortLabel: String {
        rawValue
    }

    /// Convert stored kilograms to the display unit.
    func fromKilograms(_ kg: Double) -> Double {
        switch self {
        case .kg: kg
        case .lb: kg * 2.2046226218
        }
    }

    /// Convert a value in this unit to kilograms for storage.
    func toKilograms(_ value: Double) -> Double {
        switch self {
        case .kg: value
        case .lb: value / 2.2046226218
        }
    }

    func format(_ kg: Double, fractionDigits: Int = 1) -> String {
        let value = fromKilograms(kg)
        return String(format: "%.\(fractionDigits)f %@", value, shortLabel)
    }
}
