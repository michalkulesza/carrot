"""Slim recipe response payloads: evidence stays in the database and on `/source`."""

from typing import Any

COMPONENT_EVIDENCE_FIELDS = ("ingredient_evidence", "step_evidence", "name_evidence")


def slim_components(components: list[Any]) -> list[Any]:
    return [
        {**component, **{field: [] for field in COMPONENT_EVIDENCE_FIELDS if field in component}}
        if isinstance(component, dict) else component
        for component in components or []
    ]


def _status_of(provenance: Any) -> dict[str, Any]:
    status = provenance.get("status", "unknown") if isinstance(provenance, dict) else "unknown"
    return {"status": status}


def slim_nutrition_provenance(provenance: dict[str, Any] | None) -> dict[str, Any]:
    return {field: _status_of(value) for field, value in (provenance or {}).items() if isinstance(value, dict)}


def slim_total_time_provenance(provenance: dict[str, Any] | None) -> dict[str, Any]:
    return _status_of(provenance)
