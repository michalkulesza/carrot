from __future__ import annotations

import uuid
from datetime import date as DateType, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel
from sqlalchemy import JSON, Boolean, Column, Date, ForeignKey, Index, Integer, String, DateTime, Table, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from api.database import Base


# ── Unit enum ─────────────────────────────────────────────────────────────────

class UnitEnum(StrEnum):
    ML = "ml"
    L = "l"
    TSP = "tsp"
    TBSP = "tbsp"
    CUP = "cup"
    G = "g"
    KG = "kg"
    PIECE = "piece"
    CLOVE = "clove"
    SLICE = "slice"
    CAN = "can"
    BUNCH = "bunch"
    PINCH = "pinch"
    SPRIG = "sprig"
    HANDFUL = "handful"


# ── Allergen helpers ──────────────────────────────────────────────────────────

class AllergenData(BaseModel):
    predefined: list[str] = []
    custom: list[str] = []

    def all_allergens(self) -> list[str]:
        return self.predefined + self.custom


class AllergenFlag(BaseModel):
    allergen: str | None = None
    substitute: str | None = None
    substitute_applied: bool = False
    original_display: str | None = None


# ── Association tables ────────────────────────────────────────────────────────

recipe_tags_table = Table(
    "recipe_tags",
    Base.metadata,
    Column("recipe_id", PG_UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", PG_UUID(as_uuid=True), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)

user_recipe_favourites_table = Table(
    "user_recipe_favourites",
    Base.metadata,
    Column("user_id", PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("recipe_id", PG_UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="CASCADE"), primary_key=True),
)


# ── Household models ──────────────────────────────────────────────────────────

class Household(Base):
    __tablename__ = "households"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#6366f1")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    allergens: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class HouseholdMember(Base):
    __tablename__ = "household_members"

    household_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class InvitationStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"


class HouseholdInvitation(Base):
    __tablename__ = "household_invitations"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    invited_user_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    invited_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    invited_by_user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=InvitationStatus.PENDING)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class VerificationCode(Base):
    __tablename__ = "verification_codes"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PendingSignup(Base):
    __tablename__ = "pending_signups"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ── SQLAlchemy tag model ──────────────────────────────────────────────────────

class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(30), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    household_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=True
    )


# ── SQLAlchemy recipe model ───────────────────────────────────────────────────

class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    household_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=True
    )
    shared_to_personal: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    servings: Mapped[int | None] = mapped_column(nullable=True)
    kcal_per_serving: Mapped[int | None] = mapped_column(nullable=True)
    protein_per_serving: Mapped[int | None] = mapped_column(nullable=True)
    fat_per_serving: Mapped[int | None] = mapped_column(nullable=True)
    carbs_per_serving: Mapped[int | None] = mapped_column(nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String, nullable=True)
    creator_handle: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String, nullable=True)
    components: Mapped[list[Any]] = mapped_column(JSON, default=list)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)
    debug_model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    debug_input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    debug_output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    debug_total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tags: Mapped[list[Tag]] = relationship("Tag", secondary=recipe_tags_table, lazy="selectin")
    author: Mapped["User"] = relationship("User", foreign_keys="Recipe.user_id", lazy="selectin")  # type: ignore[name-defined]


# ── Gemini extraction schema ──────────────────────────────────────────────────

class Ingredient(BaseModel):
    qty: str | None = None
    unit: UnitEnum | None = None
    name: str
    allergen: str | None = None
    substitute: str | None = None


class StepRef(BaseModel):
    step_index: int
    ingredient_index: int
    mention: str


class RecipeComponent(BaseModel):
    role: str = "main"
    name: str | None = None
    yield_note: str | None = None
    ingredients: list[Ingredient] = []
    steps: list[str] = []
    step_refs: list[StepRef] = []


class RecipeExtraction(BaseModel):
    title: str | None = None
    servings: int | None = None
    kcal_per_serving: int | None = None
    protein_per_serving: int | None = None
    fat_per_serving: int | None = None
    carbs_per_serving: int | None = None
    tags: list[str] = []
    components: list[RecipeComponent] = []


# ── API request / response ────────────────────────────────────────────────────

class ImportRequest(BaseModel):
    url: str


class ImportDebugUsage(BaseModel):
    model: str
    input_tokens: int
    output_tokens: int
    total_tokens: int


class ImportMetadata(BaseModel):
    creator_handle: str | None = None
    thumbnail_url: str | None = None
    source_url: str | None = None
    debug: ImportDebugUsage | None = None


class ImportStage(StrEnum):
    DESCRIPTION = "description"
    LINK = "link"
    TRANSCRIPT = "transcript"
    FAILED = "failed"


class ImportResult(BaseModel):
    stage: ImportStage
    recipe: RecipeExtraction | None = None
    metadata: ImportMetadata
    error: str | None = None


# ── Tag API ───────────────────────────────────────────────────────────────────

class TagOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    is_default: bool
    household_id: uuid.UUID | None = None


class TagCreate(BaseModel):
    name: str


# ── Recipe save / list ────────────────────────────────────────────────────────

