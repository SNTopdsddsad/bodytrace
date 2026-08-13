//
//  FoodPhoto.swift
//  bodycheck
//
//  Compress food photos before SwiftData + CloudKit storage.
//

import SwiftUI

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

enum FoodPhotoCodec {
    static let maxPixel: CGFloat = 1600
    static let jpegQuality: CGFloat = 0.72

    static func image(from data: Data) -> Image? {
        #if os(iOS)
        guard let ui = UIImage(data: data) else { return nil }
        return Image(uiImage: ui)
        #elseif os(macOS)
        guard let ns = NSImage(data: data) else { return nil }
        return Image(nsImage: ns)
        #endif
    }

    #if os(iOS)
    static func compressedJPEG(from image: UIImage) -> Data? {
        let resized = resize(image)
        return resized.jpegData(compressionQuality: jpegQuality)
    }

    static func compressedJPEG(from data: Data) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        return compressedJPEG(from: image)
    }

    private static func resize(_ image: UIImage) -> UIImage {
        let size = image.size
        let longest = max(size.width, size.height)
        guard longest > maxPixel, longest > 0 else { return image }
        let scale = maxPixel / longest
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: newSize, format: format)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }
    #endif
}

struct FoodPhotoThumb: View {
    let data: Data?
    var size: CGFloat = AppTheme.thumbSize

    var body: some View {
        if let data, let image = FoodPhotoCodec.image(from: data) {
            image
                .resizable()
                .scaledToFill()
                .frame(width: size, height: size)
                .clipShape(RoundedRectangle(cornerRadius: AppTheme.thumbRadius, style: .continuous))
        }
    }
}
