import ActivityKit
import ExpoModulesCore

struct TimerActivityRecord: Record {
  @Field var id: String = ""
  @Field var recipeTitle: String = ""
  @Field var stepLabel: String = ""
  @Field var deepLink: String = ""
  @Field var status: String = "running"
  @Field var remainingSeconds: Int = 0
  @Field var endDateMs: Double? = nil
  @Field var notificationId: String = ""
  @Field var notificationTitle: String = ""
  @Field var notificationBody: String = ""
  @Field var notificationPayload: String = "{}"
}

private func timerItem(_ record: TimerActivityRecord) -> TimerItem {
  let isRunning = record.status == "running"
  let endDate = isRunning ? record.endDateMs.map { Date(timeIntervalSince1970: $0 / 1000) } : nil

  return TimerItem(
    id: record.id,
    recipeTitle: record.recipeTitle,
    stepLabel: record.stepLabel,
    status: record.status,
    remainingSeconds: record.remainingSeconds,
    endDate: endDate,
    deepLink: record.deepLink,
    notificationId: record.notificationId,
    notificationTitle: record.notificationTitle,
    notificationBody: record.notificationBody,
    notificationPayload: record.notificationPayload
  )
}

private func endAllActivities() async {
  for activity in Activity<TimerAttributes>.activities {
    await activity.end(nil, dismissalPolicy: .immediate)
  }
}

private func sync(_ records: [TimerActivityRecord], moreFormat: String, doneLabel: String) async -> Bool {
  guard !records.isEmpty else {
    await endAllActivities()
    return true
  }
  guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }

  let state = TimerAttributes.ContentState(timers: records.map(timerItem), moreFormat: moreFormat, doneLabel: doneLabel)
  let content = state.sorted().content()

  if let existing = Activity<TimerAttributes>.activities.first {
    await existing.update(content)
    return true
  }

  do {
    _ = try Activity.request(attributes: TimerAttributes(name: "Carrot"), content: content, pushType: nil)
    return true
  } catch {
    return false
  }
}

public class TimerLiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TimerLiveActivity")

    Function("isSupported") { () -> Bool in
      ActivityAuthorizationInfo().areActivitiesEnabled
    }

    AsyncFunction("sync") { (records: [TimerActivityRecord], moreFormat: String, doneLabel: String) -> Bool in
      await sync(records, moreFormat: moreFormat, doneLabel: doneLabel)
    }

    AsyncFunction("endAll") { () in
      await endAllActivities()
    }

    Function("readPendingChanges") { () -> [[String: Any?]] in
      TimerPendingStore.drain().map {
        [
          "id": $0.id,
          "status": $0.status,
          "remainingSeconds": $0.remainingSeconds,
          "endDateMs": $0.endDateMs,
          "changedAtMs": $0.changedAtMs,
        ]
      }
    }
  }
}