class StepIngredientRef(BaseModel):
    ingredient_index: int
    mention: str


class SaveComponent(BaseModel):
    name: str
    yield_note: str
    ingredients: list[str]
    steps: list[str]
    ingredient_flags: list[AllergenFlag] | None = None
    step_ingredient_refs: list[list[StepIngredientRef]] | None = None


class RecipeSaveRequest(BaseModel):
    title: str
    servings: int | None = None
    kcal_per_serving: int | None = None
    protein_per_serving: int | None = None
    fat_per_serving: int | None = None
    carbs_per_serving: int | None = None
    thumbnail_url: str | None = None
    creator_handle: str | None = None
    source_url: str | None = None
    notes: str | None = None
    components: list[SaveComponent]
    tag_ids: list[uuid.UUID] = []
    shared_to_personal: bool = True
    debug_model: str | None = None
    debug_input_tokens: int | None = None
    debug_output_tokens: int | None = None
    debug_total_tokens: int | None = None


class RecipeOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    title: str
    servings: int | None
    kcal_per_serving: int | None
    protein_per_serving: int | None = None
    fat_per_serving: int | None = None
    carbs_per_serving: int | None = None
    thumbnail_url: str | None
    creator_handle: str | None
    source_url: str | None
    notes: str | None = None
    debug_model: str | None = None
    debug_input_tokens: int | None = None
    debug_output_tokens: int | None = None
    debug_total_tokens: int | None = None
    components: list[Any]
    created_at: datetime
    updated_at: datetime
    tags: list[TagOut] = []
    household_id: uuid.UUID | None = None
    shared_to_personal: bool = True
    added_by: str | None = None
    is_favourite: bool = False


class RecipeOrderRequest(BaseModel):
    ids: list[uuid.UUID]


# ── Meal Plan ─────────────────────────────────────────────────────────────────

class MealPlanEntry(Base):
    __tablename__ = "meal_plan_entries"
    __table_args__ = (
        Index(
            "uq_meal_plan_personal",
            "user_id",
            "date",
            unique=True,
            postgresql_where=text("household_id IS NULL"),
        ),
        Index(
            "uq_meal_plan_household",
            "household_id",
            "date",
            unique=True,
            postgresql_where=text("household_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    household_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=True
    )
    date: Mapped[DateType] = mapped_column(Date, nullable=False)
    recipe_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False
    )
    recipe: Mapped[Recipe] = relationship("Recipe", lazy="selectin")


class MealPlanEntryOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    date: DateType
    recipe: RecipeOut


class MealPlanSetRequest(BaseModel):
    recipe_id: uuid.UUID


# ── User Preferences ──────────────────────────────────────────────────────────

class UserPreferences(Base):
    __tablename__ = "user_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    week_start_day: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    auto_substitute: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    personal_allergens: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    unit_system: Mapped[str] = mapped_column(String(20), default="metric", nullable=False)


class UserPreferencesOut(BaseModel):
    model_config = {"from_attributes": True}

    week_start_day: int
    auto_substitute: bool = False
    personal_allergens: dict | None = None
    language: str = "en"
    unit_system: str = "metric"


class UserPreferencesUpdate(BaseModel):
    week_start_day: int | None = None
    auto_substitute: bool | None = None
    personal_allergens: dict | None = None
    language: str | None = None
    unit_system: str | None = None


# ── Shopping List ──────────────────────────────────────────────────────────────

class ShoppingListItem(Base):
    __tablename__ = "shopping_list_items"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    household_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=True
    )
    text: Mapped[str] = mapped_column(String, nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ShoppingListItemOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    household_id: uuid.UUID | None = None
    text: str
    completed: bool
    position: int
    created_at: datetime
    updated_at: datetime


class ShoppingListItemsCreate(BaseModel):
    items: list[str]


class ShoppingListItemUpdate(BaseModel):
    text: str | None = None
    completed: bool | None = None


class ShoppingListReorderRequest(BaseModel):
    ids: list[uuid.UUID]


# ── Background Import Jobs ─────────────────────────────────────────────────────

class ImportJobStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class ImportJobKind(StrEnum):
    URL = "url"
    TEXT = "text"
    IMAGE = "image"


class ImportJob(Base):
    __tablename__ = "import_jobs"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=ImportJobStatus.PENDING)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    input: Mapped[dict] = mapped_column(JSON, nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False, default="gemini-2.5-flash-lite")
    activity_push_token: Mapped[str | None] = mapped_column(String, nullable=True)
    device_push_token: Mapped[str | None] = mapped_column(String, nullable=True)
    result_recipe_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    error: Mapped[str | None] = mapped_column(String, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ImportJobCreate(BaseModel):
    kind: ImportJobKind
    input: dict  # {url} | {text} | {image_base64, mime_type}
    model: str = "gemini-2.5-flash-lite"
    activity_push_token: str | None = None
    device_push_token: str | None = None


class ImportJobOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    status: str
    kind: str
    result_recipe_id: uuid.UUID | None = None
    error: str | None = None
    attempts: int
    created_at: datetime
    updated_at: datetime
