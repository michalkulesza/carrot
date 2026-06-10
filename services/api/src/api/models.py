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


# ── Association table ─────────────────────────────────────────────────────────

recipe_tags_table = Table(
    "recipe_tags",
    Base.metadata,
    Column("recipe_id", PG_UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", PG_UUID(as_uuid=True), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
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
    invited_user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    invited_by_user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=InvitationStatus.PENDING)
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
    thumbnail_url: Mapped[str | None] = mapped_column(String, nullable=True)
    creator_handle: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String, nullable=True)
    components: Mapped[list[Any]] = mapped_column(JSON, default=list)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tags: Mapped[list[Tag]] = relationship("Tag", secondary=recipe_tags_table, lazy="selectin")
    author: Mapped["User"] = relationship("User", foreign_keys="Recipe.user_id", lazy="selectin")  # type: ignore[name-defined]


# ── Gemini extraction schema ──────────────────────────────────────────────────

class Ingredient(BaseModel):
    qty: str | None = None
    unit: str | None = None
    name: str
    note: str | None = None
    allergen: str | None = None
    substitute: str | None = None


class RecipeComponent(BaseModel):
    role: str = "main"
    name: str | None = None
    yield_note: str | None = None
    ingredients: list[Ingredient] = []
    steps: list[str] = []


class RecipeExtraction(BaseModel):
    title: str | None = None
    servings: int | None = None
    kcal_per_serving: int | None = None
    tags: list[str] = []
    components: list[RecipeComponent] = []


# ── API request / response ────────────────────────────────────────────────────

class ImportRequest(BaseModel):
    url: str


class ImportMetadata(BaseModel):
    creator_handle: str | None = None
    thumbnail_url: str | None = None
    source_url: str


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

class SaveComponent(BaseModel):
    name: str
    yield_note: str
    ingredients: list[str]
    steps: list[str]
    ingredient_flags: list[AllergenFlag] | None = None


class RecipeSaveRequest(BaseModel):
    title: str
    servings: int | None = None
    kcal_per_serving: int | None = None
    thumbnail_url: str | None = None
    creator_handle: str | None = None
    source_url: str | None = None
    notes: str | None = None
    components: list[SaveComponent]
    tag_ids: list[uuid.UUID] = []
    shared_to_personal: bool = True


class RecipeOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    title: str
    servings: int | None
    kcal_per_serving: int | None
    thumbnail_url: str | None
    creator_handle: str | None
    source_url: str | None
    notes: str | None = None
    components: list[Any]
    created_at: datetime
    tags: list[TagOut] = []
    household_id: uuid.UUID | None = None
    shared_to_personal: bool = True
    added_by: str | None = None


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


class UserPreferencesOut(BaseModel):
    model_config = {"from_attributes": True}

    week_start_day: int
    auto_substitute: bool = False
    personal_allergens: dict | None = None
    language: str = "en"


class UserPreferencesUpdate(BaseModel):
    week_start_day: int | None = None
    auto_substitute: bool | None = None
    personal_allergens: dict | None = None
    language: str | None = None
