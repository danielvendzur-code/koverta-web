# Koverta — verejný náhľad

| Adresa | Čo je to |
| --- | --- |
| `/` | domovská stránka |
| `/konfigurator/` | 3D konfigurátor (bioklimatické pergoly, prístrešky Soltec, prístrešky pre autá) |

Chat (Koverta poradca) sa načítava z `koverta-chatbot-backend` na konci
`assets/koverta-2026.js`, až po načítaní stránky. Vypnutie na stránke:
`window.KOVERTA_CHAT = false`; otvorenie odkazom: `<a href="#poradca">`.

Zdroj: `design-preview/*.html` a `github-pages-soltec/` v pracovnom priečinku.
Túto zložku negeneruj ručne — prestav ju skriptom, nech náhľad a téma neujdú
od seba.