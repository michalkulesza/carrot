import api.config

# Replaced before any test imports api modules, so a developer's local .env files never leak into tests.
api.config.settings = api.config.Settings(_env_file=None)  # type: ignore[call-arg]
