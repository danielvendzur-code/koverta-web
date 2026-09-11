from pathlib import Path
import subprocess

kitchen_path = Path('outdoor-kuchyne/index.html')
shade_path = Path('tienenie/index.html')
css_path = Path('assets/koverta-2026.css')
kitchen = kitchen_path.read_text(encoding='utf-8')
shade = shade_path.read_text(encoding='utf-8')
css = css_path.read_text(encoding='utf-8')


def one_replace(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    return text.replace(old, new, 1)


kitchen = one_replace(
    kitchen,
    '<p class="k-copy">Chef je kuchyňa, Station grilovacia stanica. Postavia sa vedľa seba aj samostatne.</p>',
    '<p class="k-copy">Chef Grand a Classic majú pracovnú výšku 92 cm, Station Compact a Mini 67 cm. Všetky štyri moduly majú hĺbku 70 cm; šírka jednotlivých modelov ide od 65 do 303 cm.</p>',
    'kitchen model intro',
)

kitchen_specs = '''<div class="kh-kitchen-specs k-rise" data-k-delay="2" aria-label="Rozmery modelov Soltec Outdoor Kitchen">
      <div class="kh-kitchen-spec"><span>Chef Grand 3.0</span><strong>303 × 70 × 92 cm</strong><small>najväčší modul</small></div>
      <div class="kh-kitchen-spec"><span>Chef Classic 2.1</span><strong>213 × 70 × 92 cm</strong><small>plná pracovná výška</small></div>
      <div class="kh-kitchen-spec"><span>Station Compact 0,9</span><strong>95 × 70 × 67 cm</strong><small>kompaktná stanica</small></div>
      <div class="kh-kitchen-spec"><span>Station Mini 0,6</span><strong>65 × 70 × 67 cm</strong><small>najmenší modul</small></div>
    </div>

    <div class="kh-modul__mieru kh-modul__mieru--refined k-rise" data-k-delay="2">'''
kitchen = one_replace(kitchen, '<div class="kh-modul__mieru k-rise" data-k-delay="2">', kitchen_specs, 'kitchen specs anchor')
kitchen = one_replace(kitchen, '<ul class="kh-vyb k-rise" data-k-delay="2">', '<ul class="kh-vyb kh-kitchen-facts k-rise" data-k-delay="2">\n      <li><strong>ALU</strong><span>ľahká konštrukcia a kompozitný obklad do exteriéru</span></li>', 'kitchen facts class')
kitchen = one_replace(kitchen, '<li><strong>20 mm</strong><span>kamenná doska s odkvapkávacou hranou</span></li>', '<li><strong>20 mm</strong><span>technický kameň s odkvapkávacou hranou</span></li>', 'kitchen stone')
kitchen = one_replace(kitchen, '<li><strong>Blum</strong><span>zásuvky s jemným dotvorením</span></li>', '<li><strong>BLUM</strong><span>zásuvky s mechanizmom mäkkého dovretia</span></li>', 'kitchen BLUM')
kitchen = one_replace(kitchen, '<li><strong>104 l</strong><span>chladnička, mraznička 14 l</span></li>', '<li><strong>104 + 14 l</strong><span>voliteľná chladnička s 14 l mraziacou časťou</span></li>', 'kitchen fridge')
kitchen = one_replace(kitchen, '<li><strong>10 rokov*</strong><span>záruka na ALU kompozit a kameň</span></li>', '<li><strong>10 rokov*</strong><span>záruka na ALU kompozit a technický kameň</span></li>\n      <li><strong>0–20 mm</strong><span>výškovo nastaviteľné nohy na dorovnanie podkladu</span></li>', 'kitchen feet')

shade = one_replace(shade, 'Päť spôsobov, ako uzavrieť jedno pole', 'Päť riešení pre súkromie, vietor a slnko', 'shading heading')
shade = one_replace(
    shade,
    '<p class="k-copy">Od tkaniny, ktorá sa navinie do kazety, po pevnú stenu. Každé riešenie má inú najväčšiu šírku — podľa nej vyjde, koľko polí bude terasa potrebovať.</p>',
    '<p class="k-copy">ZIP sa po vytiahnutí schová do kazety, H50 sa posúva v lištách, FW25 a FI30 zostávajú pevné a sklo G1/G2 uzatvorí priestor bez straty výhľadu. Nižšie sú limity, podľa ktorých sa návrh rozdelí na polia.</p>',
    'shading intro',
)
shade_guide = '''<div class="kh-shade-guide k-rise" data-k-delay="3" aria-label="Rýchle porovnanie tienenia a bočných výplní">
      <div class="kh-shade-guide__item"><span>K130</span><strong>ZIP roleta</strong><small>max. 6,5 × 2,8 m · dynamické uzatvorenie</small></div>
      <div class="kh-shade-guide__item"><span>H50</span><strong>Posuvný panel</strong><small>panel max. 1,4 × 3,0 m · ALU rám</small></div>
      <div class="kh-shade-guide__item"><span>FW25</span><strong>Drevená stena</strong><small>bez viditeľného spoja do 4,0 m</small></div>
      <div class="kh-shade-guide__item"><span>FI30</span><strong>ISO stena</strong><small>3 cm izolácia · bez spoja do 6,0 m</small></div>
      <div class="kh-shade-guide__item"><span>G1 / G2</span><strong>Kalené sklo</strong><small>10 mm · posuvné alebo skladacie</small></div>
    </div>

    <ul class="kh-typ kh-typ--refined">'''
shade = one_replace(shade, '<ul class="kh-typ">', shade_guide, 'shading guide anchor')
shade = one_replace(shade, 'Výška 3 000 mm<br>Šírka 6 500 mm', 'Výška 2 800 mm<br>Šírka 6 500 mm', 'K130 dimensions')
shade = one_replace(shade, 'Výška podľa konštrukcie<br>Šírka 4 000 mm', 'Dĺžka do 4 000 mm<br>bez viditeľného spoja', 'FW25 span')
shade = one_replace(shade, 'Výška podľa konštrukcie<br>Šírka 6 000 mm', 'Dĺžka do 6 000 mm<br>bez viditeľného spoja', 'FI30 span')
shade = one_replace(
    shade,
    '<p class="kh-pojem">Jedno pole najviac</p>\n          <p class="kh-typ__udaj">Výška podľa konštrukcie<br>Šírka podľa počtu panelov</p>',
    '<p class="kh-pojem">Rozmer jedného panela</p>\n          <p class="kh-typ__udaj">G1: max. 1 200 × 2 800 mm<br>G2: max. 650 × 2 800 mm</p>',
    'glass dimensions',
)

for label, text in [('kitchen', kitchen), ('shading', shade)]:
    if text.count('../assets/koverta-2026.css?v=1788846952174') != 1:
        raise SystemExit(f'{label}: unexpected stylesheet reference count')
kitchen = kitchen.replace('../assets/koverta-2026.css?v=1788846952174', '../assets/koverta-2026.css?v=2026091103', 1)
shade = shade.replace('../assets/koverta-2026.css?v=1788846952174', '../assets/koverta-2026.css?v=2026091103', 1)

marker = '/* BATCH 3 · KITCHEN + SHADING DECISION LAYER */'
if marker in css:
    raise SystemExit('batch 3 CSS marker already exists')
css += r'''

/* BATCH 3 · KITCHEN + SHADING DECISION LAYER */
.k .kh-kitchen-specs { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); margin:clamp(24px,3vw,42px) 0 0; border:1px solid var(--k-hair); border-radius:var(--k-r-sm); overflow:hidden; background:var(--k-white); box-shadow:var(--k-shadow-xs); }
.k .kh-kitchen-spec { display:grid; align-content:start; gap:5px; min-height:126px; padding:clamp(18px,2vw,28px); border-left:1px solid var(--k-hair-soft); }
.k .kh-kitchen-spec:first-child { border-left:0; }
.k .kh-kitchen-spec span { font-size:12px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--k-grey-soft); }
.k .kh-kitchen-spec strong { font-family:var(--k-head); font-size:clamp(20px,1.65vw,25px); line-height:1.15; letter-spacing:-.025em; color:var(--k-ink); }
.k .kh-kitchen-spec small { font-size:13px; line-height:1.4; color:var(--k-muted); }
.k .kh-modul__mieru--refined { margin-top:14px; }
.k .kh-kitchen-facts { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:0; border-top:1px solid var(--k-hair); border-bottom:1px solid var(--k-hair); }
.k .kh-kitchen-facts > li { min-width:0; padding:22px 20px; border-top:0; border-right:1px solid var(--k-hair-soft); }
.k .kh-kitchen-facts > li:nth-child(4n) { border-right:0; }
.k .kh-kitchen-facts > li:nth-child(n+5) { border-top:1px solid var(--k-hair-soft); }
.k .kh-kitchen-facts strong { display:block; margin-bottom:7px; font-size:clamp(18px,1.45vw,23px); line-height:1.12; }
.k .kh-kitchen-facts span { display:block; max-width:27ch; font-size:13.5px; line-height:1.45; color:var(--k-muted); }
.k .kh-shade-guide { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); margin:clamp(24px,3vw,40px) 0 clamp(18px,2vw,30px); border:1px solid var(--k-hair); border-radius:var(--k-r-sm); overflow:hidden; background:var(--k-bone); }
.k .kh-shade-guide__item { display:grid; align-content:start; gap:5px; min-height:136px; padding:clamp(18px,1.8vw,26px); border-left:1px solid var(--k-hair-soft); }
.k .kh-shade-guide__item:first-child { border-left:0; }
.k .kh-shade-guide__item > span { width:max-content; padding-bottom:5px; border-bottom:2px solid var(--k-amber); font-size:12px; font-weight:800; letter-spacing:.08em; }
.k .kh-shade-guide__item strong { font-family:var(--k-head); font-size:clamp(17px,1.35vw,20px); line-height:1.18; letter-spacing:-.02em; }
.k .kh-shade-guide__item small { font-size:13px; line-height:1.45; color:var(--k-muted); }
.k .kh-typ--refined .kh-typ__riadok--prvy { padding-block:inherit; border-color:var(--k-hair); background:var(--k-white); box-shadow:none; }
.k .kh-typ--refined .kh-typ__riadok--prvy .kh-pojem { color:var(--k-grey-soft); }
.k .kh-typ--refined .kh-typ__riadok--prvy .kh-typ__model { font-size:inherit; color:var(--k-ink); }
.k .kh-typ--refined .kh-typ__riadok--prvy .kh-typ__lamela, .k .kh-typ--refined .kh-typ__riadok--prvy .kh-typ__udaj, .k .kh-typ--refined .kh-typ__riadok--prvy .kh-typ__kotva { color:inherit; }
.k .kh-typ--refined .kh-typ__riadok--prvy .kh-pas__draha { background:var(--k-hair); }
.k .kh-typ--refined .kh-typ__riadok--prvy .kh-pas__kota { color:var(--k-ink); }
@media (max-width:999px) {
  .k .kh-kitchen-specs { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .k .kh-kitchen-spec:nth-child(3) { border-left:0; }
  .k .kh-kitchen-spec:nth-child(n+3) { border-top:1px solid var(--k-hair-soft); }
  .k .kh-kitchen-facts { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .k .kh-kitchen-facts > li:nth-child(4n) { border-right:1px solid var(--k-hair-soft); }
  .k .kh-kitchen-facts > li:nth-child(2n) { border-right:0; }
  .k .kh-kitchen-facts > li:nth-child(n+3) { border-top:1px solid var(--k-hair-soft); }
  .k .kh-shade-guide { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .k .kh-shade-guide__item { border-top:1px solid var(--k-hair-soft); }
  .k .kh-shade-guide__item:nth-child(1), .k .kh-shade-guide__item:nth-child(2) { border-top:0; }
  .k .kh-shade-guide__item:nth-child(odd) { border-left:0; }
  .k .kh-shade-guide__item:last-child { grid-column:1/-1; }
}
@media (max-width:599px) {
  .k .kh-kitchen-specs, .k .kh-kitchen-facts, .k .kh-shade-guide { grid-template-columns:minmax(0,1fr); }
  .k .kh-kitchen-spec, .k .kh-kitchen-facts > li, .k .kh-shade-guide__item { border-left:0; border-right:0; }
  .k .kh-kitchen-spec + .kh-kitchen-spec, .k .kh-kitchen-facts > li + li, .k .kh-shade-guide__item + .kh-shade-guide__item { border-top:1px solid var(--k-hair-soft); }
  .k .kh-shade-guide__item:last-child { grid-column:auto; }
  .k .kh-kitchen-spec, .k .kh-shade-guide__item { min-height:0; }
}
'''

kitchen_path.write_text(kitchen, encoding='utf-8')
shade_path.write_text(shade, encoding='utf-8')
css_path.write_text(css, encoding='utf-8')

kf = kitchen_path.read_text(encoding='utf-8')
sf = shade_path.read_text(encoding='utf-8')
cf = css_path.read_text(encoding='utf-8')
for token in ['303 × 70 × 92 cm', '213 × 70 × 92 cm', '95 × 70 × 67 cm', '65 × 70 × 67 cm', '104 + 14 l', '0–20 mm', 'kh-kitchen-facts']:
    if token not in kf:
        raise SystemExit('missing kitchen postcondition: ' + token)
for token in ['Výška 2 800 mm<br>Šírka 6 500 mm', 'panel max. 1,4 × 3,0 m', 'Dĺžka do 4 000 mm<br>bez viditeľného spoja', 'Dĺžka do 6 000 mm<br>bez viditeľného spoja', 'G1: max. 1 200 × 2 800 mm<br>G2: max. 650 × 2 800 mm', 'kh-typ kh-typ--refined']:
    if token not in sf:
        raise SystemExit('missing shading postcondition: ' + token)
if marker not in cf:
    raise SystemExit('missing CSS marker')
changed = set(subprocess.check_output(['git', 'diff', '--name-only'], text=True).splitlines())
expected = {'outdoor-kuchyne/index.html', 'tienenie/index.html', 'assets/koverta-2026.css'}
if changed != expected:
    raise SystemExit(f'unexpected batch 3 scope: {sorted(changed)}')
