from pathlib import Path
import re, json, subprocess

car=Path('carport-soltec/index.html')
can=Path('pevne-prestresenia/index.html')
css=Path('assets/koverta-2026.css')
c=car.read_text(encoding='utf-8')
p=can.read_text(encoding='utf-8')
s=css.read_text(encoding='utf-8')

def section(text, sid):
    i=text.index(f'id="{sid}"')
    a=text.rfind('<section',0,i); b=text.index('</section>',i)+10
    return text[a:b]

def snap(text,sid):
    out=[]
    for m in re.finditer(r'<article class="k-model-card[^>]*>(.*?)</article>',section(text,sid),re.S):
        h=m.group(1)
        code=re.search(r'k-model-card__code">([^<]+)',h)
        facts=re.findall(r'<dt>([^<]+)</dt><dd>([^<]+)</dd>',h)
        out.append([code.group(1).strip() if code else '',facts])
    return out
before={'car':snap(c,'modely-carport'),'can':snap(p,'typy-prestresenia')}

old='<p class="k-copy"><strong>SL 170 je pre jedno auto.</strong> <strong>SL 240 je pre dve autá.</strong> Box je samostatný doplnok a do základného porovnania modelov ho nemiešame.</p>'
new='<p class="k-copy"><strong>SL 170 je pre jedno auto.</strong> <strong>SL 240 je pre dve autá.</strong> Oba používajú 30 mm ISO panel; spád môže byť podľa zostavy skrytý alebo priznaný a voda odchádza v stĺpoch. Box, boky, osvetlenie a zásuvka v stĺpe sú doplnky.</p>'
if c.count(old)!=1: raise SystemExit('carport header copy anchor drift')
c=c.replace(old,new,1)

anchor='<div class="k-model-grid k-model-grid--2">'
strip='''<div class="k-model-system" aria-label="Spoločné vlastnosti radu SL">
      <div><span>Strecha</span><strong>ISO panel 30 mm</strong></div>
      <div><span>Spád</span><strong>skrytý alebo priznaný</strong></div>
      <div><span>Odvodnenie</span><strong>vedené v stĺpoch</strong></div>
      <div><span>Doplnky</span><strong>box · boky · LED · zásuvka</strong></div>
    </div>
    <div class="k-model-grid k-model-grid--2">'''
i=c.index('id="modely-carport"'); j=c.index(anchor,i)
c=c[:j]+c[j:].replace(anchor,strip,1)

old='<span class="k-model-card__code">SL 170</span><span class="k-model-card__use">1 auto</span></div><h3>Úspornejší pôdorys pre jedno auto</h3>'
new=old+'<p class="k-model-card__lead">Jedno kryté státie bez zbytočnej šírky navyše.</p>'
if c.count(old)!=1: raise SystemExit('SL170 card anchor drift')
c=c.replace(old,new,1)
old='<span class="k-model-card__code">SL 240</span><span class="k-model-card__use">2 autá</span></div><h3>Širší systém pre dve autá</h3>'
new=old+'<p class="k-model-card__lead">Dve vozidlá vedľa seba alebo širšia zostava s doplnkami.</p>'
if c.count(old)!=1: raise SystemExit('SL240 card anchor drift')
c=c.replace(old,new,1)

old='<div class="k-model-note k-rise" data-k-delay="3"><strong>Box sa rieši samostatne.</strong><span>Jeho poloha a nadväzujúce prvky sa majú zahrnúť už do návrhu konkrétnej zostavy.</span></div>'
new='<div class="k-model-note k-rise" data-k-delay="3"><strong>Doplnky riešte už pri návrhu.</strong><span>Box, bočné výplne, osvetlenie a zásuvka v stĺpe menia konkrétnu zostavu; box nie je tretí model a jeho polohu je najlepšie určiť pred objednávkou.</span></div>'
if c.count(old)!=1: raise SystemExit('carport note anchor drift')
c=c.replace(old,new,1)

