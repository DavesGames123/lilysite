// Write a soft foreground mask (8-bit grayscale PNG) for each input image.
// It uses the macOS Vision subject-lift model (VNGenerateForegroundInstanceMaskRequest).
//
// Usage: swift scripts/matte/lift_mask.swift OUT_DIR IMAGE...
import Foundation
import Vision
import CoreImage
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: lift_mask.swift OUT_DIR IMAGE...\n".data(using: .utf8)!)
    exit(2)
}
let outDir = URL(fileURLWithPath: args[1], isDirectory: true)
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
let context = CIContext()
var failures = 0

for path in args.dropFirst(2) {
    let url = URL(fileURLWithPath: path)
    guard let ci = CIImage(contentsOf: url) else { print("FAIL read \(path)"); failures += 1; continue }
    let handler = VNImageRequestHandler(ciImage: ci)
    let request = VNGenerateForegroundInstanceMaskRequest()
    do {
        try handler.perform([request])
        guard let result = request.results?.first else { print("FAIL no subject \(path)"); failures += 1; continue }
        let buffer = try result.generateScaledMaskForImage(forInstances: result.allInstances, from: handler)
        let mask = CIImage(cvPixelBuffer: buffer)
        let name = url.deletingPathExtension().lastPathComponent + ".mask.png"
        let dest = outDir.appendingPathComponent(name)
        guard let cg = context.createCGImage(mask, from: mask.extent, format: .L8, colorSpace: CGColorSpaceCreateDeviceGray()) else {
            print("FAIL render \(path)"); failures += 1; continue
        }
        let out = CGImageDestinationCreateWithURL(dest as CFURL, UTType.png.identifier as CFString, 1, nil)!
        CGImageDestinationAddImage(out, cg, nil)
        CGImageDestinationFinalize(out)
        print("ok \(name) \(cg.width)x\(cg.height) instances=\(result.allInstances.count)")
    } catch {
        print("FAIL \(path): \(error)"); failures += 1
    }
}
exit(failures == 0 ? 0 : 1)
