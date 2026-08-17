//
//  HealthKitAccess.swift
//  bodycheck
//
//  iOS only: shared HealthKit types and authorization. Request only types we use.
//

import Foundation
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

    static var activeEnergyType: HKQuantityType {
        HKQuantityType(.activeEnergyBurned)
    }

    static var shareTypes: Set<HKSampleType> {
        [bodyMassType]
    }

    static var readTypes: Set<HKObjectType> {
        [bodyMassType, workoutType, basalEnergyType, activeEnergyType]
    }

    static func requestAuthorization(store: HKHealthStore) async throws {
        guard isAvailable else { return }
        try await store.requestAuthorization(toShare: shareTypes, read: readTypes)
    }

    static func todayRestingEnergyKcal() async -> Double? {
        await energyTotals(on: Date()).resting
    }

    static func todayActiveEnergyKcal() async -> Double? {
        await energyTotals(on: Date()).active
    }

    static func todayEnergyTotals() async -> (active: Double?, resting: Double?) {
        await energyTotals(on: Date())
    }

    static func energyTotals(on date: Date) async -> (active: Double?, resting: Double?) {
        let day = Calendar.current.dayInterval(for: date)
        return await energyTotals(from: day.start, to: day.end)
    }

    static func energyTotals(from start: Date, to end: Date) async -> (active: Double?, resting: Double?) {
        async let active = cumulativeKcal(type: activeEnergyType, from: start, to: end)
        async let resting = cumulativeKcal(type: basalEnergyType, from: start, to: end)
        return await (active, resting)
    }

    /// Cumulative energy in `[start, end)`. Nil if unavailable or denied.
    private static func cumulativeKcal(
        type: HKQuantityType,
        from start: Date,
        to end: Date,
        store: HKHealthStore = HKHealthStore()
    ) async -> Double? {
        guard isAvailable else { return nil }

        let predicate = HKQuery.predicateForSamples(
            withStart: start,
            end: end,
            options: .strictStartDate
        )

        do {
            return try await withCheckedThrowingContinuation { continuation in
                let query = HKStatisticsQuery(
                    quantityType: type,
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
