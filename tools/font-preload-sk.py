"""Slovenský web prednačíta len latin a rovnaké slovenské glyfy.
Pôvodný latin-ext ostáva v CSS aj v assets pre ďalšie jazyky."""
from pathlib import Path
import re
root=Path(__file__).resolve().parent.parent
count=0
for page in root.rglob('*.html'):
    if any(p in page.parts for p in ['node_modules','.git','shopify-tema','archiv-expivi','qa-artifacts']): continue
    text=page.read_text()
    changed=re.sub(r'<link\b[^>]*>', lambda m: m[0].replace('archivo-latin-ext-v2.woff2','archivo-sk-v3.woff2') if 'rel="preload"' in m[0] and 'as="font"' in m[0] else m[0],text)
    if changed!=text:page.write_text(changed);count+=1
print('Slovenský font v prednačítaní:',count,'stránok')
