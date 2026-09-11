from pathlib import Path
import re
import subprocess

CAR = Path('pristresky-pre-auta/index.html')
GARDEN = Path('zahradne-pristresky/index.html')
CSS = Path('assets/koverta-2026.css')

car = CAR.read_text(encoding='utf-8')
garden = GARDEN.read_text(encoding='utf-8')
css = CSS.read_text(encoding='utf-8')


def section(text: str) -> tuple[int, int, str]:
    anchor = text.index('aria-labelledby="rozTitle"')
    start = text.rfind('<section', 0, anchor)
    end = text.index('</section>', anchor) + len('</section>')
    return start, end, text[start:end]


def catalog_snapshot(sec: str):
    product_urls = re.findall(r'class="kh-size__chip" href="([^"]+)"', sec)
    cfg_urls = re.findall(r'class="kh-size__cfg" href="([^"]+)"', sec)
    options = re.findall(
        r'<a class="kh-size__chip" href="([^"]+)"><span>([^<]+)</span><small>([^<]+)</small></a>',
        sec,
    )
    return product_urls, cfg_urls, options


def replace_once(text: str, old: str, new: str, label: str) -> str:
    n = text.count(old)
    if n != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, got {n}')
    return text.replace(old, new, 1)


car_start, car_end, car_sec = section(car)
garden_start, garden_end, garden_sec = section(garden)
car_before = catalog_snapshot(car_sec)
garden_before = catalog_snapshot(garden_sec)

if len(car_before[0]) != 55:
    raise SystemExit(f'car catalog expected 55 product options, got {len(car_before[0])}')
if len(garden_before[0]) != 12:
    raise SystemExit(f'garden catalog expected 12 product options, got {len(garden_before[0])}')

# ----------------------------- CAR CATALOG
car_sec = replace_once(
    car_sec,
    '<div class="k-rise" data-k-delay="2"><p class="k-copy">Toto sú hotové veľkosti z katalógu. Ak vám žiadna presne nesedí, konštrukciu urobíme na mieru — rozmer je vec výroby, nie výberu z tabuľky.</p></div>',
    '<div class="k-rise" data-k-delay="2"><p class="k-copy">Najprv vyberte počet áut. V každej skupine je šírka vľavo a dostupné dĺžky s cenou vedľa nej.</p></div>',
    'car catalog intro',
)

car_picker = '''
    <nav class="kh-size-pick k-rise" data-k-delay="3" aria-label="Rýchly výber počtu áut">
      <a href="#roz-1-auto"><span>1 auto</span><strong>27 rozmerov</strong><small>od 4 497 €</small></a>
      <a href="#roz-2-auta"><span>2 autá</span><strong>27 rozmerov</strong><small>od 6 497 €</small></a>
      <a href="#roz-3-auta"><span>3 autá</span><strong>1 rozmer</strong><small>od 12 490 €</small></a>
    </nav>
    <p class="kh-size-guide k-rise" data-k-delay="3"><strong>Postup:</strong> počet áut → šírka → dĺžka. Cena je uvedená pod dĺžkou; 3D otvorí konfigurátor konkrétneho rozmeru.</p>
'''
header_end = car_sec.index('</header>') + len('</header>')
car_sec = car_sec[:header_end] + car_picker + car_sec[header_end:]

ids = ['roz-1-auto', 'roz-2-auta', 'roz-3-auta']
seen = 0
pattern = re.compile(r'<div class="kh-size kh-size--foto k-rise" data-k-delay="([^"]+)">')

def car_group(match):
    global seen
    idx = seen
    seen += 1
    extra = ' kh-size--single' if idx == 2 else ''
    return f'<div id="{ids[idx]}" class="kh-size kh-size--foto kh-size--decision{extra} k-rise" data-k-delay="{match.group(1)}">'

car_sec, n = pattern.subn(car_group, car_sec)
if n != 3 or seen != 3:
    raise SystemExit(f'car size groups expected 3, got {n}')

