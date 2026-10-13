"""Скриншоты для секций сайта – из витрины App Store.

    python3 tools/shots.py

Витрина собирается в репозитории игры (`Scripts/screenshots/shoot.py`) и
лежит в `Tilefold/design/store/<язык>-iphone-<номер>.png`: подпись сверху,
под ней экран в рамке. Здесь вырезается только экран – по той же рамке,
что в `Scripts/screenshots/layout.py`, со скруглёнными прозрачными углами.
Рамку телефона рисует сайт, подпись дают секции.

Кадры витрины: 1 доска, 2 этюд, 3 подсказка, 4 разбор, 5 задача дня,
6 палитры, 7 статистика, 8 размеры доски.
"""

from pathlib import Path

from PIL import Image, ImageDraw

STORE = Path(__file__).resolve().parents[2] / "Tilefold" / "design" / "store"
OUT = Path(__file__).resolve().parents[1] / "src" / "assets" / "shots"

# Рамка экрана на холсте iPhone – как DEVICE["iphone"] и CORNER["iphone"]
# в Scripts/screenshots/layout.py.
SCREEN = (143, 490, 143 + 1003, 490 + 2179)
CORNER = 118
WIDTH = 720

FRAMES = {1: "board", 2: "etude", 3: "hint", 4: "review", 5: "daily", 6: "palettes", 7: "statistics", 8: "sizes"}
LANGUAGES = ["en", "ru", "uk", "ar", "de", "es", "fr", "hi", "id", "it", "ja", "ko", "pt-BR", "tr", "vi", "zh-Hans", "zh-Hant"]


def main() -> None:
    mask = Image.new("L", (SCREEN[2] - SCREEN[0], SCREEN[3] - SCREEN[1]), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, mask.width - 1, mask.height - 1), radius=CORNER, fill=255)
    height = round(mask.height * WIDTH / mask.width)

    for language in LANGUAGES:
        folder = OUT / language.lower()
        folder.mkdir(parents=True, exist_ok=True)
        for number, name in FRAMES.items():
            source = STORE / f"{language}-iphone-{number}.png"
            screen = Image.open(source).convert("RGBA").crop(SCREEN)
            screen.putalpha(mask)
            screen.resize((WIDTH, height), Image.LANCZOS).save(folder / f"{name}.webp", quality=82, method=6)
        print(language)


if __name__ == "__main__":
    main()
