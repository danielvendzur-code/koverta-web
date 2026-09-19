# -*- coding: utf-8 -*-
"""Spočíta z-fighting bodky na lemovaní prístrešku Koverta.

Prečo číslo a nie oko: „bodky zmizli" je tvrdenie, ktoré sa nedá overiť ani
zopakovať. Tento skript vykreslí prístrešok zo štyroch pohľadov a v tmavej
ploche lemovania nájde pixely výrazne jasnejšie než ich najbližšie okolie.
Hladký tieň má voči okoliu malý rozdiel, presvitajúca hrana trapézu veľký.

Použitie:
    python3 -m http.server 8901 &
    node tools/render-lem.js          # vykreslí PNG do qa-artifacts/lem-*.png
    python3 tools/bodky-na-leme.py qa-artifacts/lem-*.png

Výsledok je počet bodiek na 10 000 pixelov lemovania. Nula znamená čistý lem.
Namerané na commite e4d358d (pred Codexovým orezom): roh 127,8; zhora 54,8;
spredu 14,8; zdola 0,2.
"""
from PIL import Image
import numpy as np
import sys

PRAH = 12        # o koľko musí byť pixel jasnejší než okolie
POLOMER = 4      # polomer okolia v pixeloch
LEM_JAS = 80     # nad týmto jasom to už nie je lemovanie


def boxmean(a, r):
    """Priemer v okne (2r+1)². Cez kumulatívny súčet, bez scipy."""
    p = np.pad(a, r, mode='edge')
    c = np.pad(p.cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    k = 2 * r + 1
    H, W = a.shape
    return (c[k:k + H, k:k + W] - c[0:H, k:k + W]
            - c[k:k + H, 0:W] + c[0:H, 0:W]) / (k * k)


def zmeraj(cesta):
    lum = np.asarray(Image.open(cesta).convert('RGB')).astype(float).mean(axis=2)
    tmave = lum < LEM_JAS
    # erózia: zahodí antialiasovaný okraj lemu, inak by sa rátal ako bodka
    vnutro = tmave.copy()
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            vnutro &= np.roll(np.roll(tmave, dy, 0), dx, 1)
    body = vnutro & ((lum - boxmean(lum, POLOMER)) > PRAH)
    plocha = int(vnutro.sum())
    return plocha, int(body.sum()), (10000 * int(body.sum()) / plocha if plocha else 0.0)


if __name__ == '__main__':
    najhorsi = 0.0
    for cesta in sys.argv[1:]:
        plocha, poc, hustota = zmeraj(cesta)
        najhorsi = max(najhorsi, hustota)
        print(f'{cesta:44s} lem {plocha:7d} px | bodky {poc:6d} | {hustota:6.1f} na 10 000 px')
    print(f'\nnajhoršia hustota: {najhorsi:.1f} na 10 000 px')
    sys.exit(1 if najhorsi > 1.0 else 0)
