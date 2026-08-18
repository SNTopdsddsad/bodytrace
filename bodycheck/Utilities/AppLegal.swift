//
//  AppLegal.swift
//  bodycheck
//
//  Public listing and in-app legal copy. Keep in sync with docs/privacy-policy.html.
//

import Foundation

enum AppLegal {
    static let developerName = "丹青"
    static let supportEmail = "xuwudi404@outlook.com"
    static let privacyPolicyFileName = "PrivacyPolicy"

    static var supportMailURL: URL? {
        URL(string: "mailto:\(supportEmail)")
    }

    static func privacyPolicyMarkdown() -> String {
        guard let url = Bundle.main.url(forResource: privacyPolicyFileName, withExtension: "md"),
              let text = try? String(contentsOf: url, encoding: .utf8)
        else {
            return "暂时无法加载隐私政策正文。请发送邮件至 \(supportEmail) 索取。"
        }
        return text
    }
}
