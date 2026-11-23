import logging
import uuid

from api.config import settings
from api.services.image_resize import encode_jpeg, open_rgb
from api.services.monitoring import report_service_failure

log = logging.getLogger(__name__)

FULL_WIDTH = 1200
SMALL_WIDTH = 400
SMALL_QUALITY = 80


def _s3_client():
    import boto3
    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint_url,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
    )


def small_key(key: str) -> str:
    stem, dot, ext = key.rpartition(".")
    return f"{stem}_sm{dot}{ext}" if dot else f"{key}_sm"


def upload_image(data: bytes, recipe_id: str) -> str:
    img = open_rgb(data)
    key = f"thumbnails/{recipe_id}/{uuid.uuid4()}.jpg"

    client = _s3_client()
    for object_key, max_width, quality in (
        (key, FULL_WIDTH, 85),
        (small_key(key), SMALL_WIDTH, SMALL_QUALITY),
    ):
        client.put_object(
            Bucket=settings.r2_bucket_name,
            Key=object_key,
            Body=encode_jpeg(img, max_width, quality),
            ContentType="image/jpeg",
        )
    return f"{settings.r2_public_url.rstrip('/')}/{key}"


def delete_image(url: str) -> None:
    if not settings.r2_public_url or not url.startswith(settings.r2_public_url):
        return
    key = url[len(settings.r2_public_url):].lstrip("/")
    client = _s3_client()
    for object_key in (key, small_key(key)):
        try:
            client.delete_object(Bucket=settings.r2_bucket_name, Key=object_key)
        except Exception as exc:
            log.warning("Failed to delete R2 object: %s", type(exc).__name__)
            report_service_failure("image_delete", error=exc)
