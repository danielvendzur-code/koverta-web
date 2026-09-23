#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..'),API=process.env.SHOPIFY_API_VERSION||'2026-07';
const PUBLIC_ORIGIN=(process.env.KOVERTA_PUBLIC_ORIGIN||'https://koverta.sk').replace(/\/+$/,'');
const PRODUCT_IMAGES=JSON.parse(fs.readFileSync(path.join(ROOT,'tools','shopify-product-images.json'),'utf8')).products;
const argv=process.argv.slice(2),apply=argv.includes('--apply'),publish=argv.includes('--publish');
const scope=(argv.find(x=>x.startsWith('--scope='))||'--scope=reference').split('=')[1];
const only=(argv.find(x=>x.startsWith('--only='))||'').split('=')[1]||null;

function pages(){const c=fs.readFileSync(path.join(ROOT,'konfigurator','cfg-pages.js'),'utf8'),s={window:{}};vm.runInNewContext(c,s);return s.window.KV_PAGES}
function data(html){const m=html.match(/<script type="application\/json" data-sp-bio-data>([\s\S]*?)<\/script>/);if(!m)throw Error('chýba konfigurácia');return JSON.parse(m[1])}
function mt(mm){return String(mm/1000).replace('.',',')}
function handle(f,w,l){return(f==='zahrada'?'zahradny-pristresok-koverta-':'pristresok-koverta-')+w+'x'+l}
function media(f){/* Fotky sa migrujú kurátorovane zo živého Shopify katalógu; sync ich neprepisuje. */ const b='https://danielvendzur-code.github.io/koverta-web/assets/';const a=f==='zahrada'?
[['koverta-zahradny-pristresok-bratislava-hero-w1600.webp','Záhradný prístrešok Koverta pri dome'],['koverta-zahradny-pristresok-bratislava-detail-w1000.webp','Detail záhradného prístrešku Koverta'],['koverta-zahradny-pristresok-terasa-sedenie-w1000.webp','Zastrešená terasa Koverta so sedením'],['koverta-zahradny-pristresok-antracit-lamelova-stena-w1000.webp','Záhradný prístrešok Koverta s lamelovou stenou'],['koverta-zahradny-pristresok-zelena-strecha-w1000.webp','Realizácia systému Koverta']]:
[['koverta-pristresok-auto-golf-lamelova-stena-w1600.webp','Oceľový prístrešok Koverta pri rodinnom dome'],['koverta-pristresok-dve-auta-velke-ulany-w1000.webp','Prístrešok Koverta pre dve autá'],['koverta-pristresok-bocna-lamelova-vypln-zvod-w1000.webp','Detail bočnej výplne a zvodu Koverta'],['koverta-pristresok-led-osvetlenie-vecer-w1000.webp','LED osvetlenie prístrešku Koverta'],['koverta-pristresok-montaz-kotvenie-do-betonu-w1000.webp','Detail montáže a kotvenia prístrešku Koverta']];
return a.map(([file,alt])=>({originalSource:b+file,alt,contentType:'IMAGE'}))}
function records(){const p=pages(),defs=[['koverta','auto','K','Prístrešok Koverta','Prístrešok pre auto','koverta'],['zahrada','zahrada','Z','Záhradný prístrešok Koverta','Záhradný prístrešok','zahrada']],out=[];for(const [key,fam,mkey,base,type,cfg] of defs){const d=data(p[key]),m=d.models[mkey],colors=d.colors.filter(c=>c.std).map(c=>c.ral+' · '+c.name);for(let li=0;li<m.lengths.length;li++)for(let wi=0;wi<m.widths.length;wi++){const l=m.lengths[li],w=m.widths[wi],price=m.prices[li][wi],dim=mt(w)+' × '+mt(l)+' m',area=w*l/1e6,typical=fam==='zahrada'?'terasa a záhradný priestor':(w>=5000?'2 osobné autá':'1 osobné auto');const description='<p>'+base+' '+dim+' '+(fam==='zahrada'?'pre terasu a záhradu':'pre '+typical)+'. Zastrešená plocha '+area.toLocaleString('sk-SK')+' m², svetlá výška 2,4 m.</p>'+'<p>Oceľová konštrukcia, žiarovo pozinkovaná a lakovaná. Pultová strecha z trapézového plechu s hliníkovým lemovaním, žľab a zvod. Doprava a montáž sú v cene.</p>'+'<p>14 odtieňov RAL bez príplatku. Iný rozmer vyrobíme na mieru.</p>';out.push({fam,w,l,price,colors,handle:handle(fam,w,l),title:base+' '+dim,type,dim,area,typical,description,cfg:PUBLIC_ORIGIN+'/pages/konfigurator?page='+cfg+'&w='+w+'&l='+l,media:media(fam)})}}for(const r of out){r.related=out.filter(x=>x.fam===r.fam&&x.handle!==r.handle).sort((a,b)=>(Math.abs(a.w-r.w)+Math.abs(a.l-r.l))-(Math.abs(b.w-r.w)+Math.abs(b.l-r.l))).slice(0,3).map(x=>x.handle)}return out}
async function gql(query,variables){const store=process.env.SHOPIFY_STORE,token=process.env.SHOPIFY_ADMIN_TOKEN;if(!store||!token)throw Error('chýba SHOPIFY_STORE alebo SHOPIFY_ADMIN_TOKEN');const host=store.replace(/^https?:\/\//,'').replace(/\/+$/,'');const res=await fetch('https://'+host+'/admin/api/'+API+'/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':token},body:JSON.stringify({query,variables})});const j=await res.json();if(!res.ok||j.errors)throw Error('Shopify API '+res.status+': '+JSON.stringify(j.errors||j));return j.data}
let ONLINE_STORE_PUBLICATION_ID=null;
async function onlineStorePublicationId(){
  if(ONLINE_STORE_PUBLICATION_ID)return ONLINE_STORE_PUBLICATION_ID;
  const c=await gql('query C{channels(first:50){nodes{id handle name}}}');
  const ch=(c.channels?.nodes||[]).find(x=>x.handle==='online_store');
  if(!ch)throw Error('Shopify Online Store kanál sa nenašiel.');
  const candidate=ch.id.replace('/Channel/','/Publication/');
  const p=await gql('query P($id:ID!){publication(id:$id){id}}',{id:candidate});
  if(!p.publication?.id)throw Error('Online Store Publication sa nenašla pre '+ch.id);
  ONLINE_STORE_PUBLICATION_ID=p.publication.id;
  return ONLINE_STORE_PUBLICATION_ID;
}
let COLLECTION_IDS=null;
async function collectionIds(){
  if(COLLECTION_IDS)return COLLECTION_IDS;
  const q=await gql('query K($auto:CollectionIdentifierInput!,$garden:CollectionIdentifierInput!){auto:collectionByIdentifier(identifier:$auto){id handle} garden:collectionByIdentifier(identifier:$garden){id handle}}',{auto:{handle:'pristresky-pre-auta'},garden:{handle:'zahradne-pristresky'}});
  if(!q.auto?.id||!q.garden?.id)throw Error('Shopify produktové kolekcie sa nenašli.');
  COLLECTION_IDS={auto:q.auto.id,zahrada:q.garden.id};
  return COLLECTION_IDS;
}
async function syncOnlineStorePublication(productId,wantPublished){
  const publicationId=await onlineStorePublicationId();
  const q=await gql('query V($id:ID!,$publicationId:ID!){product(id:$id){publishedOnPublication(publicationId:$publicationId)}}',{id:productId,publicationId});
  const isPublished=!!q.product?.publishedOnPublication;
  if(isPublished===wantPublished)return isPublished;
  const mutation=wantPublished
    ? 'mutation P($id:ID!,$input:[PublicationInput!]!){publishablePublish(id:$id,input:$input){userErrors{field message}}}'
    : 'mutation U($id:ID!,$input:[PublicationInput!]!){publishableUnpublish(id:$id,input:$input){userErrors{field message}}}';
  const key=wantPublished?'publishablePublish':'publishableUnpublish';
  const d=await gql(mutation,{id:productId,input:[{publicationId}]});
  if(d[key].userErrors.length)throw Error('Online Store publication '+productId+': '+JSON.stringify(d[key].userErrors));
  return wantPublished;
}
async function upsert(r){
const existing=await gql('query E($identifier:ProductIdentifierInput!){product:productByIdentifier(identifier:$identifier){id media(first:1){nodes{id}}}}',{identifier:{handle:r.handle}});
const collections=await collectionIds();
const input={title:r.title,handle:r.handle,vendor:'Koverta',productType:r.type,descriptionHtml:r.description,collections:[collections[r.fam]],productOptions:[{name:'Farba',position:1,values:r.colors.map(name=>({name}))}],variants:r.colors.map(name=>({optionValues:[{optionName:'Farba',name}],price:String(r.price)}))};
const images=PRODUCT_IMAGES[r.handle]||[];
if((!existing.product||!(existing.product.media?.nodes||[]).length)&&images.length){
  input.files=images.map((img,i)=>({originalSource:img.url,alt:img.alt||r.title+' – produktová fotografia '+(i+1),contentType:'IMAGE',duplicateResolutionMode:'APPEND_UUID'}));
}
const set=await gql('mutation U($input:ProductSetInput!,$identifier:ProductSetIdentifiers,$sync:Boolean!){productSet(input:$input,identifier:$identifier,synchronous:$sync){product{id handle media(first:1){nodes{id}}}userErrors{field message}}}',{input,identifier:{handle:r.handle},sync:true});if(set.productSet.userErrors.length)throw Error(r.handle+': '+JSON.stringify(set.productSet.userErrors));const id=set.productSet.product.id;
const mfs=[['family','single_line_text_field',r.fam],['width_mm','number_integer',String(r.w)],['length_mm','number_integer',String(r.l)],['area_m2','number_decimal',r.area.toFixed(2)],['dimension_label','single_line_text_field',r.dim],['typical_use','single_line_text_field',r.typical],['configurator_url','url',r.cfg],['catalog_price','number_decimal',r.price.toFixed(2)],['related_1_handle','single_line_text_field',r.related[0]],['related_2_handle','single_line_text_field',r.related[1]],['related_3_handle','single_line_text_field',r.related[2]]].map(([key,type,value])=>({ownerId:id,namespace:'koverta',key,type,value}));
const mf=await gql('mutation M($metafields:[MetafieldsSetInput!]!){metafieldsSet(metafields:$metafields){userErrors{field message code}}}',{metafields:mfs});if(mf.metafieldsSet.userErrors.length)throw Error(r.handle+' metafields: '+JSON.stringify(mf.metafieldsSet.userErrors));
const seo={title:r.title+' · od '+r.price.toLocaleString('sk-SK')+' € | Koverta',description:r.title+' — cena od '+r.price.toLocaleString('sk-SK')+' € s DPH. Rozmer '+r.dim+', plocha '+r.area.toLocaleString('sk-SK')+' m². Výroba Koverta na Slovensku.'};const st=await gql('mutation S($product:ProductUpdateInput!){productUpdate(product:$product){product{id status}userErrors{field message}}}',{product:{id,status:publish?'ACTIVE':'DRAFT',seo}});if(st.productUpdate.userErrors.length)throw Error(r.handle+' status/seo: '+JSON.stringify(st.productUpdate.userErrors));await syncOnlineStorePublication(id,publish);console.log('SYNC '+r.handle+' · '+r.price+' € · '+st.productUpdate.product.status+(publish?' · ONLINE_STORE':' · NEPUBLIKOVANÉ'))}
async function main(){const all=records();if(all.length!==66)throw Error('očakávaných 66 produktov, našlo sa '+all.length);const ref=all.find(r=>r.fam==='auto'&&r.w===5000&&r.l===6000);if(!ref||ref.price!==6897)throw Error('5 × 6 m nemá 6897 €');let selected=scope==='all'?all:[ref];if(only)selected=all.filter(r=>r.w+'x'+r.l===only);if(argv.includes('--check')){console.log('OK '+all.length+' produktov; 5 × 6 m = '+ref.price+' €; '+ref.colors.length+' farieb');return}if(!apply){console.log('DRY RUN '+selected.length+' produktov');selected.forEach(r=>console.log(r.handle+'\t'+r.price+' €'));return}for(const r of selected)await upsert(r)}
main().catch(e=>{console.error(e.stack||e.message);process.exit(1)});
