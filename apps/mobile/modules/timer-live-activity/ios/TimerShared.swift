import ActivityKit
import AppIntents
import Foundation
import UserNotifications

let timerAppGroupId = "group.com.kulesza.carrot"
let timerPendingChangesKey = "timer-state"

struct TimerItem: Codable, Hashable, Identifiable {
  var id: String
  var recipeTitle: String
  var stepLabel: String
  var status: String
  var remainingSeconds: Int
  var endDate: Date?
  var deepLink: String
  var notificationId: String
  var notificationTitle: String
  var notificationBody: String
  var notificationPayload: String

  var isRunning: Bool { status == "running" }

  func isDone(at now: Date) -> Bool {
    guard isRunning, let endDate else { return false }
    return endDate <= now
  }
}

struct TimerAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var timers: [TimerItem]
    var moreFormat: String
    var doneLabel: String

    func headline(at now: Date) -> TimerItem? {
      timers.first { $0.isRunning && !$0.isDone(at: now) } ?? timers.first { !$0.isRunning } ?? timers.first
    }

    func sorted() -> ContentState {
      var copy = self
      let running = timers.filter(\.isRunning).sorted { ($0.endDate ?? .distantFuture) < ($1.endDate ?? .distantFuture) }
      copy.timers = running + timers.filter { !$0.isRunning }
      return copy
    }

    // iOS can't run code when a timer ends, but it re-renders at staleDate, which flips that row to "Done".
    func content() -> ActivityContent<ContentState> {
      let now = Date()
      let nextEnd = timers.compactMap { $0.isRunning ? $0.endDate : nil }.filter { $0 > now }.min()
      return ActivityContent(state: self, staleDate: nextEnd)
    }
  }

  var name: String
}

struct TimerPendingChange: Codable {
  var id: String
  var status: String
  var remainingSeconds: Int
  var endDateMs: Double?
  var changedAtMs: Double
}

enum TimerPendingStore {
  static func record(_ change: TimerPendingChange) {
    guard let defaults = UserDefaults(suiteName: timerAppGroupId) else { return }
    var changes = load(defaults)
    changes.removeAll { $0.id == change.id }
    changes.append(change)
    guard let data = try? JSONEncoder().encode(changes) else { return }
    defaults.set(data, forKey: timerPendingChangesKey)
  }

  static func drain() -> [TimerPendingChange] {
    guard let defaults = UserDefaults(suiteName: timerAppGroupId) else { return [] }
    let changes = load(defaults)
    defaults.removeObject(forKey: timerPendingChangesKey)
    return changes
  }

  private static func load(_ defaults: UserDefaults) -> [TimerPendingChange] {
    guard let data = defaults.data(forKey: timerPendingChangesKey) else { return [] }
    return (try? JSONDecoder().decode([TimerPendingChange].self, from: data)) ?? []
  }
}

@available(iOS 17.0, *)
enum TimerActivityActions {
  static var activity: Activity<TimerAttributes>? { Activity<TimerAttributes>.activities.first }

  static func pause(_ timerId: String) async {
    guard let activity, var item = activity.content.state.timers.first(where: { $0.id == timerId }), item.isRunning else { return }
    let remaining = max(0, Int((item.endDate ?? Date()).timeIntervalSinceNow.rounded(.down)))

    UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [item.notificationId])
    item.status = "paused"
    item.remainingSeconds = remaining
    item.endDate = nil

    await replace(item, in: activity)
    TimerPendingStore.record(TimerPendingChange(
      id: timerId, status: "paused", remainingSeconds: remaining, endDateMs: nil, changedAtMs: nowMs()
    ))
  }

  static func resume(_ timerId: String) async {
    guard let activity, var item = activity.content.state.timers.first(where: { $0.id == timerId }), !item.isRunning else { return }
    let remaining = item.remainingSeconds
    guard remaining > 0 else { return }
    let end = Date().addingTimeInterval(TimeInterval(remaining))

    item.status = "running"
    item.endDate = end

    await scheduleDoneNotification(item)
    await replace(item, in: activity)
    TimerPendingStore.record(TimerPendingChange(
      id: timerId, status: "running", remainingSeconds: remaining,
      endDateMs: end.timeIntervalSince1970 * 1000, changedAtMs: nowMs()
    ))
  }

  static func cancel(_ timerId: String) async {
    guard let activity, let item = activity.content.state.timers.first(where: { $0.id == timerId }) else { return }
    UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [item.notificationId])

    let remaining = activity.content.state.timers.filter { $0.id != timerId }
    if remaining.isEmpty {
      await activity.end(nil, dismissalPolicy: .immediate)
    } else {
      var state = activity.content.state
      state.timers = remaining
      await activity.update(state.content())
    }

    TimerPendingStore.record(TimerPendingChange(
      id: timerId, status: "cancelled", remainingSeconds: 0, endDateMs: nil, changedAtMs: nowMs()
    ))
  }

  static func scheduleDoneNotification(_ item: TimerItem) async {
    let content = UNMutableNotificationContent()
    content.title = item.notificationTitle
    content.subtitle = item.recipeTitle
    content.body = item.notificationBody
    content.sound = .default
    if let data = item.notificationPayload.data(using: .utf8),
       let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      content.userInfo = payload
    }

    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(max(1, item.remainingSeconds)), repeats: false)
    let request = UNNotificationRequest(identifier: item.notificationId, content: content, trigger: trigger)
    try? await UNUserNotificationCenter.current().add(request)
  }

  private static func replace(_ item: TimerItem, in activity: Activity<TimerAttributes>) async {
    var state = activity.content.state
    guard let index = state.timers.firstIndex(where: { $0.id == item.id }) else { return }
    state.timers[index] = item
    await activity.update(state.sorted().content())
  }

  private static func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }
}

@available(iOS 17.0, *)
struct PauseTimerIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Pause timer"
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Timer ID") var timerId: String

  init() {}
  init(timerId: String) { self.timerId = timerId }

  func perform() async throws -> some IntentResult {
    await TimerActivityActions.pause(timerId)
    return .result()
  }
}

@available(iOS 17.0, *)
struct ResumeTimerIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Resume timer"
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Timer ID") var timerId: String

  init() {}
  init(timerId: String) { self.timerId = timerId }

  func perform() async throws -> some IntentResult {
    await TimerActivityActions.resume(timerId)
    return .result()
  }
}

@available(iOS 17.0, *)
struct CancelTimerIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Cancel timer"
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Timer ID") var timerId: String

  init() {}
  init(timerId: String) { self.timerId = timerId }

  func perform() async throws -> some IntentResult {
    await TimerActivityActions.cancel(timerId)
    return .result()
  }
}
