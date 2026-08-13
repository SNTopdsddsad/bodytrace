//
//  DeepLink.swift
//  Shared
//

import Foundation

nonisolated enum DeepLink: Equatable, Sendable {
    static let scheme = "bodytrack"

    case logWeight
    case today

    var url: URL {
        switch self {
        case .logWeight:
            URL(string: "bodytrack://log-weight")!
        case .today:
            URL(string: "bodytrack://today")!
        }
    }

    static let logWeightURL = DeepLink.logWeight.url
    static let todayURL = DeepLink.today.url

    static func route(from url: URL) -> DeepLink? {
        guard url.scheme == scheme else { return nil }
        switch url.host {
        case "log-weight":
            return .logWeight
        case "today":
            return .today
        default:
            return nil
        }
    }
}
