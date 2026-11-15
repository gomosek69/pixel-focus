#!/usr/bin/env python3
"""Сравнить две папки со снимками экранов (см. tests/shots.js).

    python3 tests/diff.py <папка-до> <папка-после> [папка-для-картинок-различий]

Печатает по каждому файлу долю отличающихся пикселей. Код выхода 1, если есть отличия.
"""
import os
import sys
from PIL import Image, ImageChops

a, b = sys.argv[1], sys.argv[2]
out = sys.argv[3] if len(sys.argv) > 3 else None
bad = 0
for name in sorted(os.listdir(a)):
    pa, pb = os.path.join(a, name), os.path.join(b, name)
    if not name.endswith('.png'):
        continue
    if not os.path.exists(pb):
        print(f'{name}: нет во второй папке')
        bad += 1
        continue
    ia, ib = Image.open(pa).convert('RGB'), Image.open(pb).convert('RGB')
    if ia.size != ib.size:
        print(f'{name}: разный размер {ia.size} и {ib.size}')
        bad += 1
        w, h = min(ia.width, ib.width), min(ia.height, ib.height)
        ia, ib = ia.crop((0, 0, w, h)), ib.crop((0, 0, w, h))
    diff = ImageChops.difference(ia, ib).convert('L')
    hist = diff.histogram()
    changed = sum(hist[9:])          # заметные отличия (больше 8 из 255)
    total = ia.width * ia.height
    if changed:
        bad += 1
        box = diff.point(lambda v: 255 if v > 8 else 0).getbbox()
        print(f'{name}: {changed} пикс. ({changed * 100 / total:.2f}%), область {box}')
        if out:
            os.makedirs(out, exist_ok=True)
            mark = Image.blend(ia, Image.new('RGB', ia.size, (255, 0, 255)), 0.0)
            mask = diff.point(lambda v: 255 if v > 8 else 0)
            mark.paste((255, 0, 255), mask=mask)
            mark.save(os.path.join(out, name))
    else:
        print(f'{name}: одинаково')
sys.exit(1 if bad else 0)
