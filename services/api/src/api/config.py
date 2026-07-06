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

    # R2 image storage (optional — uploads skipped when not configured)
    r2_endpoint_url: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = ""
    r2_public_url: str = ""

    @property
    def apns_configured(self) -> bool:
        return bool(self.apns_key_p8 and self.apns_key_id and self.apns_team_id)

    @property
    def r2_configured(self) -> bool:
        return bool(self.r2_endpoint_url and self.r2_access_key_id and self.r2_bucket_name)

    # Email (Resend — optional; console fallback when unset)
    resend_api_key: str = ""
    email_from: str = ""

    @property
    def email_configured(self) -> bool:
        return bool(self.resend_api_key and self.email_from)

    # Google Sign-In — client IDs used to verify Google ID tokens
    google_ios_client_id: str = ""
    google_android_client_id: str = ""
    google_web_client_id: str = ""


settings = Settings()  # type: ignore[call-arg]
