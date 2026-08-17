//
//  UserProfile.swift
//  bodycheck
//
//  本机资料，无账号。CloudKit 同步时可能出现多条，取 updatedAt 最新一条。
//

import Foundation
import SwiftData

enum UserSex: String, CaseIterable, Identifiable {
    case unspecified
    case female
    case male

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .unspecified: "未填写"
        case .female: "女"
        case .male: "男"
        }
    }
}

@Model
final class UserProfile {
    var id: UUID = UUID()
    var name: String = ""
    var age: Int?
    var sexRaw: String = UserSex.unspecified.rawValue
    /// 厘米。
    var heightCm: Double?
    /// 公斤。
    var targetWeightKg: Double?
    var createdAt: Date = Date()
    var updatedAt: Date = Date()

    init(
        name: String = "",
        age: Int? = nil,
        sex: UserSex = .unspecified,
        heightCm: Double? = nil,
        targetWeightKg: Double? = nil
    ) {
        self.id = UUID()
        self.name = name
        self.age = age
        self.sexRaw = sex.rawValue
        self.heightCm = heightCm
        self.targetWeightKg = targetWeightKg
        self.createdAt = Date()
        self.updatedAt = Date()
    }

    var sex: UserSex {
        UserSex(rawValue: sexRaw) ?? .unspecified
    }

    var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func current(from profiles: [UserProfile]) -> UserProfile? {
        profiles.max { $0.updatedAt < $1.updatedAt }
    }
}
