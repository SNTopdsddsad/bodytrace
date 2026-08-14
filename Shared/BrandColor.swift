//
//  BrandColor.swift
//  Shared by App + Widget
//

import SwiftUI
import UIKit

enum BrandColor {
    /// Brand teal — primary actions & chart. #267A78 / #4FA7A3
    static let teal = Color(light: Color(red: 0.149, green: 0.478, blue: 0.471),
                            dark: Color(red: 0.310, green: 0.655, blue: 0.639))
    /// Intake amber. #B56A22 / #D99550
    static let amber = Color(light: Color(red: 0.710, green: 0.416, blue: 0.133),
                             dark: Color(red: 0.851, green: 0.584, blue: 0.314))
    /// Activity green. #587448 / #7F9C6B
    static let green = Color(light: Color(red: 0.345, green: 0.455, blue: 0.282),
                             dark: Color(red: 0.498, green: 0.612, blue: 0.420))
}

extension Color {
    init(light: Color, dark: Color) {
        self.init(uiColor: UIColor { trait in
            trait.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
    }
}
