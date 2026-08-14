//
//  HealthKitWeightService.swift
//  bodycheck
//
//  Write BodyTrack weights into Apple Health, and import bodyMass by UUID.
//  Local SwiftData stays available if Health is denied.
//

import Foundation
import HealthKit
import SwiftData

@MainActor
final class HealthKitWeightService {
    static let shared = HealthKitWeightService()

    private let store = HKHealthStore()
    private var container: ModelContainer?
    private var backgroundContext: ModelContext?
    private var observerQuery: HKObserverQuery?

    var isHealthDataAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    var shareStatusText: String {
        guard isHealthDataAvailable else { return "此设备不可用" }
        switch store.authorizationStatus(for: bodyMassType) {
        case .notDetermined: return "尚未授权"
        case .sharingDenied: return "未允许写入"
        case .sharingAuthorized: return "已开启"
        @unknown default: return "未知"
        }
    }

    var isSharingAuthorized: Bool {
        store.authorizationStatus(for: bodyMassType) == .sharingAuthorized
    }

    private var bodyMassType: HKQuantityType {
        HKQuantityType(.bodyMass)
    }

    func requestAuthorization() async {
        guard isHealthDataAvailable else { return }
        do {
            try await HealthKitAccess.requestAuthorization(store: store)
        } catch {
            // Local records must remain usable.
        }
        if let container {
            await startObserving(container: container)
        }
    }

    /// Watch Health body-mass changes and import them. Never prompts.
    func startObserving(container: ModelContainer) async {
        guard isHealthDataAvailable else { return }
        self.container = container
        if backgroundContext == nil {
            let context = ModelContext(container)
            context.autosaveEnabled = false
            backgroundContext = context
        }

        do {
            try await store.enableBackgroundDelivery(for: bodyMassType, frequency: .immediate)
        } catch {
            // Denied or unavailable — observer still helps while the app is open.
        }

        guard observerQuery == nil else { return }

        let query = HKObserverQuery(sampleType: bodyMassType, predicate: nil) { [weak self] _, completion, _ in
            Task { @MainActor in
                await self?.handleObserverFire(completion: completion)
            }
        }
        observerQuery = query
        store.execute(query)
    }

    private func handleObserverFire(completion: @escaping HKObserverQueryCompletionHandler) async {
        defer { completion() }
        guard let context = backgroundContext else { return }
        _ = try? await importSamples(into: context, promptIfNeeded: false)
    }

    /// Write or replace the Health sample for a local row. Does not throw into UI.
    func syncEntry(_ entry: WeightEntry, promptIfNeeded: Bool = true) async {
        guard isHealthDataAvailable else { return }
        if promptIfNeeded {
            await requestAuthorization()
        }
        guard isSharingAuthorized else { return }

        if let oldUUID = entry.healthKitUUID {
            await deleteSample(uuid: oldUUID)
        }

        let quantity = HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: entry.weight)
        let sampleDate = Self.sampleDate(for: entry.date)
        let sample = HKQuantitySample(
            type: bodyMassType,
            quantity: quantity,
            start: sampleDate,
            end: sampleDate,
            metadata: [HKMetadataKeyWasUserEntered: true]
        )

        do {
            try await store.save(sample)
            entry.healthKitUUID = sample.uuid
            entry.updatedAt = Date()
        } catch {
            // Keep the SwiftData row even if Health rejects the write.
        }
    }

    func deleteSample(uuid: UUID) async {
        guard isHealthDataAvailable, isSharingAuthorized else { return }
        do {
            _ = try await store.deleteObjects(
                of: bodyMassType,
                predicate: HKQuery.predicateForObject(with: uuid)
            )
        } catch {
            // Deleting the local row already succeeded.
        }
    }

    /// Pull Health samples into SwiftData, then push local manuals that have no UUID.
    @discardableResult
    func reconcile(into context: ModelContext, days: Int = 90, promptIfNeeded: Bool = false) async throws -> Int {
        let imported = try await importSamples(into: context, days: days, promptIfNeeded: promptIfNeeded)
        await pushUnsyncedManualEntries(in: context)
        return imported
    }

    /// Upsert `bodyMass` samples by HealthKit UUID. Existing rows keep their `source`.
    @discardableResult
    func importSamples(into context: ModelContext, days: Int = 90, promptIfNeeded: Bool = false) async throws -> Int {
        guard isHealthDataAvailable else {
            if promptIfNeeded { throw HealthKitWeightError.unavailable }
            return 0
        }
        if promptIfNeeded {
            await requestAuthorization()
        }

        let samples: [HKQuantitySample]
        do {
            samples = try await fetchBodyMassSamples(days: days)
        } catch {
            if promptIfNeeded { throw error }
            return 0
        }

        let descriptor = FetchDescriptor<WeightEntry>()
        let existing = (try? context.fetch(descriptor)) ?? []
        var existingByUUID: [UUID: WeightEntry] = [:]
        for entry in existing {
            if let uuid = entry.healthKitUUID {
                existingByUUID[uuid] = entry
            }
        }

        var upserted = 0
        let kgUnit = HKUnit.gramUnit(with: .kilo)
        for sample in samples {
            let kg = sample.quantity.doubleValue(for: kgUnit)
            guard kg > 0, kg < 500 else { continue }
            let dayOnly = sample.startDate.startOfDay

            if let entry = existingByUUID[sample.uuid] {
                let weightChanged = abs(entry.weight - kg) > 0.000_1
                let dayChanged = !entry.date.isSameDay(as: dayOnly)
                if weightChanged || dayChanged {
                    entry.weight = kg
                    entry.date = dayOnly
                    entry.updatedAt = Date()
                    upserted += 1
                }
            } else {
                let entry = WeightEntry(
                    weight: kg,
                    date: dayOnly,
                    source: .healthkit,
                    healthKitUUID: sample.uuid
                )
                context.insert(entry)
                existingByUUID[sample.uuid] = entry
                upserted += 1
            }
        }

        if upserted > 0 {
            try context.save()
        }
        return upserted
    }

    private func fetchBodyMassSamples(days: Int) async throws -> [HKQuantitySample] {
        let end = Date()
        let start = Calendar.current.date(byAdding: .day, value: -days, to: end) ?? end.addingTimeInterval(-90 * 86_400)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: bodyMassType,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [sort]
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                continuation.resume(returning: (samples as? [HKQuantitySample]) ?? [])
            }
            store.execute(query)
        }
    }

    /// Push older manual rows that never got a Health UUID.
    /// Only runs when write access is already granted — never prompts.
    func pushUnsyncedManualEntries(in context: ModelContext) async {
        guard isHealthDataAvailable, isSharingAuthorized else { return }

        let descriptor = FetchDescriptor<WeightEntry>()
        guard let entries = try? context.fetch(descriptor) else { return }

        var didChange = false
        for entry in entries where entry.healthKitUUID == nil && entry.weightSource == .manual {
            await syncEntry(entry, promptIfNeeded: false)
            if entry.healthKitUUID != nil {
                didChange = true
            }
        }
        if didChange {
            try? context.save()
        }
    }

    /// Today uses the current clock so Health does not show 00:00; other days stay at start-of-day.
    private static func sampleDate(for day: Date) -> Date {
        Calendar.current.isDateInToday(day) ? Date() : day.startOfDay
    }
}

enum HealthKitWeightError: LocalizedError {
    case unavailable

    var errorDescription: String? {
        switch self {
        case .unavailable:
            return "此设备不支持 Apple 健康数据。"
        }
    }
}
