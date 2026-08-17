//
//  HealthKitExerciseService.swift
//  bodycheck
//
//  iOS only: read workouts from Apple Health and upsert into SwiftData.
//

import Foundation
import HealthKit
import SwiftData

@MainActor
final class HealthKitExerciseService {
    static let shared = HealthKitExerciseService()

    private let store = HKHealthStore()

    var isHealthDataAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    private var workoutType: HKSampleType {
        HKObjectType.workoutType()
    }

    func requestAuthorization() async throws {
        guard isHealthDataAvailable else {
            throw HealthKitExerciseError.unavailable
        }
        try await HealthKitAccess.requestAuthorization(store: store)
    }

    /// Import workouts from the last `days` days (default 90).
    @discardableResult
    func syncWorkouts(into context: ModelContext, days: Int = 90, userInitiated: Bool = false) async throws -> Int {
        if userInitiated {
            HealthAutoImport.resume()
        } else if HealthAutoImport.isPaused {
            return 0
        }

        guard isHealthDataAvailable else {
            throw HealthKitExerciseError.unavailable
        }

        let end = Date()
        let start = Calendar.current.date(byAdding: .day, value: -days, to: end) ?? end.addingTimeInterval(-90 * 86_400)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)

        let workouts: [HKWorkout] = try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: workoutType,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [sort]
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let list = (samples as? [HKWorkout]) ?? []
                continuation.resume(returning: list)
            }
            store.execute(query)
        }

        var existingByUUID: [UUID: ExerciseEntry] = [:]
        let descriptor = FetchDescriptor<ExerciseEntry>()
        if let all = try? context.fetch(descriptor) {
            for entry in all {
                if let uuid = entry.healthKitUUID {
                    existingByUUID[uuid] = entry
                }
            }
        }

        var upserted = 0
        for workout in workouts {
            let uuid = workout.uuid
            let minutes = max(1, Int((workout.duration / 60.0).rounded()))
            let kcal = workout.totalEnergyBurned?.doubleValue(for: .kilocalorie())
            let name = Self.displayName(for: workout)
            let date = workout.endDate

            if let entry = existingByUUID[uuid] {
                entry.name = name
                entry.durationMinutes = minutes
                entry.caloriesBurned = kcal
                entry.date = date
                entry.source = ExerciseSource.healthkit.rawValue
                entry.updatedAt = Date()
            } else {
                let entry = ExerciseEntry(
                    name: name,
                    durationMinutes: minutes,
                    caloriesBurned: kcal,
                    date: date,
                    note: nil,
                    source: .healthkit,
                    healthKitUUID: uuid
                )
                context.insert(entry)
                existingByUUID[uuid] = entry
            }
            upserted += 1
        }

        try context.save()
        return upserted
    }

    private static func displayName(for workout: HKWorkout) -> String {
        // Prefer activity type localization; fall back to generic.
        let type = workout.workoutActivityType
        if #available(iOS 16.0, *) {
            // HKWorkoutActivityType has no built-in localized name API on all OS versions;
            // map common types explicitly.
        }
        return activityName(type)
    }

    private static func activityName(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .running: return "跑步"
        case .walking: return "步行"
        case .cycling: return "骑行"
        case .swimming: return "游泳"
        case .hiking: return "徒步"
        case .yoga: return "瑜伽"
        case .functionalStrengthTraining, .traditionalStrengthTraining: return "力量训练"
        case .highIntensityIntervalTraining: return "高强度间歇"
        case .elliptical: return "椭圆机"
        case .rowing: return "划船"
        case .dance: return "舞蹈"
        case .cooldown: return "放松整理"
        case .coreTraining: return "核心训练"
        case .flexibility: return "柔韧训练"
        case .mixedCardio: return "有氧运动"
        case .stairClimbing: return "爬楼"
        case .other: return "其他运动"
        default: return "运动"
        }
    }
}

enum HealthKitExerciseError: LocalizedError {
    case unavailable
    case notDetermined

    var errorDescription: String? {
        switch self {
        case .unavailable:
            return "此设备不支持 Apple 健康数据。"
        case .notDetermined:
            return "尚未获得健康数据权限。"
        }
    }
}
