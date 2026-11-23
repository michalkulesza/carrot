import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

@main
struct TimerActivityBundle: WidgetBundle {
  var body: some Widget {
    TimerActivityWidget()
  }
}

private let expandedRowLimit = 3
private let lockScreenRowLimit = 4

private func formatRemaining(_ seconds: Int) -> String {
  let clamped = max(0, seconds)
  let hours = clamped / 3600
  let minutes = (clamped % 3600) / 60
  let secs = clamped % 60
  if hours > 0 { return String(format: "%d:%02d:%02d", hours, minutes, secs) }
  return String(format: "%d:%02d", minutes, secs)
}

private func deepLinkURL(_ item: TimerItem?) -> URL? {
  item.flatMap { URL(string: $0.deepLink) }
}

private struct TimerCountdownText: View {
  let item: TimerItem
  let doneLabel: String

  var body: some View {
    if item.isDone(at: Date()) {
      Label(doneLabel, systemImage: "checkmark")
        .foregroundStyle(.green)
    } else if item.isRunning, let endDate = item.endDate {
      Text(timerInterval: Date()...endDate, countsDown: true)
        .monospacedDigit()
    } else {
      Text(formatRemaining(item.remainingSeconds))
        .monospacedDigit()
    }
  }
}

private struct TimerControls: View {
  let item: TimerItem

  var body: some View {
    if #available(iOS 17.0, *) {
      HStack(spacing: 8) {
        if item.isRunning && !item.isDone(at: Date()) {
          Button(intent: PauseTimerIntent(timerId: item.id)) {
            Image(systemName: "pause.fill")
          }
        } else if !item.isRunning {
          Button(intent: ResumeTimerIntent(timerId: item.id)) {
            Image(systemName: "play.fill")
          }
        }
        Button(intent: CancelTimerIntent(timerId: item.id)) {
          Image(systemName: "xmark")
        }
      }
      .buttonStyle(.bordered)
      .tint(.orange)
    }
  }
}

private struct TimerRowLabel: View {
  let item: TimerItem

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(item.recipeTitle)
        .font(.subheadline)
        .fontWeight(.semibold)
        .lineLimit(1)
      Text(item.stepLabel)
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
  }
}

private struct TimerRow: View {
  let item: TimerItem
  let doneLabel: String

  var body: some View {
    HStack(spacing: 8) {
      if let url = deepLinkURL(item) {
        Link(destination: url) { TimerRowLabel(item: item) }
          .tint(.primary)
      } else {
        TimerRowLabel(item: item)
      }
      Spacer(minLength: 4)
      TimerCountdownText(item: item, doneLabel: doneLabel)
        .font(.title3)
        .fontWeight(.semibold)
        .foregroundStyle(item.isRunning ? Color.primary : Color.secondary)
      TimerControls(item: item)
    }
  }
}

private struct TimerList: View {
  let timers: [TimerItem]
  let moreFormat: String
  let doneLabel: String
  let limit: Int

  var body: some View {
    let visible = Array(timers.prefix(limit))
    let hidden = timers.count - visible.count

    VStack(alignment: .leading, spacing: 8) {
      ForEach(visible) { item in
        TimerRow(item: item, doneLabel: doneLabel)
      }
      if hidden > 0 {
        Text(moreFormat.replacingOccurrences(of: "{{count}}", with: "\(hidden)"))
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
  }
}

private struct HeadlineCountdown: View {
  let state: TimerAttributes.ContentState

  var body: some View {
    if let item = state.headline(at: Date()) {
      if item.isDone(at: Date()) {
        Image(systemName: "checkmark")
          .foregroundStyle(.green)
      } else {
        TimerCountdownText(item: item, doneLabel: state.doneLabel)
      }
    }
  }
}

struct TimerActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: TimerAttributes.self) { context in
      TimerList(timers: context.state.timers, moreFormat: context.state.moreFormat, doneLabel: context.state.doneLabel, limit: lockScreenRowLimit)
        .padding(16)
        .widgetURL(deepLinkURL(context.state.headline(at: Date())))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.bottom) {
          TimerList(timers: context.state.timers, moreFormat: context.state.moreFormat, doneLabel: context.state.doneLabel, limit: expandedRowLimit)
        }
      } compactLeading: {
        Image(systemName: "timer")
          .foregroundStyle(.orange)
      } compactTrailing: {
        HeadlineCountdown(state: context.state)
          .frame(maxWidth: 52)
      } minimal: {
        HeadlineCountdown(state: context.state)
          .frame(maxWidth: 40)
      }
      .widgetURL(deepLinkURL(context.state.headline(at: Date())))
    }
  }
}
