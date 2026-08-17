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
    /// 小于该克数只出文字，不画碎渣图。
    static let minVisibleGrams: Int = 20

    static var kcalPerGram: Double { kcalPer100Grams / gramsPerBlock }

    struct Presentation: Equatable, Sendable {
        var grams: Int
        var isSurplus: Bool
        var caption: String
        var widgetCaption: String
        var fullBlocks: Int
        var partialFraction: Double?
        var extraBlocksLabel: String?
        var showsBlocks: Bool

        var verb: String { isSurplus ? "多出来" : "少攒下" }

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
            if remaining > 0 {
                let more = max(1, Int((Double(remaining) / Double(block)).rounded()))
                return (fractions, "还有 \(more) 块")
            }
            return (fractions, extraBlocksLabel)
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
        let caption = surplus
            ? "约等于 \(grams) 克肥肉"
            : "约等于少攒下 \(grams) 克肥肉"
        let widgetCaption = "约 \(grams) 克肥肉"

        var fullBlocks = 0
        var partialFraction: Double?
        var extraBlocksLabel: String?
        let showsBlocks = grams >= minVisibleGrams
        if showsBlocks {
            let capGrams = maxVisibleBlocks * Int(gramsPerBlock)
            if grams > capGrams {
                fullBlocks = maxVisibleBlocks
                let totalBlocks = Int((Double(grams) / gramsPerBlock).rounded())
                if totalBlocks > maxVisibleBlocks {
                    extraBlocksLabel = "共约 \(totalBlocks) 块"
                }
            } else {
                fullBlocks = grams / Int(gramsPerBlock)
                let remainder = grams % Int(gramsPerBlock)
                if remainder > 0 {
                    partialFraction = Double(remainder) / gramsPerBlock
                }
            }
        }

        return Presentation(
            grams: grams,
            isSurplus: surplus,
            caption: caption,
            widgetCaption: widgetCaption,
            fullBlocks: fullBlocks,
            partialFraction: partialFraction,
            extraBlocksLabel: extraBlocksLabel,
            showsBlocks: showsBlocks
        )
    }

    static func widgetCaption(netKcal: Double) -> String? {
        presentation(netKcal: netKcal)?.widgetCaption
    }
}
