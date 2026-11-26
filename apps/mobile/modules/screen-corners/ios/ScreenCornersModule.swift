import ExpoModulesCore
import UIKit

private func keyWindow() -> UIWindow? {
  let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
  let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first

  return scene?.windows.first { $0.isKeyWindow } ?? scene?.windows.first
}

private func measureScreenCornerRadius() -> Double? {
  guard #available(iOS 26.0, *), let window = keyWindow() else { return nil }

  let probe = UIView(frame: window.bounds)
  probe.alpha = 0
  probe.isUserInteractionEnabled = false
  probe.cornerConfiguration = .corners(radius: .containerConcentric())

  window.addSubview(probe)
  probe.layoutIfNeeded()
  let radius = Double(probe.effectiveRadius(corner: .bottomLeft))
  probe.removeFromSuperview()

  return radius > 0 ? radius : nil
}

public class ScreenCornersModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ScreenCorners")

    AsyncFunction("getScreenCornerRadius") { () -> Double? in
      measureScreenCornerRadius()
    }.runOnQueue(.main)
  }
}
