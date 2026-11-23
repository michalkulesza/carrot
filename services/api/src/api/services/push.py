from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import async_session_maker
from api.models import DeviceSubscription, UserPreferences
from api.services import apns as apns_svc
from api.services.apns import PushResult

log = logging.getLogger(__name__)

DEFAULT_LANGUAGE = "en"

PUSH_STRINGS: dict[str, dict[str, str]] = {
    "import_succeeded_title": {
        "en": "Recipe added", "pl": "Przepis dodany", "de": "Rezept hinzugefügt",
        "fr": "Recette ajoutée", "es": "Receta añadida", "it": "Ricetta aggiunta", "pt": "Receita adicionada",
    },
    "import_succeeded_body": {
        "en": "Tap to view your new recipe.", "pl": "Dotknij, aby zobaczyć nowy przepis.",
        "de": "Tippe, um dein neues Rezept anzusehen.", "fr": "Touchez pour voir votre nouvelle recette.",
        "es": "Toca para ver tu nueva receta.", "it": "Tocca per vedere la tua nuova ricetta.",
        "pt": "Toque para ver a sua nova receita.",
    },
    "import_duplicate_title": {
        "en": "Already in your library", "pl": "Już w Twojej bibliotece", "de": "Bereits in deiner Bibliothek",
        "fr": "Déjà dans votre bibliothèque", "es": "Ya está en tu biblioteca", "it": "Già nella tua libreria",
        "pt": "Já está na sua biblioteca",
    },
    "import_duplicate_body": {
        "en": "Tap to review the import.", "pl": "Dotknij, aby sprawdzić import.",
        "de": "Tippe, um den Import zu prüfen.", "fr": "Touchez pour vérifier l'importation.",
        "es": "Toca para revisar la importación.", "it": "Tocca per rivedere l'importazione.",
        "pt": "Toque para rever a importação.",
    },
    "import_user_action_title": {
        "en": "Couldn't import automatically", "pl": "Nie udało się zaimportować automatycznie",
        "de": "Automatischer Import nicht möglich", "fr": "Importation automatique impossible",
        "es": "No se pudo importar automáticamente", "it": "Impossibile importare automaticamente",
        "pt": "Não foi possível importar automaticamente",
    },
    "import_user_action_body": {
        "en": "Open the import to continue manually.", "pl": "Otwórz import, aby kontynuować ręcznie.",
        "de": "Öffne den Import, um manuell fortzufahren.", "fr": "Ouvrez l'importation pour continuer manuellement.",
        "es": "Abre la importación para continuar manualmente.", "it": "Apri l'importazione per continuare manualmente.",
        "pt": "Abra a importação para continuar manualmente.",
    },
    "import_failed_title": {
        "en": "Couldn't add recipe", "pl": "Nie udało się dodać przepisu", "de": "Rezept konnte nicht hinzugefügt werden",
        "fr": "Impossible d'ajouter la recette", "es": "No se pudo añadir la receta",
        "it": "Impossibile aggiungere la ricetta", "pt": "Não foi possível adicionar a receita",
    },
    "import_failed_body": {
        "en": "Tap to see the failed import.", "pl": "Dotknij, aby zobaczyć nieudany import.",
        "de": "Tippe, um den fehlgeschlagenen Import zu sehen.", "fr": "Touchez pour voir l'importation échouée.",
        "es": "Toca para ver la importación fallida.", "it": "Tocca per vedere l'importazione non riuscita.",
        "pt": "Toque para ver a importação falhada.",
    },
    "household_invitation_title": {
        "en": "Household invitation", "pl": "Zaproszenie do gospodarstwa", "de": "Einladung zum Haushalt",
        "fr": "Invitation au foyer", "es": "Invitación al hogar", "it": "Invito alla famiglia", "pt": "Convite para o agregado",
    },
    "household_invitation_body": {
        "en": "{inviter} invited you to join {household}.", "pl": "{inviter} zaprasza Cię do {household}.",
        "de": "{inviter} hat dich zu {household} eingeladen.", "fr": "{inviter} vous invite à rejoindre {household}.",
        "es": "{inviter} te invitó a unirte a {household}.", "it": "{inviter} ti ha invitato a unirti a {household}.",
        "pt": "{inviter} convidou-o para {household}.",
    },
    "member_left_title": {
        "en": "Member left", "pl": "Członek odszedł", "de": "Mitglied hat den Haushalt verlassen",
        "fr": "Un membre est parti", "es": "Un miembro se fue", "it": "Un membro se n'è andato", "pt": "Um membro saiu",
    },
    "member_left_body": {
        "en": "{name} left {household}.", "pl": "{name} opuścił(a) {household}.", "de": "{name} hat {household} verlassen.",
        "fr": "{name} a quitté {household}.", "es": "{name} dejó {household}.", "it": "{name} ha lasciato {household}.",
        "pt": "{name} saiu de {household}.",
    },
}


