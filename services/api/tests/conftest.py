import pytest

import api.config

# Replaced before any test imports api modules, so a developer's local .env files never leak into tests.
api.config.settings = api.config.Settings(_env_file=None)  # type: ignore[call-arg]


@pytest.fixture
def production_sentry(monkeypatch):
    monkeypatch.setattr(api.config.settings, "sentry_dsn", "https://k@example.ingest.sentry.io/1")
    monkeypatch.setattr(api.config.settings, "sentry_environment", "production")
