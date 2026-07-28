from api.models import SaveComponent
from api.routes.recipes import _invalidate_stale_step_ingredient_lines


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

    result = _invalidate_stale_step_ingredient_lines(stored, [component])

    assert result[0].step_ingredient_line == [0]


def test_step_lines_are_invalidated_when_content_changes_without_count_change() -> None:
    stored = [{"ingredients": ["1 onion"], "steps": ["Chop the onion."]}]
    changed_ingredient = _component(["1 shallot"], ["Chop the onion."])
    changed_step = _component(["1 onion"], ["Dice the onion."])

    ingredient_result = _invalidate_stale_step_ingredient_lines(stored, [changed_ingredient])
    step_result = _invalidate_stale_step_ingredient_lines(stored, [changed_step])

    assert ingredient_result[0].step_ingredient_line is None
    assert step_result[0].step_ingredient_line is None
