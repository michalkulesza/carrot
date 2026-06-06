from __future__ import annotations

import uuid
from datetime import date as DateType, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel
from sqlalchemy import JSON, Boolean, Column, Date, ForeignKey, Integer, String, DateTime, Table, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from api.database import Base


# ── Association table ─────────────────────────────────────────────────────────

recipe_tags_table = Table(
    "recipe_tags",
    Base.metadata,
    Column("recipe_id", PG_UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", PG_UUID(as_uuid=True), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


# ── SQLAlchemy tag model ──────────────────────────────────────────────────────

class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(30), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)


# ── SQLAlchemy recipe model ───────────────────────────────────────────────────

class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    servings: Mapped[int | None] = mapped_column(nullable=True)
    kcal_per_serving: Mapped[int | None] = mapped_column(nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String, nullable=True)
    creator_handle: Mapped[str | None] = mapped_column(String(50), nullable=True)
    components: Mapped[list[Any]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    tags: Mapped[list[Tag]] = relationship("Tag", secondary=recipe_tags_table, lazy="selectin")


# ── Gemini extraction schema ──────────────────────────────────────────────────

class Ingredient(BaseModel):
    qty: str | None = None
    unit: str | None = None
    name: str
    note: str | None = None


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


class TagCreate(BaseModel):
    name: str


# ── Recipe save / list ────────────────────────────────────────────────────────

class SaveComponent(BaseModel):
    name: str
    yield_note: str
    ingredients: list[str]
    steps: list[str]


class RecipeSaveRequest(BaseModel):
    title: str
    servings: int | None = None
    kcal_per_serving: int | None = None
    thumbnail_url: str | None = None
    creator_handle: str | None = None
    components: list[SaveComponent]
    tag_ids: list[uuid.UUID] = []


class RecipeOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    title: str
    servings: int | None
    kcal_per_serving: int | None
    thumbnail_url: str | None
    creator_handle: str | None
    components: list[Any]
    created_at: datetime
    tags: list[TagOut] = []


# ── Meal Plan ─────────────────────────────────────────────────────────────────

class MealPlanEntry(Base):
    __tablename__ = "meal_plan_entries"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_meal_plan_user_date"),)

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    date: Mapped[DateType] = mapped_column(Date, nullable=False)
    recipe_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False)
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

    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    week_start_day: Mapped[int] = mapped_column(Integer, default=1, nullable=False)


class UserPreferencesOut(BaseModel):
    model_config = {"from_attributes": True}

    week_start_day: int


class UserPreferencesUpdate(BaseModel):
    week_start_day: int
