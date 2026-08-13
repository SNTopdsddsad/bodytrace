//
//  WidgetSnapshot.swift
//  Shared
//
//  Glanceable summary only. Widget never opens SwiftData or CloudKit.
//

import Foundation
#if canImport(WidgetKit)
import WidgetKit
#endif

nonisolated struct WidgetSnapshot: Codable, Equatable, Sendable {
    var latestWeightKg: Double?
    var latestWeightDate: Date?
    var previousWeightKg: Double?
    var todayCalories: Double
    var todayFoodCount: Int
    /// 摄入 − 有消耗的运动 − 静息。都没有时为 nil。
    var todayNetCalories: Double?
    /// 例如「摄入 − 活动能量 − 静息能量」或「未计入静息」。
    var netCaption: String?
    /// Local calendar-day start used when calorie fields were written.
    var calorieDayStart: Date
    var weightUnitRaw: String
    var updatedAt: Date

    static let empty = WidgetSnapshot(
        latestWeightKg: nil,
        latestWeightDate: nil,
        previousWeightKg: nil,
        todayCalories: 0,
        todayFoodCount: 0,
        todayNetCalories: nil,
        netCaption: nil,
        calorieDayStart: Date.distantPast,
        weightUnitRaw: WeightUnit.kg.rawValue,
        updatedAt: .distantPast
    )

    static let placeholder = WidgetSnapshot(
        latestWeightKg: 68.4,
        latestWeightDate: Date(),
        previousWeightKg: 68.7,
        todayCalories: 1260,
        todayFoodCount: 3,
        todayNetCalories: -420,
        netCaption: "摄入 − 活动能量 − 静息能量",
        calorieDayStart: Calendar.current.startOfDay(for: Date()),
        weightUnitRaw: WeightUnit.kg.rawValue,
        updatedAt: Date()
    )

    var weightUnit: WeightUnit {
        WeightUnit(rawValue: weightUnitRaw) ?? .kg
    }

    var deltaKg: Double? {
        guard let latest = latestWeightKg, let previous = previousWeightKg else { return nil }
        return latest - previous
    }

    var isCalorieDayToday: Bool {
        Calendar.current.isDate(calorieDayStart, inSameDayAs: Date())
    }

    var displayedTodayCalories: Double {
        isCalorieDayToday ? todayCalories : 0
    }

    var displayedTodayFoodCount: Int {
        isCalorieDayToday ? todayFoodCount : 0
    }

    var displayedTodayNetCalories: Double? {
        isCalorieDayToday ? todayNetCalories : nil
    }

    var displayedNetCaption: String? {
        isCalorieDayToday ? netCaption : nil
    }
}

nonisolated enum WidgetSnapshotStore {
    static let widgetKind = "WeightWidget"

    static func load() -> WidgetSnapshot {
        guard let defaults = AppGroup.userDefaults else { return .empty }
        if let data = defaults.data(forKey: AppGroup.snapshotKey),
           let decoded = try? JSONDecoder().decode(WidgetSnapshot.self, from: data) {
            return decoded
        }
        return loadLegacyKeys(from: defaults)
    }

    static func save(_ snapshot: WidgetSnapshot) {
        guard let defaults = AppGroup.userDefaults else {
            print("App Group suite unavailable, skip widget snapshot")
            return
        }

        if let data = try? JSONEncoder().encode(snapshot) {
            defaults.set(data, forKey: AppGroup.snapshotKey)
        }

        if let weight = snapshot.latestWeightKg {
            defaults.set(weight, forKey: AppGroup.latestWeightKey)
        } else {
            defaults.removeObject(forKey: AppGroup.latestWeightKey)
        }

        if let date = snapshot.latestWeightDate {
            defaults.set(date.timeIntervalSince1970, forKey: AppGroup.latestWeightDateKey)
        } else {
            defaults.removeObject(forKey: AppGroup.latestWeightDateKey)
        }

        if let previous = snapshot.previousWeightKg {
            defaults.set(previous, forKey: AppGroup.previousWeightKey)
        } else {
            defaults.removeObject(forKey: AppGroup.previousWeightKey)
        }

        defaults.set(snapshot.todayCalories, forKey: AppGroup.todayCaloriesKey)
        defaults.set(snapshot.todayFoodCount, forKey: AppGroup.todayFoodCountKey)
        if let net = snapshot.todayNetCalories {
            defaults.set(net, forKey: AppGroup.todayNetCaloriesKey)
        } else {
            defaults.removeObject(forKey: AppGroup.todayNetCaloriesKey)
        }
        if let caption = snapshot.netCaption {
            defaults.set(caption, forKey: AppGroup.netCaptionKey)
        } else {
            defaults.removeObject(forKey: AppGroup.netCaptionKey)
        }
        defaults.set(snapshot.calorieDayStart.timeIntervalSince1970, forKey: AppGroup.calorieDayStartKey)
        defaults.set(snapshot.weightUnitRaw, forKey: AppGroup.weightUnitKey)
        defaults.synchronize()

        reloadTimelines()
    }

    static func reloadTimelines() {
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
        #endif
    }

    private static func loadLegacyKeys(from defaults: UserDefaults) -> WidgetSnapshot {
        let latest = defaults.object(forKey: AppGroup.latestWeightKey) as? Double
        let previous = defaults.object(forKey: AppGroup.previousWeightKey) as? Double
        let dateInterval = defaults.object(forKey: AppGroup.latestWeightDateKey) as? TimeInterval
        let calorieDayInterval = defaults.object(forKey: AppGroup.calorieDayStartKey) as? TimeInterval
        return WidgetSnapshot(
            latestWeightKg: latest,
            latestWeightDate: dateInterval.map(Date.init(timeIntervalSince1970:)),
            previousWeightKg: previous,
            todayCalories: defaults.double(forKey: AppGroup.todayCaloriesKey),
            todayFoodCount: defaults.integer(forKey: AppGroup.todayFoodCountKey),
            todayNetCalories: defaults.object(forKey: AppGroup.todayNetCaloriesKey) as? Double,
            netCaption: defaults.string(forKey: AppGroup.netCaptionKey),
            calorieDayStart: calorieDayInterval.map(Date.init(timeIntervalSince1970:)) ?? .distantPast,
            weightUnitRaw: defaults.string(forKey: AppGroup.weightUnitKey) ?? WeightUnit.kg.rawValue,
            updatedAt: Date()
        )
    }
}
