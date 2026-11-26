import type { AllergenFlag, SaveComponent } from "../types";

const fields = [
  "shopping_list_ingredients",
  "metric_ingredients",
  "imperial_ingredients",
] as const;

interface SubstitutionComponent {
  ingredient_flags?: (AllergenFlag | null)[] | null;
  shopping_list_ingredients?: string[] | null;
  metric_ingredients?: string[] | null;
  imperial_ingredients?: string[] | null;
}

// The caller supplies serialized ingredients so this also works with editable forms.
export function substituteIngredient<T extends SubstitutionComponent>(
  component: T,
  ingredients: string[],
  index: number,
  apply: boolean,
): T {
  const flag = component.ingredient_flags?.[index];
  const display = apply ? flag?.substitute : flag?.original_display;
  if (!flag || !display || (apply && flag.substitute_applied)) return component;
  const result = { ...component };
  const originals: Record<string, string> = {};
  for (const field of fields) {
    const values = ingredients.map(
      (ingredient, i) => component[field]?.[i] ?? ingredient,
    );
    originals[field] = values[index];
    values[index] = apply
      ? display
      : (flag.original_values?.[field] ?? display);
    result[field] = values;
  }
  result.ingredient_flags = (component.ingredient_flags ?? []).map(
    (value, i) =>
      i === index
        ? {
            ...flag,
            substitute_applied: apply,
            original_display: apply ? ingredients[index] : null,
            original_values: apply ? originals : null,
          }
        : value,
  );
  return result;
}

export interface SubstitutionTarget {
  ci: number;
  ii: number;
}

export const applyIngredientReplace = (
  components: SaveComponent[],
  ci: number,
  ii: number,
): SaveComponent[] | null => {
  const flag = components[ci].ingredient_flags?.[ii];
  if (!flag?.substitute || flag.substitute_applied) return null;

  return components.map((component, index) =>
    index !== ci
      ? component
      : {
          ...substituteIngredient(component, component.ingredients, ii, true),
          ingredients: component.ingredients.map((value, valueIndex) =>
            valueIndex === ii ? flag.substitute! : value,
          ),
        },
  );
};

export const applyIngredientRestore = (
  components: SaveComponent[],
  ci: number,
  ii: number,
): SaveComponent[] | null => {
  const flag = components[ci].ingredient_flags?.[ii];
  if (!flag?.original_display) return null;

  return components.map((component, index) =>
    index !== ci
      ? component
      : {
          ...substituteIngredient(component, component.ingredients, ii, false),
          ingredients: component.ingredients.map((value, valueIndex) =>
            valueIndex === ii ? flag.original_display! : value,
          ),
        },
  );
};

const applyMany = (
  components: SaveComponent[],
  targets: SubstitutionTarget[],
  applyOne: (
    components: SaveComponent[],
    ci: number,
    ii: number,
  ) => SaveComponent[] | null,
): SaveComponent[] | null => {
  let result = components;
  let changed = false;
  for (const { ci, ii } of targets) {
    const next = applyOne(result, ci, ii);
    if (!next) continue;
    result = next;
    changed = true;
  }

  return changed ? result : null;
};

export const applyIngredientReplaceMany = (
  components: SaveComponent[],
  targets: SubstitutionTarget[],
) => applyMany(components, targets, applyIngredientReplace);

export const applyIngredientRestoreMany = (
  components: SaveComponent[],
  targets: SubstitutionTarget[],
) => applyMany(components, targets, applyIngredientRestore);