@dataclass(frozen=True)
class DeliveryOutcome:
    sent: int = 0
    failed: int = 0

    @property
    def should_retry(self) -> bool:
        return self.sent == 0 and self.failed > 0


def localize(key: str, language: str | None, params: dict[str, Any] | None = None) -> str:
    variants = PUSH_STRINGS[key]
    template = variants.get(language or DEFAULT_LANGUAGE) or variants[DEFAULT_LANGUAGE]
    return template.format(**(params or {}))


async def _user_language(db: AsyncSession, user_id: uuid.UUID) -> str:
    language = await db.scalar(select(UserPreferences.language).where(UserPreferences.user_id == user_id))
    return language or DEFAULT_LANGUAGE


async def _subscriptions(db: AsyncSession, user_id: uuid.UUID) -> list[DeviceSubscription]:
    return list((await db.scalars(select(DeviceSubscription).where(DeviceSubscription.user_id == user_id))).all())


async def _deliver(db: AsyncSession, subscriptions: list[DeviceSubscription], send) -> DeliveryOutcome:
    sent = failed = 0
    dead_ids: list[uuid.UUID] = []
    for subscription in subscriptions:
        result = await send(subscription.token)
        if result == PushResult.SENT:
            sent += 1
        elif result == PushResult.DEAD_TOKEN:
            dead_ids.append(subscription.id)
        elif result == PushResult.FAILED:
            failed += 1
    if dead_ids:
        await db.execute(delete(DeviceSubscription).where(DeviceSubscription.id.in_(dead_ids)))
    return DeliveryOutcome(sent=sent, failed=failed)


async def notify_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    kind: str,
    title_key: str,
    body_key: str,
    params: dict[str, Any] | None = None,
    data: dict[str, Any] | None = None,
    collapse_id: str,
    thread_id: str,
) -> DeliveryOutcome:
    subscriptions = await _subscriptions(db, user_id)
    if not subscriptions:
        return DeliveryOutcome()

    language = await _user_language(db, user_id)
    title = localize(title_key, language, params)
    body = localize(body_key, language, params)
    payload = {**(data or {}), "type": kind, "collapse_id": collapse_id}

    async def send(token: str) -> PushResult:
        return await apns_svc.send_alert(token, title, body, payload, collapse_id=collapse_id, thread_id=thread_id)

    return await _deliver(db, subscriptions, send)


async def retract(db: AsyncSession, user_id: uuid.UUID, *, collapse_id: str) -> DeliveryOutcome:
    subscriptions = await _subscriptions(db, user_id)
    if not subscriptions:
        return DeliveryOutcome()

    payload = {"type": "retract", "collapse_id": collapse_id}

    async def send(token: str) -> PushResult:
        return await apns_svc.send_background(token, payload)

    return await _deliver(db, subscriptions, send)


async def notify_user_in_background(user_id: uuid.UUID, **kwargs: Any) -> None:
    try:
        async with async_session_maker() as db:
            await notify_user(db, user_id, **kwargs)
            await db.commit()
    except Exception as error:
        log.warning("Background push failed: %s", type(error).__name__)


async def retract_in_background(user_id: uuid.UUID, *, collapse_id: str) -> None:
    try:
        async with async_session_maker() as db:
            await retract(db, user_id, collapse_id=collapse_id)
            await db.commit()
    except Exception as error:
        log.warning("Background retract failed: %s", type(error).__name__)