old_car_photo = '<img referrerpolicy="no-referrer" src="https://lh3.googleusercontent.com/d/1hUDXGB-3E31rf71jgKpidlrkq2cGYYJx=w1600" alt="Prístrešok Koverta pre jedno auto pri rodinnom dome" loading="lazy" decoding="async">'
new_car_photo = '<img src="../assets/koverta-pristresok-auto-trnava-sikmy.jpg" width="1600" height="1200" alt="Oceľový prístrešok Koverta pri rodinnom dome v Trnave — šikmý pohľad" loading="lazy" decoding="async">'
car_sec = replace_once(car_sec, old_car_photo, new_car_photo, 'car one-car catalog photo')

old_note = '<p class="kh-size__pozn k-rise">Ceny sú z e-shopu koverta.sk vrátane DPH. V cene je doprava aj montáž, dodanie do ôsmich týždňov. Tlačidlo <strong>3D</strong> otvorí konfigurátor e-shopu. Rozmer mimo katalógu vyrobíme na mieru.</p>'
custom_block = '''<div class="kh-size-custom k-rise">
      <div>
        <p class="kh-size-custom__eyebrow">Rozmer na mieru</p>
        <p class="kh-size-custom__text">Toto sú hotové veľkosti z katalógu. Ak vám žiadna presne nesedí, konštrukciu urobíme na mieru — rozmer je vec výroby, nie výberu z tabuľky.</p>
        <p class="kh-size-custom__note">Ceny sú z e-shopu koverta.sk vrátane DPH. V cene je doprava aj montáž, dodanie do ôsmich týždňov. 3D otvorí konfigurátor konkrétneho katalógového rozmeru.</p>
      </div>
      <a class="k-btn k-btn--line" href="#ponuka">Nezáväzná cenová ponuka <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
    </div>'''
car_sec = replace_once(car_sec, old_note, custom_block, 'car catalog footer')

# ----------------------------- GARDEN CATALOG
garden_sec = replace_once(
    garden_sec,
    '<div class="k-rise" data-k-delay="2"><p class="k-copy">Dvanásť katalógových veľkostí od 3 × 3 do 8 × 4 metra. Väčšie aj atypické riešime na mieru.</p></div>',
    '<div class="k-rise" data-k-delay="2"><p class="k-copy">Dvanásť katalógových veľkostí od 3 × 3 do 8 × 4 metra. Šírka je vľavo, dostupné dĺžky a ceny sú v jej riadku.</p></div>',
    'garden catalog intro',
)

garden_guide = '''
    <p class="kh-size-guide k-rise" data-k-delay="3"><strong>Postup:</strong> nájdite šírku terasy → vyberte dĺžku. Rozmery 7 a 8 m sú v rozbalení nižšie; atypický rozmer vyrábame na mieru.</p>
'''
g_header_end = garden_sec.index('</header>') + len('</header>')
garden_sec = garden_sec[:g_header_end] + garden_guide + garden_sec[g_header_end:]

garden_sec, n = re.subn(
    r'<div class="kh-size kh-size--foto k-rise" data-k-delay="([^"]+)">',
    r'<div id="roz-zahrada" class="kh-size kh-size--foto kh-size--decision k-rise" data-k-delay="\1">',
    garden_sec,
)
if n != 1:
    raise SystemExit(f'garden size groups expected 1, got {n}')

# Keep the unique verified garden catalog photo. Both local Bratislava angles
# are already used on this same page; replacing it with either would create a duplicate.
garden_sec = replace_once(garden_sec, old_note, custom_block, 'garden catalog footer')

# Put modified sections back into pages.
car = car[:car_start] + car_sec + car[car_end:]
garden = garden[:garden_start] + garden_sec + garden[garden_end:]

# Cache-bust only these two pages. Batch 3 did not touch their references.
for label, text in [('car', car), ('garden', garden)]:
    refs = re.findall(r'\.\./assets/koverta-2026\.css\?v=[^"\']+', text)
    if len(refs) != 1:
        raise SystemExit(f'{label}: expected one versioned stylesheet reference, got {refs}')
    text2 = text.replace(refs[0], '../assets/koverta-2026.css?v=2026091104', 1)
    if label == 'car':
        car = text2
    else:
        garden = text2

