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
        exercises: [ExerciseEntry],
        unitRaw: String,
        todayRestingKcal: Double?
    ) {
        let ordered = weights.sorted(by: WeightEntry.chronologicalDescending)
        let latest = ordered.first
        let previous = ordered.count > 1 ? ordered[1] : nil
        let day = Calendar.current.dayInterval(for: Date())
        let todayFoods = foods.filter { $0.date >= day.start && $0.date < day.end }
        let todayExercises = exercises.filter { $0.date >= day.start && $0.date < day.end }

        let intake: Double? = todayFoods.isEmpty ? nil : todayFoods.reduce(0) { $0 + $1.calories }
        let burns = todayExercises.compactMap(\.caloriesBurned)
        let exerciseBurn: Double? = burns.isEmpty ? nil : burns.reduce(0, +)
        let exerciseMinutes: Int? = todayExercises.isEmpty
            ? nil
            : todayExercises.reduce(0) { $0 + $1.durationMinutes }

        let hasIntake = intake != nil
        let hasExerciseBurn = exerciseBurn != nil
        let hasResting = todayRestingKcal != nil
        let net: Double? = (hasIntake || hasExerciseBurn || hasResting)
            ? (intake ?? 0) - (exerciseBurn ?? 0) - (todayRestingKcal ?? 0)
            : nil

        var captionParts = ["摄入 − 运动消耗 − 静息能量"]
        if exerciseBurn == nil, exerciseMinutes != nil {
            captionParts.append("未计入无消耗的运动")
        }
        if todayRestingKcal == nil {
            captionParts.append("未计入静息")
        }
        let caption: String? = net == nil ? nil : captionParts.joined(separator: " · ")

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
    @Query(sort: \ExerciseEntry.date, order: .reverse) private var exercises: [ExerciseEntry]
    @AppStorage("weightUnit") private var weightUnitRaw: String = WeightUnit.kg.rawValue

    private var publishToken: String {
        let weightPart = weights.map {
            "\($0.id.uuidString):\($0.weight):\($0.date.timeIntervalSince1970):\($0.updatedAt.timeIntervalSince1970)"
        }.joined(separator: "|")
        let foodPart = foods.map {
            "\($0.id.uuidString):\($0.calories):\($0.date.timeIntervalSince1970):\($0.updatedAt.timeIntervalSince1970)"
        }.joined(separator: "|")
        let exercisePart = exercises.map {
            "\($0.id.uuidString):\($0.caloriesBurned ?? -1):\($0.date.timeIntervalSince1970):\($0.updatedAt.timeIntervalSince1970)"
        }.joined(separator: "|")
        return "\(weightPart)#\(foodPart)#\(exercisePart)#\(weightUnitRaw)"
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
        let resting = await HealthKitAccess.todayRestingEnergyKcal()
        WidgetSnapshotPublisher.publish(
            weights: weights,
            foods: foods,
            exercises: exercises,
            unitRaw: weightUnitRaw,
            todayRestingKcal: resting
        )
    }
}

extension View {
    func syncsWidgetSnapshot() -> some View {
        modifier(WidgetSnapshotSyncModifier())
    }
}
#endif
