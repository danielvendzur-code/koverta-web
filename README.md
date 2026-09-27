# Koverta — verejný náhľad

| Adresa | Čo je to |
| --- | --- |
| `/` | domovská stránka |
| `/konfigurator/` | 3D konfigurátor (bioklimatické pergoly, prístrešky Soltec, prístrešky pre autá) |

Zdroj: `design-preview/*.html` a `github-pages-soltec/` v pracovnom priečinku.
Túto zložku negeneruj ručne — prestav ju skriptom, nech náhľad a téma neujdú
od seba.
## Štýl a skript: upravuje sa zdroj

`assets/koverta-2026.css` a `assets/koverta-2026.js` sú zmenšené kópie bez
komentárov (načítavajú sa na každej stránke, na mobile brzdili prvé
vykreslenie). Upravujú sa zdroje s komentármi:

| Upravuj | Vzniká z neho | Príkaz |
| --- | --- | --- |
| `assets/koverta-2026.zdroj.css` | `assets/koverta-2026.css` | `node tools/zmensi-css.js` |
| `assets/koverta-2026.zdroj.js` | `assets/koverta-2026.js` | `npm install --no-save terser@5.51.2 && node tools/zmensi-js.js` |

Potom `node tools/verzie-suborov.js --oprav`. CI overuje, že kópie
zodpovedajú zdrojom.
