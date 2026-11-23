import io

from PIL import Image
from pillow_heif import register_heif_opener

register_heif_opener()


def open_rgb(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    return img if img.mode == "RGB" else img.convert("RGB")


def encode_jpeg(img: Image.Image, max_width: int, quality: int) -> bytes:
    if img.width > max_width:
        img = img.resize((max_width, max(1, int(img.height * max_width / img.width))), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def resize_jpeg(data: bytes, max_width: int, quality: int) -> bytes:
    return encode_jpeg(open_rgb(data), max_width, quality)
