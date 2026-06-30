from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    scrapecreators_api_key: str
    gemini_api_key: str
    allowed_origins: str = "http://localhost:5173"
    database_url: str = "postgresql+asyncpg://platekeeper:platekeeper@localhost:5432/platekeeper"
    secret: str = "CHANGE-ME-IN-PRODUCTION-USE-LONG-RANDOM-STRING"

    # APNs credentials (optional — pushes are skipped when not configured)
    apns_key_p8: str = ""       # Contents of the .p8 file (PEM)
    apns_key_id: str = ""       # 10-char key ID from Apple Developer
    apns_team_id: str = ""      # 10-char team ID
    apns_bundle_id: str = "com.kulesza.platekeeper"
    apns_sandbox: bool = True   # False for production

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    @property
    def apns_configured(self) -> bool:
        return bool(self.apns_key_p8 and self.apns_key_id and self.apns_team_id)


settings = Settings()  # type: ignore[call-arg]