old='<p class="k-copy"><strong>F používa ISO panel.</strong> <strong>G je pre sklo alebo zelenú strechu.</strong> Štyri modely sú zobrazené priamo, bez širokej technickej tabuľky.</p>'
new='<p class="k-copy"><strong>F používa 30 mm ISO panel — lacnejšiu strešnú výplň než sklo.</strong> <strong>G je pre sklo alebo zelenú strechu.</strong> Najprv zvoľte typ strechy, potom model podľa potrebného rozponu.</p>'
if p.count(old)!=1: raise SystemExit('canopy header anchor drift')
p=p.replace(old,new,1)
old='<div class="k-model-family__head"><span>Rad F</span><p>ISO panel 30 mm, maximálna výška 2,8 m.</p></div>'
new='<div class="k-model-family__head"><div><span>Rad F</span><strong>Praktickejšia voľba s nepriehľadnou strechou</strong></div><p>ISO panel 30 mm · lacnejšia strešná výplň než sklo · max. výška 2,8 m.</p></div>'
if p.count(old)!=1: raise SystemExit('F family anchor drift')
p=p.replace(old,new,1)
old='<div class="k-model-family__head"><span>Rad G</span><p>Sklo alebo zelená strecha, maximálna výška 3,0 m.</p></div>'
new='<div class="k-model-family__head"><div><span>Rad G</span><strong>Keď chcete svetlo alebo zelenú strechu</strong></div><p>Sklo alebo zelená strecha · pri skle vyššia cena výplne než pri ISO paneli · max. výška 3,0 m.</p></div>'
if p.count(old)!=1: raise SystemExit('G family anchor drift')
p=p.replace(old,new,1)

marker='/* BATCH7 SOLTEC MODEL DECISION 20260911 */'
if marker in s: raise SystemExit('batch7 CSS already present')
s += '''\n\n/* BATCH7 SOLTEC MODEL DECISION 20260911 */
.k-model-system { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:0; margin:0 0 18px; border-block:1px solid rgba(18,23,26,.16); }
.k-model-system > div { min-width:0; padding:16px 18px; border-left:1px solid rgba(18,23,26,.12); }
.k-model-system > div:first-child { border-left:0; padding-left:0; }
.k-model-system span { display:block; margin-bottom:5px; color:#6b7275; font-size:12px; font-weight:650; letter-spacing:.02em; }
.k-model-system strong { display:block; font-size:15px; line-height:1.35; }
.k-model-card__lead { margin:-10px 0 20px; color:#646c70; font-size:14.5px; line-height:1.5; }
.k-model-family__head > div { display:grid; gap:7px; }
.k-model-family__head > div > span { font-size:clamp(28px,3vw,44px); line-height:.95; font-weight:780; letter-spacing:-.035em; }
.k-model-family__head > div > strong { font-size:15px; line-height:1.35; font-weight:700; }
@media (max-width:719px) {
  .k-model-system { grid-template-columns:1fr 1fr; }
  .k-model-system > div { padding:13px 12px; border-left:0; border-top:1px solid rgba(18,23,26,.1); }
  .k-model-system > div:nth-child(-n+2) { border-top:0; }
  .k-model-system > div:nth-child(odd) { padding-left:0; border-right:1px solid rgba(18,23,26,.1); }
  .k-model-family__head > div > strong { font-size:14px; }
}
'''

car.write_text(c,encoding='utf-8'); can.write_text(p,encoding='utf-8'); css.write_text(s,encoding='utf-8')
after={'car':snap(c,'modely-carport'),'can':snap(p,'typy-prestresenia')}
if before!=after: raise SystemExit('technical model facts changed')

ver='2026091107'
for path in sorted(Path('.').rglob('*.html')):
    if any(part in {'.git','node_modules','qa','artifacts'} for part in path.parts): continue
    t=path.read_text(encoding='utf-8')
    if 'koverta-2026.css' not in t: continue
    n=re.sub(r'(koverta-2026\.css)(?:\?v=[^"\'<>\s]*)?',rf'\1?v={ver}',t)
    if n!=t: path.write_text(n,encoding='utf-8')

names=set(subprocess.check_output(['git','diff','--name-only'],text=True).splitlines())
required={'carport-soltec/index.html','pevne-prestresenia/index.html','assets/koverta-2026.css'}
if not required.issubset(names): raise SystemExit('missing required scope')
if any(x not in required and not x.endswith('.html') for x in names): raise SystemExit('unexpected scope: '+str(names))
