//
//  WidgetSnapshotPublisher.swift
//  bodycheck
//
//  Writes a glanceable App Group summary after SwiftData changes.
//  iOS only — Mac has no widget in this phase.
//

import SwiftData
import SwiftUI

#if os(iOS)
enum WidgetSnapshotPublisher {
    static func publish(
        weights: [WeightEntry],
        foods: [FoodEntry],
        unitRaw: String,
        todayRestingKcal: Double?,
        todayActiveKcal: Double?
    ) {
        let ordered = weights.sorted(by: WeightEntry.chronologicalDescending)
        let latest = ordered.first
        let previous = ordered.count > 1 ? ordered[1] : nil
        let day = Calendar.current.dayInterval(for: Date())
        let todayFoods = foods.filter { $0.date >= day.start && $0.date < day.end }

        let intake: Double? = todayFoods.isEmpty ? nil : todayFoods.reduce(0) { $0 + $1.calories }

        let net = TodayEnergyMath.net(
            intake: intake,
            activeKcal: todayActiveKcal,
            restingKcal: todayRestingKcal
        )
        let caption: String? = net == nil
            ? nil
            : TodayEnergyMath.caption(
                activeKcal: todayActiveKcal,
                noteMissingResting: todayRestingKcal == nil
            )

        let snapshot = WidgetSnapshot(
            latestWeightKg: latest?.weight,
            latestWeightDate: latest?.date,
            previousWeightKg: previous?.weight,
            todayCalories: intake ?? 0,
            todayFoodCount: todayFoods.count,
            todayNetCalories: net,
            netCaption: caption,
            calorieDayStart: day.start,
            weightUnitRaw: unitRaw,
            updatedAt: Date()
        )
        WidgetSnapshotStore.save(snapshot)
    }
}

/// Observes the live store and keeps the widget summary current.
struct WidgetSnapshotSyncModifier: ViewModifier {
    @Environment(\.scenePhase) private var scenePhase
    @Query(sort: [
        SortDescriptor(\WeightEntry.date, order: .reverse),
        SortDescriptor(\WeightEntry.createdAt, order: .reverse)
    ]) private var weights: [WeightEntry]
    @Query(sort: \FoodEntry.date, order: .reverse) private var foods: [FoodEntry]
    @AppStorage("weightUnit") private var weightUnitRaw: String = WeightUnit.kg.rawValue

    private var publishToken: String {
        let weightPart = weights.map {
            "\($0.id.uuidString):\($0.weight):\($0.date.timeIntervalSince1970):\($0.updatedAt.timeIntervalSince1970)"
        }.joined(separator: "|")
        let foodPart = foods.map {
            "\($0.id.uuidString):\($0.calories):\($0.date.timeIntervalSince1970):\($0.updatedAt.timeIntervalSince1970)"
        }.joined(separator: "|")
        return "\(weightPart)#\(foodPart)#\(weightUnitRaw)"
    }

    func body(content: Content) -> some View {
        content
            .task(id: publishToken) {
                await publish()
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active {
                    Task { await publish() }
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: .NSCalendarDayChanged)) { _ in
                Task { await publish() }
            }
    }

    private func publish() async {
        let totals = await HealthKitAccess.todayEnergyTotals()
        WidgetSnapshotPublisher.publish(
            weights: weights,
            foods: foods,
            unitRaw: weightUnitRaw,
            todayRestingKcal: totals.resting,
            todayActiveKcal: totals.active
        )
    }
}

extension View {
    func syncsWidgetSnapshot() -> some View {
        modifier(WidgetSnapshotSyncModifier())
    }
}
#endif
