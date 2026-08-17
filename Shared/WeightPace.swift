//
//  WeightPace.swift
//  Shared
//
//  用窗口内首末日体重做线性粗算。不是医学预测。
//

import Foundation

nonisolated enum WeightPace {
    static let flatKg: Double = 0.05
    static let minSpanDaysForPace: Int = 7
    static let maxProjectionDays: Int = 730

    struct Sample: Equatable, Sendable {
        var day: Date
        var weightKg: Double
    }

    struct Window: Equatable, Sendable {
        var start: Sample
        var end: Sample
        var spanDays: Int
        var deltaKg: Double

        var kgPerDay: Double {
            deltaKg / Double(max(spanDays, 1))
        }
    }

    enum Trend: Equatable, Sendable {
        case notEnough
        case flat(Window)
        case down(Window)
        case up(Window)
    }

    enum Arrival: Equatable, Sendable {
        case needWeight
        case needTarget
        case needMoreData
        case reached
        case tooSlow(Window)
        case wrongWay(Window)
        case tooFar(Window)
        case estimated(days: Int, window: Window)
    }

    static func window(from samples: [Sample]) -> Window? {
        guard let first = samples.first, let last = samples.last, samples.count >= 2 else {
            return nil
        }
        let calendar = Calendar.current
        let startDay = calendar.startOfDay(for: first.day)
        let endDay = calendar.startOfDay(for: last.day)
        let days = calendar.dateComponents([.day], from: startDay, to: endDay).day ?? 0
        guard days >= 1 else { return nil }
        return Window(
            start: Sample(day: startDay, weightKg: first.weightKg),
            end: Sample(day: endDay, weightKg: last.weightKg),
            spanDays: days,
            deltaKg: last.weightKg - first.weightKg
        )
    }

    static func trend(from samples: [Sample]) -> Trend {
        guard let window = window(from: samples) else { return .notEnough }
        if abs(window.deltaKg) < flatKg { return .flat(window) }
        return window.deltaKg < 0 ? .down(window) : .up(window)
    }

    static func arrival(
        latestKg: Double?,
        targetKg: Double?,
        samples: [Sample]
    ) -> Arrival {
        guard latestKg != nil else { return .needWeight }
        guard let latestKg, let targetKg else { return .needTarget }
        if abs(latestKg - targetKg) < flatKg { return .reached }

        guard let window = window(from: samples), window.spanDays >= minSpanDaysForPace else {
            return .needMoreData
        }
        if abs(window.deltaKg) < flatKg { return .tooSlow(window) }

        let remaining = latestKg - targetKg
        let goingRight = remaining * window.kgPerDay < 0
        if !goingRight { return .wrongWay(window) }

        let days = Int((abs(remaining) / abs(window.kgPerDay)).rounded())
        if days > maxProjectionDays { return .tooFar(window) }
        return .estimated(days: max(days, 1), window: window)
    }

    static func formatDuration(days: Int) -> String {
        if days < 14 { return "大约 \(days) 天" }
        if days < 60 {
            let weeks = max(Int((Double(days) / 7).rounded()), 1)
            return "大约 \(weeks) 周"
        }
        let months = max(Int((Double(days) / 30).rounded()), 1)
        return "大约 \(months) 个月"
    }
}
