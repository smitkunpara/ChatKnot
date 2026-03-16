import Expo
import React
import ReactAppDependencyProvider
import UIKit

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}

@objc(ChatBackgroundTask)
class ChatBackgroundTask: NSObject, RCTBridgeModule {
  private var activeTask: UIBackgroundTaskIdentifier = .invalid

  static func moduleName() -> String! {
    "ChatBackgroundTask"
  }

  static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc(begin:resolver:rejecter:)
  func begin(
    _ taskName: String?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      self.endActiveTaskIfNeeded()

      self.activeTask = UIApplication.shared.beginBackgroundTask(
        withName: taskName ?? "ChatKnot Streaming"
      ) {
        self.endActiveTaskIfNeeded()
      }

      if self.activeTask == .invalid {
        resolve(nil)
        return
      }

      resolve(NSNumber(value: self.activeTask.rawValue))
    }
  }

  @objc(end:)
  func end(_ taskIdentifier: NSNumber) {
    DispatchQueue.main.async {
      guard self.activeTask != .invalid else {
        return
      }

      if NSNumber(value: self.activeTask.rawValue) == taskIdentifier {
        self.endActiveTaskIfNeeded()
      }
    }
  }

  private func endActiveTaskIfNeeded() {
    guard activeTask != .invalid else {
      return
    }

    UIApplication.shared.endBackgroundTask(activeTask)
    activeTask = .invalid
  }
}
