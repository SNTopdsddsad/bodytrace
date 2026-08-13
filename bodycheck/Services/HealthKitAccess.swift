//
//  HealthKitAccess.swift
//  bodycheck
//
//  iOS only: shared HealthKit types and authorization. Request only types we use.
//

import Foundation

#if os(iOS)
import HealthKit

enum HealthKitAccess {
    static var isAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    static var bodyMassType: HKQuantityType {
        HKQuantityType(.bodyMass)
    }

    static var workoutType: HKSampleType {
        HKObjectType.workoutType()
    }

    static var basalEnergyType: HKQuantityType {
        HKQuantityType(.basalEnergyBurned)
    }

    static var shareTypes: Set<HKSampleType> {
        [bodyMassType]
    }

    static var readTypes: Set<HKObjectType> {
        [bodyMassType, workoutType, basalEnergyType]
    }

    static func requestAuthorization(store: HKHealthStore) async throws {
        guard isAvailable else { return }
        try await store.requestAuthorization(toShare: shareTypes, read: readTypes)
    }

    static func todayRestingEnergyKcal() async -> Double? {
        await todayRestingEnergyKcal(store: HKHealthStore())
    }

    /// Today's cumulative resting energy from Apple Health. Nil if unavailable or denied.
    static func todayRestingEnergyKcal(store: HKHealthStore) async -> Double? {
        guard isAvailable else { return nil }

        let day = Calendar.current.dayInterval(for: Date())
        let predicate = HKQuery.predicateForSamples(
            withStart: day.start,
            end: day.end,
            options: .strictStartDate
        )

        do {
            return try await withCheckedThrowingContinuation { continuation in
                let query = HKStatisticsQuery(
                    quantityType: basalEnergyType,
                    quantitySamplePredicate: predicate,
                    options: .cumulativeSum
                ) { _, stats, error in
                    if let error {
                        continuation.resume(throwing: error)
                        return
                    }
                    let kcal = stats?.sumQuantity()?.doubleValue(for: .kilocalorie())
                    continuation.resume(returning: kcal)
                }
                store.execute(query)
            }
        } catch {
            return nil
        }
    }
}
#endif
