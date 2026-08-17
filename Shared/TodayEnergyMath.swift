//
//  TodayEnergyMath.swift
//  Shared
//
//  净热量 = 摄入 − 活动能量 − 静息能量。
//  活动能量已含锻炼与日常活动，不再另计运动消耗。
//

import Foundation

/// 概览热量卡：今日净值，或近 `totalDayCount` 天合计。
nonisolated enum EnergyScope: String, CaseIterable, Identifiable {
    case today
    case total

    var id: String { rawValue }

    var title: String {
        switch self {
        case .today: "今日热量"
        case .total: "累计热量"
        }
    }

    /// 总计回看的本地日历日数（含今天）。
    static let totalDayCount = 30
}

nonisolated enum TodayEnergyMath {
    static func net(
        intake: Double?,
        activeKcal: Double?,
        restingKcal: Double?
    ) -> Double? {
        guard intake != nil || activeKcal != nil || restingKcal != nil else { return nil }
        return (intake ?? 0) - (activeKcal ?? 0) - (restingKcal ?? 0)
    }

    static func caption(
        activeKcal: Double?,
        noteMissingResting: Bool
    ) -> String {
        var parts = ["摄入 − 活动能量 − 静息能量"]
        if activeKcal == nil {
            parts.append("未计入活动能量")
        }
        if noteMissingResting {
            parts.append("未计入静息")
        }
        return parts.joined(separator: " · ")
    }
}
