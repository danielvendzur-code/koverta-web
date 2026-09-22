# Shopify produkty Koverta

Zdroj rozmerov a cien ostáva v `konfigurator/cfg-pages.js`.
`tools/shopify-products.js` z neho pripraví 54 produktov pre autá a 12 záhradných produktov.

Referenčný produkt:
`/products/pristresok-koverta-5000x6000` — 6 897 € s DPH.

## Bezpečný postup

1. Shopify custom app: povoľ `read_products` + `write_products`.
2. GitHub Actions secrets: `SHOPIFY_STORE` a `SHOPIFY_ADMIN_TOKEN`.
3. Workflow **Shopify produkty — synchronizácia** spusti najprv s `scope=reference`, `apply=false`, `publish=false`.
4. Potom `apply=true`, stále `publish=false`: 5 × 6 m sa vytvorí/aktualizuje ako DRAFT.
5. Po vizuálnej a nákupnej kontrole možno zapnúť `publish=true`.
6. Až následne použiť `scope=all`.

Skript používa Shopify Admin GraphQL `productSet` na idempotentný upsert podľa handle,
`metafieldsSet` pre parametre a `productUpdate` na explicitné DRAFT/ACTIVE a SEO.

Platobnú bránu GitHub nenastavuje. Tá zostáva v Shopify Admin → Settings → Payments.
Téma používa natívny Shopify product form, košík a checkout; platobné údaje cez repozitár nejdú.
