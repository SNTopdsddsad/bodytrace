//
//  FatMeatEquivalent.swift
//  Shared
//
//  热量差用肥肉块示意：100 克肥肉 = 800 千卡。只做约数，不是体脂变化。
//

import Foundation

nonisolated enum FatMeatEquivalent {
    static let kcalPer100Grams: Double = 800
    static let gramsPerBlock: Double = 100
    static let maxVisibleBlocks: Int = 5

    static var kcalPerGram: Double { kcalPer100Grams / gramsPerBlock }

    struct Presentation: Equatable, Sendable {
        var grams: Int
        var isSurplus: Bool
        var caption: String
        var widgetCaption: String

        var verb: String { isSurplus ? "多了" : "少了" }

        /// 整块数（向下取整）。150 克 → 1，不是 2。
        var wholeBlocks: Int {
            grams / Int(FatMeatEquivalent.gramsPerBlock)
        }

        /// 每项 0...1，代表一块 100 克里画多少。超出 `maxVisible` 的进 overflow。
        func unitFractions(maxVisible: Int) -> (fractions: [Double], overflowLabel: String?) {
            let block = Int(FatMeatEquivalent.gramsPerBlock)
            var remaining = grams
            var fractions: [Double] = []
            while remaining > 0 && fractions.count < maxVisible {
                if remaining >= block {
                    fractions.append(1)
                    remaining -= block
                } else {
                    fractions.append(Double(remaining) / Double(block))
                    remaining = 0
                }
            }
            if remaining >= block {
                return (fractions, "还有 \(remaining / block) 块")
            }
            if remaining > 0 {
                return (fractions, "还有 \(remaining) 克")
            }
            return (fractions, nil)
        }
    }

    static func grams(fromNetKcal net: Double) -> Int? {
        guard abs(net) >= 0.5 else { return nil }
        let grams = Int((abs(net) / kcalPerGram).rounded())
        return grams >= 1 ? grams : nil
    }

    static func presentation(netKcal: Double) -> Presentation? {
        guard let grams = grams(fromNetKcal: netKcal) else { return nil }
        let surplus = netKcal > 0
        return Presentation(
            grams: grams,
            isSurplus: surplus,
            caption: surplus
                ? "约等于多了 \(grams) 克肥肉"
                : "约等于少了 \(grams) 克肥肉",
            widgetCaption: "约 \(grams) 克肥肉"
        )
    }

    static func widgetCaption(netKcal: Double) -> String? {
        presentation(netKcal: netKcal)?.widgetCaption
    }
}
