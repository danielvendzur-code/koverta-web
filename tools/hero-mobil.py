#!/usr/bin/env python3
"""Menšie varianty rovnakého mobilného hero, bez zmeny výrezu alebo farieb."""
from pathlib import Path
from PIL import Image

assets = Path(__file__).resolve().parent.parent / 'assets'
with Image.open(assets / 'koverta-hero-sibenik-poster-mobil.webp') as source:
    for width in (480, 800):
        height = round(source.height * width / source.width)
        target = assets / f'koverta-hero-sibenik-poster-mobil-w{width}.webp'
        source.resize((width, height), Image.Resampling.LANCZOS).save(target, quality=82, method=6)
        print(f'{target.name}: {target.stat().st_size} B')
