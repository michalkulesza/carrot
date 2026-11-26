import pytest

from api.models import RecipeExtraction, RecipeSourceExtraction


@pytest.mark.parametrize("model", [RecipeExtraction, RecipeSourceExtraction])
@pytest.mark.parametrize(("raw", "expected"), [(0, 1), (-3, 1), (1, 1), (6, 6), (None, None)])
def test_extracted_servings_are_at_least_one(model, raw, expected):
    assert model.model_validate({"servings": raw}).servings == expected


@pytest.mark.parametrize(("raw", "expected"), [(0, 1), (-1, 1), (4, 4), (None, None)])
def test_saved_servings_are_at_least_one(raw, expected):
    from api.models import RecipeSaveRequest

    assert RecipeSaveRequest.model_validate({"title": "Soup", "servings": raw, "components": []}).servings == expected
