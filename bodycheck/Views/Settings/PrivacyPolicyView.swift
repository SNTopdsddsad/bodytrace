//
//  PrivacyPolicyView.swift
//  bodycheck
//

import SwiftUI

struct PrivacyPolicyView: View {
    private var attributedPolicy: AttributedString {
        let markdown = AppLegal.privacyPolicyMarkdown()
        return (try? AttributedString(
            markdown: markdown,
            options: AttributedString.MarkdownParsingOptions(interpretedSyntax: .full)
        )) ?? AttributedString(markdown)
    }

    var body: some View {
        ScrollView {
            Text(attributedPolicy)
                .font(AppFont.prose)
                .foregroundStyle(.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(AppTheme.contentInset)
        }
        .pageBackground()
        .navigationTitle("隐私政策")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let mail = AppLegal.supportMailURL {
                ToolbarItem(placement: .topBarTrailing) {
                    Link("联系", destination: mail)
                        .font(AppFont.inlineAction)
                }
            }
        }
    }
}

#Preview {
    NavigationStack {
        PrivacyPolicyView()
    }
}