marker = '/* BATCH 4 · CATALOG SIZE DECISION FLOW */'
if marker in css:
    raise SystemExit('batch 4 CSS marker already present')
css += r'''

/* BATCH 4 · CATALOG SIZE DECISION FLOW */
.k .kh-size-pick {
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:10px;
  margin-top:clamp(24px,3vw,40px);
}
.k .kh-size-pick > a {
  display:grid;
  gap:3px;
  min-width:0;
  padding:16px 18px;
  border:1px solid var(--k-hair);
  border-radius:14px;
  background:var(--k-white);
  box-shadow:var(--k-shadow-xs);
  transition:border-color 180ms var(--k-ease), transform 180ms var(--k-ease), background 180ms var(--k-ease);
}
.k .kh-size-pick > a:hover { border-color:rgba(18,23,26,.28); background:#fffdf5; transform:translateY(-1px); }
.k .kh-size-pick span { font-size:13px; font-weight:700; letter-spacing:.03em; color:var(--k-grey); }
.k .kh-size-pick strong { font-family:var(--k-head); font-size:clamp(18px,1.5vw,22px); line-height:1.15; letter-spacing:-.02em; }
.k .kh-size-pick small { font-size:12px; color:var(--k-muted); }
.k .kh-size-guide {
  margin-top:14px;
  font-size:13px;
  line-height:1.55;
  color:var(--k-muted);
}
.k .kh-size-guide strong { color:var(--k-ink); }
.k .kh-size--decision { scroll-margin-top:110px; }

/* Size is the primary signal. Price is secondary and 3D is a quiet utility. */
.k .kh-size--decision .kh-size__dlzky { gap:10px; }
.k .kh-size--decision .kh-size__kus {
  min-width:0;
  overflow:hidden;
  border:1px solid var(--k-hair);
  border-radius:12px;
  background:var(--k-white);
  box-shadow:none;
  transition:border-color 170ms var(--k-ease), background 170ms var(--k-ease), transform 170ms var(--k-ease);
}
.k .kh-size--decision .kh-size__kus:hover { border-color:rgba(18,23,26,.28); background:#fffdf8; transform:translateY(-1px); }
.k .kh-size--decision .kh-size__chip {
  display:grid;
  align-content:center;
  gap:2px;
  min-width:0;
  min-height:54px;
  padding:8px 10px 8px 12px !important;
  border:0 !important;
  border-radius:0 !important;
  background:transparent !important;
  box-shadow:none !important;
  text-align:left !important;
}
.k .kh-size--decision .kh-size__chip > span {
  font-family:var(--k-head);
  font-size:16px !important;
  font-weight:650;
  line-height:1.15;
  letter-spacing:-.01em;
  color:var(--k-ink);
}
.k .kh-size--decision .kh-size__chip small {
  font-size:11.5px !important;
  font-weight:500;
  line-height:1.25;
  color:var(--k-muted) !important;
}
.k .kh-size--decision .kh-size__cfg {
  min-width:44px;
  min-height:54px;
  padding:0 10px !important;
  border-left:1px solid var(--k-hair) !important;
  font-size:11px !important;
  font-weight:750;
  letter-spacing:.04em;
  color:var(--k-grey) !important;
  background:rgba(246,245,242,.72);
}
.k .kh-size--decision .kh-size__cfg:hover { color:var(--k-ink) !important; background:var(--k-bone); }
.k .kh-size--single .kh-size__dlzky { grid-template-columns:minmax(170px,240px) !important; justify-content:start; }

.k .kh-size-custom {
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  align-items:end;
  gap:24px clamp(28px,4vw,64px);
  margin-top:clamp(28px,4vw,52px);
  padding-top:clamp(24px,3vw,36px);
  border-top:1px solid var(--k-hair);
}
.k .kh-size-custom__eyebrow {
  margin:0 0 8px;
  font-size:12px;
  font-weight:750;
  letter-spacing:.07em;
  text-transform:uppercase;
  color:var(--k-grey);
}
.k .kh-size-custom__text {
  margin:0;
  max-width:72ch;
  font-family:var(--k-head);
  font-size:clamp(18px,1.6vw,23px);
  font-weight:500;
  line-height:1.38;
  letter-spacing:-.015em;
}
.k .kh-size-custom__note { margin:10px 0 0; max-width:76ch; font-size:13px; line-height:1.55; color:var(--k-muted); }
.k .kh-size-custom .k-btn { justify-self:end; white-space:nowrap; }

@media (max-width:819px) {
  .k .kh-size-custom { grid-template-columns:minmax(0,1fr); align-items:start; }
  .k .kh-size-custom .k-btn { justify-self:start; }
}
@media (max-width:619px) {
  .k .kh-size-pick { gap:7px; margin-top:20px; }
  .k .kh-size-pick > a { gap:2px; padding:12px 10px; border-radius:12px; }
  .k .kh-size-pick span { font-size:11.5px; }
  .k .kh-size-pick strong { font-size:15px; }
  .k .kh-size-pick small { font-size:10.5px; }
  .k .kh-size--decision .kh-size__dlzky { grid-template-columns:repeat(2,minmax(0,1fr)) !important; gap:7px; }
  .k .kh-size--decision .kh-size__chip { min-height:56px; padding:8px 8px 8px 10px !important; }
  .k .kh-size--decision .kh-size__chip > span { font-size:14px !important; }
  .k .kh-size--decision .kh-size__chip small { font-size:10.5px !important; }
  .k .kh-size--decision .kh-size__cfg { min-width:44px; min-height:56px; padding:0 7px !important; font-size:10px !important; }
  .k .kh-size--single .kh-size__dlzky { grid-template-columns:minmax(0,1fr) !important; }
  .k .kh-size-custom .k-btn { width:100%; }
}
@media (max-width:359px) {
  .k .kh-size--decision .kh-size__dlzky { grid-template-columns:minmax(0,1fr) !important; }
}
'''

