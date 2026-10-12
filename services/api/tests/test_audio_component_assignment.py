"""Audio steps must land in the retained component they belong to."""

from api.services import gemini
from api.services.extraction_v2.contracts import (
    ExtractedRecipe,
    IngredientEvidence,
    RecipeComponentEvidence,
    StepEvidence,
)
from api.services.extraction_v2.merge import merge_recipes


def _ing(text: str) -> IngredientEvidence:
    return IngredientEvidence(text=text, evidence_ids=["caption:0"])


def _step(text: str) -> StepEvidence:
    return StepEvidence(text=text, evidence_ids=["transcript:0"])


def _retained() -> ExtractedRecipe:
    return ExtractedRecipe(components=[
        RecipeComponentEvidence(name=None, ingredients=[_ing("3 ovos")]),
        RecipeComponentEvidence(name="Calda", ingredients=[_ing("2 colheres de açúcar")]),
    ])


def _steps(recipe: ExtractedRecipe) -> dict[str | None, list[str]]:
    return {c.name: [s.text for s in c.steps] for c in recipe.components}


def test_prompt_requires_exact_component_assignment() -> None:
    prompt = gemini._AUDIO_EVIDENCE_SYSTEM
    assert "more than one component" in prompt
    assert "EXACTLY" in prompt
    assert "null for the unnamed main component" in prompt
    assert "never\ntranslating" in prompt
    assert "absent from retained_recipe" in prompt


def test_audio_steps_merge_into_named_and_main_components() -> None:
    audio = ExtractedRecipe(components=[
        RecipeComponentEvidence(name=None, steps=[_step("Bata os ovos.")]),
        RecipeComponentEvidence(name="Calda", steps=[_step("Leve ao fogo.")]),
    ])
    merged = merge_recipes(_retained(), audio)
    assert _steps(merged) == {None: ["Bata os ovos."], "Calda": ["Leve ao fogo."]}


def test_audio_component_names_match_case_and_emoji_insensitively() -> None:
    audio = ExtractedRecipe(components=[
        RecipeComponentEvidence(name="calda", steps=[_step("Leve ao fogo.")]),
        RecipeComponentEvidence(name="\U0001F36F CALDA:", steps=[_step("Deixe engrossar.")]),
    ])
    merged = merge_recipes(_retained(), audio)
    assert len(merged.components) == 2
    assert _steps(merged)["Calda"] == ["Leve ao fogo.", "Deixe engrossar."]


def test_new_audio_component_name_is_still_created() -> None:
    audio = ExtractedRecipe(components=[RecipeComponentEvidence(name="Cobertura", steps=[_step("Espalhe.")])])
    merged = merge_recipes(_retained(), audio)
    assert _steps(merged)["Cobertura"] == ["Espalhe."]
    assert len(merged.components) == 3


def test_single_component_recipe_unchanged() -> None:
    retained = ExtractedRecipe(components=[RecipeComponentEvidence(name=None, ingredients=[_ing("3 ovos")])])
    audio = ExtractedRecipe(components=[RecipeComponentEvidence(name=None, steps=[_step("Asse.")])])
    merged = merge_recipes(retained, audio)
    assert _steps(merged) == {None: ["Asse."]}
