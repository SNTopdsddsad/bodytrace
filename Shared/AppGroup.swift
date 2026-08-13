//
//  AppGroup.swift
//  Shared
//
//  App ↔ Widget suite. Never force-unwrap the defaults handle.
//

import Foundation

nonisolated enum AppGroup {
    static let suiteName = "group.yinke.bodycheck"

    static let snapshotKey = "widgetSnapshot"
    static let latestWeightKey = "latestWeight"
    static let latestWeightDateKey = "latestWeightDate"
    static let previousWeightKey = "previousWeight"
    static let todayCaloriesKey = "todayCalories"
    static let todayFoodCountKey = "todayFoodCount"
    static let todayNetCaloriesKey = "todayNetCalories"
    static let netCaptionKey = "netCaption"
    static let calorieDayStartKey = "calorieDayStart"
    static let weightUnitKey = "weightUnit"

    static var userDefaults: UserDefaults? {
        UserDefaults(suiteName: suiteName)
    }
}