CAR.write_text(car, encoding='utf-8')
GARDEN.write_text(garden, encoding='utf-8')
CSS.write_text(css, encoding='utf-8')

# Hard postconditions: no catalog data drift.
_, _, car_after_sec = section(CAR.read_text(encoding='utf-8'))
_, _, garden_after_sec = section(GARDEN.read_text(encoding='utf-8'))
if catalog_snapshot(car_after_sec) != car_before:
    raise SystemExit('car catalog product/configurator URLs or option prices changed')
if catalog_snapshot(garden_after_sec) != garden_before:
    raise SystemExit('garden catalog product/configurator URLs or option prices changed')

if car_after_sec.count('class="kh-size kh-size--foto kh-size--decision') != 3:
    raise SystemExit('car decision group count changed')
if garden_after_sec.count('class="kh-size kh-size--foto kh-size--decision') != 1:
    raise SystemExit('garden decision group count changed')
for token in ['id="roz-1-auto"', 'id="roz-2-auta"', 'id="roz-3-auta"', 'koverta-pristresok-auto-trnava-sikmy.jpg', 'Toto sú hotové veľkosti z katalógu.']:
    if token not in car_after_sec:
        raise SystemExit('missing car postcondition: ' + token)
for token in ['id="roz-zahrada"', 'Toto sú hotové veľkosti z katalógu.']:
    if token not in garden_after_sec:
        raise SystemExit('missing garden postcondition: ' + token)
if marker not in CSS.read_text(encoding='utf-8'):
    raise SystemExit('missing batch 4 CSS marker')

changed = set(subprocess.check_output(['git', 'diff', '--name-only'], text=True).splitlines())
expected = {'pristresky-pre-auta/index.html', 'zahradne-pristresky/index.html', 'assets/koverta-2026.css'}
if changed != expected:
    raise SystemExit(f'unexpected batch 4 scope: {sorted(changed)}')
