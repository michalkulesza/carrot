"""The audio-evidence request must carry accented text literally, not as unicode escapes.

Prod regression: escaped transcripts made the model answer "açúcar" as "a343434car",
"óleo" as "34leo", "pão" as "p34o" (the model mangles the escape sequences).
"""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from api.services import gemini

TRANSCRIPTS = [
    "Coloque um copo de açúcar, meio copo de óleo e fermento biológico para pão até dissolver.",
    "Dodaj żółtą cebulę, śmietanę i pokrój ją w kostkę. Łyżka masła.",
    "Füge Zucker, Öl und Mehl hinzu. Schlag die Eier schaumig, süß und fest.",
    "Ajoutez le sucre, l'huile d'olive et la crème fraîche. Faites cuire à feu doux, déglacez.",
]


@pytest.mark.asyncio
@pytest.mark.parametrize("transcript", TRANSCRIPTS)
async def test_request_contents_keep_accents_literal(monkeypatch, transcript: str) -> None:
    aio = AsyncMock()
    aio.__aenter__.return_value = aio
    aio.models.generate_content = AsyncMock(return_value=SimpleNamespace(
        text=json.dumps({"components": [{"name": None, "ingredients": [], "steps": ["Cook."]}]}),
        usage_metadata=SimpleNamespace(prompt_token_count=1, candidates_token_count=1),
    ))
    monkeypatch.setattr(gemini, "_build_client", Mock(return_value=SimpleNamespace(aio=aio)))
    retained = {"components": [{"name": "Calda", "ingredients": [{"text": "fermento biológico"}], "steps": []}]}

    await gemini.extract_audio_recipe_evidence(transcript, retained)

    contents = aio.models.generate_content.call_args.kwargs["contents"]
    assert "\\u" not in contents
    assert transcript in json.loads(contents)["transcript"]
    assert "biológico" in contents and json.loads(contents)["transcript"] == transcript
