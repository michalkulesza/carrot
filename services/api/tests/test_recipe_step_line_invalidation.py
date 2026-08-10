from api.models import SaveComponent
from api.routes.recipes import _reconcile_component_derivatives


def _component(ingredients: list[str], steps: list[str]) -> SaveComponent:
    return SaveComponent(
        name="main",
        yield_note="",
        ingredients=ingredients,
        steps=steps,
        step_ingredient_line=[0],
    )


def test_step_lines_survive_an_unrelated_recipe_edit() -> None:
    stored = [{"ingredients": ["1 onion"], "steps": ["Chop the onion."]}]
    component = _component(["1 onion"], ["Chop the onion."])

    result = _reconcile_component_derivatives(stored, [component])

    assert result[0].step_ingredient_line == [0]


def test_step_lines_are_invalidated_when_content_changes_without_count_change() -> None:
    stored = [{"ingredients": ["1 onion"], "steps": ["Chop the onion."]}]
    changed_ingredient = _component(["1 shallot"], ["Chop the onion."])
    changed_step = _component(["1 onion"], ["Dice the onion."])

    ingredient_result = _reconcile_component_derivatives(stored, [changed_ingredient])
    step_result = _reconcile_component_derivatives(stored, [changed_step])

    assert ingredient_result[0].step_ingredient_line is None
    assert step_result[0].step_ingredient_line is None


def test_unit_variants_survive_an_unrelated_recipe_edit() -> None:
    stored = [{
        "ingredients": ["1 lb chicken"],
        "steps": ["Bake at 400°F."],
        "metric_ingredients": ["454 g chicken"],
        "imperial_ingredients": ["1 lb chicken"],
        "metric_steps": ["Bake at 200°C."],
        "imperial_steps": ["Bake at 400°F."],
    }]
    component = _component(["1 lb chicken"], ["Bake at 400°F."])

    result = _reconcile_component_derivatives(stored, [component])

    assert result[0].metric_ingredients == ["454 g chicken"]
    assert result[0].imperial_ingredients == ["1 lb chicken"]
    assert result[0].metric_steps == ["Bake at 200°C."]
    assert result[0].imperial_steps == ["Bake at 400°F."]


def test_only_variants_with_changed_source_content_are_invalidated() -> None:
    stored = [{
        "ingredients": ["1 lb chicken"],
        "steps": ["Bake at 400°F."],
        "metric_ingredients": ["454 g chicken"],
        "imperial_ingredients": ["1 lb chicken"],
        "metric_steps": ["Bake at 200°C."],
        "imperial_steps": ["Bake at 400°F."],
    }]
    component = _component(["2 lb chicken"], ["Bake at 400°F."]).model_copy(update={
        "metric_ingredients": ["454 g chicken"],
        "imperial_ingredients": ["1 lb chicken"],
        "metric_steps": ["Bake at 200°C."],
        "imperial_steps": ["Bake at 400°F."],
    })

    result = _reconcile_component_derivatives(stored, [component])

    assert result[0].metric_ingredients is None
    assert result[0].imperial_ingredients is None
    assert result[0].metric_steps == ["Bake at 200°C."]
    assert result[0].imperial_steps == ["Bake at 400°F."]
