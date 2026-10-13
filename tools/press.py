"""Материалы пресс-кита: кадры витрины, иконка и архивы.

    python3 tools/press.py

Кадры – из витрины App Store в репозитории игры (`Tilefold/design/store`):
восемь кадров iPhone и два iPad на английском и русском. На страницу идут
превью WebP, в архив и по ссылке – JPEG. Архив держим около 3 МБ: у Capsla
архив в 17 МБ однажды уронил выкладку на Cloudflare.
"""

import zipfile
from pathlib import Path

from PIL import Image

STORE = Path(__file__).resolve().parents[2] / "Tilefold" / "design" / "store"
OUT = Path(__file__).resolve().parents[1] / "src" / "static" / "press"
ICON = Path(__file__).resolve().parents[1] / "src" / "static" / "press-icon-1024.png"

LANGUAGES = ["en", "ru"]
IPHONE = range(1, 9)
IPAD = (1, 2)
JPEG_WIDTH = {"iphone": 1290, "ipad": 1600}
THUMB_WIDTH = 480
ZIP_LIMIT = 3.2 * 1024 * 1024


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    icon = OUT / "tilefold-icon-1024.png"
    if ICON.exists():
        ICON.replace(icon)

    for language in LANGUAGES:
        folder = OUT / language
        thumbs = folder / "thumbs"
        thumbs.mkdir(parents=True, exist_ok=True)
        files = []
        for device, numbers in (("iphone", IPHONE), ("ipad", IPAD)):
            for n in numbers:
                image = Image.open(STORE / f"{language}-{device}-{n}.png").convert("RGB")
                width = JPEG_WIDTH[device]
                big = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
                name = f"tilefold-{device}-{n}.jpg"
                big.save(folder / name, quality=80, optimize=True, progressive=True)
                small = image.resize((THUMB_WIDTH, round(image.height * THUMB_WIDTH / image.width)), Image.LANCZOS)
                small.save(thumbs / f"tilefold-{device}-{n}.webp", quality=78, method=6)
                files.append(folder / name)

        archive = OUT / f"tilefold-press-kit-{language}.zip"
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_STORED) as z:
            z.write(icon, f"Tilefold/{icon.name}")
            for f in files:
                z.write(f, f"Tilefold/screenshots/{f.name}")
        size = archive.stat().st_size
        print(f"{archive.name}: {size / 1024 / 1024:.1f} MB")
        if size > ZIP_LIMIT:
            raise SystemExit(f"{archive.name} больше {ZIP_LIMIT / 1024 / 1024:.1f} МБ")


if __name__ == "__main__":
    main()
