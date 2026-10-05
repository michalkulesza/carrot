import type { AllergenFlag } from "../types";

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
