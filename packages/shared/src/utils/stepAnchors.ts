import type { SaveComponent } from '../types';

export interface StepAnchor {
  componentIndex: number;
  ingredientIndex: number;
}

export const resolveStepAnchors = (
  components: Pick<SaveComponent, 'steps' | 'step_ingredient_line' | 'step_ingredient_component'>[],
): (StepAnchor | null)[] => {
  const anchors: (StepAnchor | null)[] = [];
  let lastAnchor: StepAnchor | null = null;

  components.forEach((component, componentIndex) => {
    const lines = component.step_ingredient_line ?? [];
    const targets = component.step_ingredient_component ?? [];

    component.steps.forEach((_, stepIndex) => {
      const ingredientIndex = lines[stepIndex];
      if (ingredientIndex != null) {
        lastAnchor = { componentIndex: targets[stepIndex] ?? componentIndex, ingredientIndex };
      }

      anchors.push(lastAnchor);
    });
  });

  return anchors;
};
