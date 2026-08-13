//
//  LogWeightIntent.swift
//  BodyTrackWidget
//

import AppIntents
import Foundation

struct LogWeightIntent: AppIntent {
    static var title: LocalizedStringResource = "记录体重"
    static var description: IntentDescription = "打开 BodyTrack 记录体重"
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult & OpensIntent {
        .result(opensIntent: OpenURLIntent(DeepLink.logWeightURL))
    }
}
