import { memo, useCallback } from 'react'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppText } from '../../components/ui'
import { useTimers } from '../../context/TimerContext'
import useSecondTick from '../CookModeScreen/useSecondTick'
import CollapsibleListCard from './CollapsibleListCard'
import TimerRing from './TimerRing'
import TimerRow from './TimerRow'
import {
  getTimerProgress,
  getTimerState,
  getTimersSummary,
  toSortedTimerViews,
  type TimerView,
} from './timerHelpers'
import { styles } from './styles'

const keyExtractor = (view: TimerView) => view.timer.id

const TimersCard = () => {
  const { t } = useTranslation()
  const { timers, hasRunningTimers, pauseTimer, resumeTimer, cancelTimer } = useTimers()

  useSecondTick(hasRunningTimers)

  const views = toSortedTimerViews(timers.values())
  const anyDone = views.some((view) => view.done)
  const head = views.find((view) => !view.done) ?? views[0]
  const summary = getTimersSummary(views, t('home.timers.done'))

  const renderRow = useCallback(
    (view: TimerView) => (
      <TimerRow
        timer={view.timer}
        remaining={view.remaining}
        done={view.done}
        onPause={pauseTimer}
        onResume={resumeTimer}
        onDismiss={cancelTimer}
      />
    ),
    [cancelTimer, pauseTimer, resumeTimer],
  )

  if (!head) return null

  const ringState = anyDone ? 'done' : getTimerState(head.timer, false)

  const header = (
    <View style={styles.listHeader}>
      <TimerRing count={views.length} progress={getTimerProgress(head.timer, head.remaining)} state={ringState} />
      <View style={styles.flexFill}>
        <AppText variant="rowTitle">{t('home.timers.title')}</AppText>
        <AppText variant="meta" tone={anyDone ? 'actionText' : 'textSecondary'} numberOfLines={1} tabular>
          {summary}
        </AppText>
      </View>
    </View>
  )

  return (
    <CollapsibleListCard
      header={header}
      items={views}
      keyExtractor={keyExtractor}
      renderItem={renderRow}
      accessibilityLabel={t('home.timers.accessibilitySummary', { title: t('home.timers.title'), summary })}
    />
  )
}

export default memo(TimersCard)
