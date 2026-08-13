//
//  HealthKitWeightService.swift
//  bodycheck
//
//  iOS only: write BodyTrack weight records into Apple Health.
//  Mac never imports this type. Local SwiftData stays available if Health is denied.
//

import Foundation
import SwiftData

#if os(iOS)
import HealthKit

@MainActor
final class HealthKitWeightService {
    static let shared = HealthKitWeightService()

    private let store = HKHealthStore()

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
            try await store.requestAuthorization(toShare: [bodyMassType], read: [bodyMassType])
        } catch {
            // Local records must remain usable.
        }
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

    /// Push Mac-created / older manual rows that never got a Health UUID.
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
#endif
