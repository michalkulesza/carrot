import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveStepAnchors } from '../src/utils/stepAnchors.ts'

test('resolveStepAnchors uses the target component and carries anchors forward', () => {
  const anchors = resolveStepAnchors([
    { steps: [], step_ingredient_line: [] },
    { steps: [], step_ingredient_line: [] },
    {
      steps: ['a', 'b', 'c', 'd'],
      step_ingredient_line: [null, 1, null, 0],
      step_ingredient_component: [null, 1, null, null],
    },
  ])

  assert.deepEqual(anchors, [
    null,
    { componentIndex: 1, ingredientIndex: 1 },
    { componentIndex: 1, ingredientIndex: 1 },
    { componentIndex: 2, ingredientIndex: 0 },
  ])
})
