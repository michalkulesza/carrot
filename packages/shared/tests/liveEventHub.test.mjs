import assert from 'node:assert/strict'
import test from 'node:test'
import { createLiveEventHub } from '../src/utils/liveEventHub.ts'

const createTransport = () => {
  const state = { opens: 0, closes: 0, handlers: null, getLastEventId: null }
  const transport = {
    open: (handlers, getLastEventId) => {
      state.opens += 1
      state.handlers = handlers
      state.getLastEventId = getLastEventId
      return () => {
        state.closes += 1
      }
    },
  }
  return { state, transport }
}

test('opens on first listener and closes when the last one leaves', () => {
  const { state, transport } = createTransport()
  const hub = createLiveEventHub(transport)
  const offRecipes = hub.subscribe('recipes', () => {})
  const offMeals = hub.subscribe('mealPlan', () => {})
  assert.equal(state.opens, 1)
  offRecipes()
  assert.equal(state.closes, 0)
  offMeals()
  assert.equal(state.closes, 1)
})

test('dispatches events only to the matching channel', () => {
  const { state, transport } = createTransport()
  const hub = createLiveEventHub(transport)
  const recipes = []
  const meals = []
  hub.subscribe('recipes', (event) => recipes.push(event))
  hub.subscribe('mealPlan', (event) => meals.push(event))
  state.handlers.onEvent({ channel: 'recipes', type: 'recipe_changed', id: 'r1' })
  assert.equal(recipes.length, 1)
  assert.equal(meals.length, 0)
})

test('late shopping list listener gets the latest snapshot and presence', () => {
  const { state, transport } = createTransport()
  const hub = createLiveEventHub(transport)
  hub.subscribe('recipes', () => {})
  state.handlers.onEvent({ channel: 'shoppingList', type: 'list_snapshot', items: [1] })
  state.handlers.onEvent({ channel: 'shoppingList', type: 'list_snapshot', items: [1, 2] })
  state.handlers.onEvent({ channel: 'shoppingList', type: 'presence', users: [] })
  const seen = []
  hub.subscribe('shoppingList', (event) => seen.push(event))
  assert.deepEqual(seen.map((event) => event.type), ['list_snapshot', 'presence'])
  assert.deepEqual(seen[0].items, [1, 2])
})

test('tracks the last import event id and exposes it to the transport', () => {
  const { state, transport } = createTransport()
  const hub = createLiveEventHub(transport)
  hub.subscribe('importJobs', () => {})
  assert.equal(state.getLastEventId(), undefined)
  state.handlers.onEvent({ channel: 'importJobs', event: 'import_jobs.snapshot', jobs: [] }, 7)
  state.handlers.onEvent({ channel: 'importJobs', event: 'import_job.updated' }, 9)
  state.handlers.onEvent({ channel: 'recipes', type: 'recipe_changed' })
  assert.equal(state.getLastEventId(), 9)
})

test('a late import jobs listener restarts the stream to receive a fresh snapshot', () => {
  const { state, transport } = createTransport()
  const hub = createLiveEventHub(transport)
  const resyncs = []
  hub.subscribe('recipes', () => {}, () => resyncs.push('recipes'))
  hub.subscribe('importJobs', () => {})
  assert.equal(state.opens, 1)
  state.handlers.onEvent({ channel: 'importJobs', event: 'import_jobs.snapshot', jobs: [] }, 3)
  hub.subscribe('importJobs', () => {})
  assert.equal(state.opens, 2)
  assert.equal(state.closes, 1)
  assert.equal(state.getLastEventId(), 3)
  assert.deepEqual(resyncs, ['recipes'])
})

test('transport resubscribe notifies every channel listener', () => {
  const { state, transport } = createTransport()
  const hub = createLiveEventHub(transport)
  const resyncs = []
  hub.subscribe('recipes', () => {}, () => resyncs.push('recipes'))
  hub.subscribe('mealPlan', () => {}, () => resyncs.push('mealPlan'))
  state.handlers.onResubscribe()
  assert.deepEqual(resyncs.sort(), ['mealPlan', 'recipes'])
})

test('shutdown clears replay cache and import cursor', () => {
  const { state, transport } = createTransport()
  const hub = createLiveEventHub(transport)
  const off = hub.subscribe('shoppingList', () => {})
  state.handlers.onEvent({ channel: 'shoppingList', type: 'list_snapshot', items: [1] })
  state.handlers.onEvent({ channel: 'importJobs', event: 'x' }, 5)
  off()
  const seen = []
  hub.subscribe('shoppingList', (event) => seen.push(event))
  assert.equal(seen.length, 0)
  assert.equal(state.getLastEventId(), undefined)
})
