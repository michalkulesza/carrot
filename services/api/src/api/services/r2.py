import io
import logging
import uuid

from api.config import settings

log = logging.getLogger(__name__)


def _s3_client():
    import boto3
    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint_url,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
    )


def upload_image(data: bytes, recipe_id: str) -> str:
    from PIL import Image
    from pillow_heif import register_heif_opener
    register_heif_opener()

    img = Image.open(io.BytesIO(data))
    if img.mode != "RGB":
        img = img.convert("RGB")
    if img.width > 1200:
        ratio = 1200 / img.width
        img = img.resize((1200, int(img.height * ratio)), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)

    key = f"thumbnails/{recipe_id}/{uuid.uuid4()}.jpg"
    _s3_client().put_object(
        Bucket=settings.r2_bucket_name,
        Key=key,
        Body=buf.getvalue(),
        ContentType="image/jpeg",
    )
    return f"{settings.r2_public_url.rstrip('/')}/{key}"


def delete_image(url: str) -> None:
    if not settings.r2_public_url or not url.startswith(settings.r2_public_url):
        return
    key = url[len(settings.r2_public_url):].lstrip("/")
    try:
        _s3_client().delete_object(Bucket=settings.r2_bucket_name, Key=key)
    except Exception as exc:
        log.warning("Failed to delete R2 object %s: %s", key, exc)
