#!/usr/bin/env swift
// Draws the app icon, so the artwork is generated here rather than downloaded from anywhere: the same green mark
// as the web app's apps/web/public/icon.svg — a deep-green square, a white pin, a green cross cut out of it.
//
//   swift apps/ios/Scripts/make-icon.swift apps/ios/HelpApp/Assets.xcassets/AppIcon.appiconset/icon-1024.png
//
// iOS 17 and later need one 1024×1024 image with no transparency, which is what this writes.
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let out = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "icon-1024.png")
let side = 1024.0, k = side / 512                      // the SVG is drawn on a 512 grid

let space = CGColorSpace(name: CGColorSpace.sRGB)!
guard let ctx = CGContext(data: nil, width: Int(side), height: Int(side), bitsPerComponent: 8, bytesPerRow: 0,
                          space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { exit(1) }
// The canvas is flipped so these coordinates read the same way as the SVG's.
ctx.translateBy(x: 0, y: side)
ctx.scaleBy(x: k, y: -k)

let green = CGColor(srgbRed: 0x0B / 255, green: 0x3D / 255, blue: 0x2E / 255, alpha: 1)
let white = CGColor(gray: 1, alpha: 1)

ctx.setFillColor(green)
ctx.fill(CGRect(x: 0, y: 0, width: 512, height: 512))

// The pin: a circle with a point under it.
ctx.setFillColor(white)
ctx.addEllipse(in: CGRect(x: 148, y: 116, width: 216, height: 216))
ctx.fillPath()
ctx.move(to: CGPoint(x: 256, y: 396))
ctx.addLine(to: CGPoint(x: 168, y: 286))
ctx.addLine(to: CGPoint(x: 344, y: 286))
ctx.closePath()
ctx.fillPath()

// The cross, cut out of the pin: two bars, in the background colour.
ctx.setFillColor(green)
ctx.fill(CGRect(x: 238, y: 180, width: 36, height: 112))
ctx.fill(CGRect(x: 200, y: 218, width: 112, height: 36))

guard let image = ctx.makeImage(),
      let dest = CGImageDestinationCreateWithURL(out as CFURL, UTType.png.identifier as CFString, 1, nil) else { exit(1) }
CGImageDestinationAddImage(dest, image, nil)
guard CGImageDestinationFinalize(dest) else { exit(1) }
print("wrote \(out.path)")
