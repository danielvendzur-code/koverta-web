#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const code=fs.readFileSync(path.join(ROOT,'konfigurator','cfg-pages.js'),'utf8');
const sandbox={window:{}};vm.runInNewContext(code,sandbox,{filename:'cfg-pages.js'});
const pages=sandbox.window.KV_PAGES;
function cfg(key){const m=pages[key].match(/<script type="application\/json" data-sp-bio-data>([\s\S]*?)<\/script>/);if(!m)throw new Error('chýba data-sp-bio-data: '+key);return JSON.parse(m[1])}
const k=cfg('koverta').models.K,z=cfg('zahrada').models.Z;
const count=k.widths.length*k.lengths.length+z.widths.length*z.lengths.length;
if(count!==66)throw new Error('rozmerových produktov má byť 66, je '+count);
const wi=k.widths.indexOf(5000),li=k.lengths.indexOf(6000);
if(wi<0||li<0||k.prices[li][wi]!==6897)throw new Error('5 × 6 m nemá cenu 6897 €');
const src=path.join(ROOT,'shopify-zdroj');
for(const rel of ['templates/product.json','templates/cart.json','sections/koverta-product.liquid','sections/koverta-cart.liquid','assets/koverta-product.css','assets/koverta-product.js','assets/koverta-shopify.css']){
  if(!fs.existsSync(path.join(src,rel)))throw new Error('chýba shopify-zdroj/'+rel)
}
JSON.parse(fs.readFileSync(path.join(src,'templates/product.json'),'utf8'));
JSON.parse(fs.readFileSync(path.join(src,'templates/cart.json'),'utf8'));
const product=fs.readFileSync(path.join(src,'sections/koverta-product.liquid'),'utf8');
if(!/{%\s*form\s+'product',\s*product/.test(product))throw new Error('produkt nemá Shopify product form');
if(!/name="id"/.test(product))throw new Error('product form nemá variant id');
if(!/data-kp-add/.test(product))throw new Error('produkt nemá Pridať do košíka');
if(!/kr-hero/.test(product)||!/kpVerifiedRealizations/.test(product))throw new Error('produkt stratil schválený kr hero alebo realizačnú galériu');
if(!/\/pages\/nove-konfigurator/.test(product))throw new Error('produkt nemá fallback konfigurátora');
const cart=fs.readFileSync(path.join(src,'sections/koverta-cart.liquid'),'utf8');
if(!/name="checkout"/.test(cart)||!/routes\.cart_url/.test(cart))throw new Error('košík nemá natívny Shopify checkout');
const imageMapPath=path.join(ROOT,'tools','shopify-product-images.json');
if(!fs.existsSync(imageMapPath))throw new Error('chýba tools/shopify-product-images.json');
const imageMap=JSON.parse(fs.readFileSync(imageMapPath,'utf8')).products||{};
if(Object.keys(imageMap).length!==66)throw new Error('mapa produktových fotiek má mať 66 záznamov, je '+Object.keys(imageMap).length);
for(const [handle,imgs] of Object.entries(imageMap))if(!Array.isArray(imgs)||!imgs.length||!/^https:\/\//.test(imgs[0].url||''))throw new Error('neplatná mapa fotiek: '+handle);
if(fs.existsSync(path.join(ROOT,'shopify-zdroj','product-images.json')))throw new Error('product-images.json nesmie byť v shopify-zdroj');
const syncScript=fs.readFileSync(path.join(ROOT,'tools','shopify-products.js'),'utf8');
if(!/Rozmer 5 × 6 m patrí medzi najpraktickejšie dvojmiestne varianty/.test(syncScript))throw new Error('sync nechráni schválený opis 5 × 6 m');
if(!/publishablePublish/.test(syncScript)||!/publishableUnpublish/.test(syncScript)||!/online_store/.test(syncScript))throw new Error('sync nerieši skutočné publikovanie do Online Store');
if(!/KOVERTA_PUBLIC_ORIGIN/.test(syncScript)||!/https:\/\/koverta\.sk/.test(syncScript))throw new Error('sync nepoužíva absolútnu produkčnú URL pre konfigurátor');
if(!/collectionByIdentifier/.test(syncScript)||!/pristresky-pre-auta/.test(syncScript)||!/zahradne-pristresky/.test(syncScript))throw new Error('sync nechráni členstvo produktov v Shopify kolekciách');
console.log('Shopify produkty OK: 66 rozmerov; 5 × 6 m = 6 897 €; product form + cart + checkout sú prítomné.');
