#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');

const ROOT=path.resolve(__dirname,'..');
const API=process.env.SHOPIFY_API_VERSION||'2026-07';
const argv=process.argv.slice(2);
const apply=argv.includes('--apply');
const check=argv.includes('--check');

function loadRedirects(){
  const file=path.join(ROOT,'tools','shopify-product-redirects.json');
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  const redirects=data.redirects||[];
  if(redirects.length!==66)throw new Error('očakávaných 66 redirectov, našlo sa '+redirects.length);
  const oldPaths=new Set(),newPaths=new Set(),newHandles=new Set();
  for(const r of redirects){
    if(!/^\/products\/[a-z0-9-]+$/.test(r.old_path))throw new Error('neplatný old_path: '+r.old_path);
    if(!/^\/products\/(?:pristresok-koverta|zahradny-pristresok-koverta)-\d+x\d+$/.test(r.new_path))throw new Error('neplatný new_path: '+r.new_path);
    if(r.old_path===r.new_path)throw new Error('redirect smeruje sám na seba: '+r.old_path);
    if(oldPaths.has(r.old_path))throw new Error('duplicitný old_path: '+r.old_path);
    if(newPaths.has(r.new_path))throw new Error('duplicitný new_path: '+r.new_path);
    if(newHandles.has(r.new_handle))throw new Error('duplicitný new_handle: '+r.new_handle);
    oldPaths.add(r.old_path);newPaths.add(r.new_path);newHandles.add(r.new_handle);
  }
  return redirects;
}

async function gql(query,variables){
  const store=process.env.SHOPIFY_STORE,token=process.env.SHOPIFY_ADMIN_TOKEN;
  if(!store||!token)throw new Error('chýba SHOPIFY_STORE alebo SHOPIFY_ADMIN_TOKEN');
  const host=store.replace(/^https?:\/\//,'').replace(/\/+$/,'');
  const res=await fetch('https://'+host+'/admin/api/'+API+'/graphql.json',{
    method:'POST',
    headers:{'Content-Type':'application/json','X-Shopify-Access-Token':token},
    body:JSON.stringify({query,variables})
  });
  const json=await res.json();
  if(!res.ok||json.errors)throw new Error('Shopify API '+res.status+': '+JSON.stringify(json.errors||json));
  return json.data;
}

async function onlineStorePublicationId(){
  const data=await gql('query C{channels(first:50){nodes{id handle name}}}');
  const channel=(data.channels?.nodes||[]).find(x=>x.handle==='online_store');
  if(!channel)throw new Error('Online Store kanál sa nenašiel.');
  const publicationId=channel.id.replace('/Channel/','/Publication/');
  const pub=await gql('query P($id:ID!){publication(id:$id){id}}',{id:publicationId});
  if(!pub.publication?.id)throw new Error('Online Store Publication sa nenašla: '+publicationId);
  return pub.publication.id;
}

async function assertProductsReady(redirects,publicationId){
  const data=await gql('query Products($publicationId:ID!){products(first:250,query:"vendor:Koverta"){nodes{id handle status onlineStoreUrl publishedOnPublication(publicationId:$publicationId)}}}',{publicationId});
  const byHandle=new Map((data.products?.nodes||[]).map(p=>[p.handle,p]));
  const failures=[];
  for(const r of redirects){
    const p=byHandle.get(r.new_handle);
    if(!p)failures.push(r.new_handle+': produkt neexistuje');
    else if(p.status!=='ACTIVE'||!p.onlineStoreUrl||!p.publishedOnPublication)failures.push(r.new_handle+': nie je ACTIVE + Online Store');
  }
  if(failures.length)throw new Error('redirecty sa nesmú aplikovať; nové produkty nie sú pripravené:\n'+failures.join('\n'));
}

async function existingRedirects(){
  const data=await gql('query R{urlRedirects(first:250){nodes{id path target}}}');
  return data.urlRedirects?.nodes||[];
}

async function createRedirect(pathValue,target){
  const data=await gql(
    'mutation R($urlRedirect:UrlRedirectInput!){urlRedirectCreate(urlRedirect:$urlRedirect){urlRedirect{id path target}userErrors{field message}}}',
    {urlRedirect:{path:pathValue,target}}
  );
  const errors=data.urlRedirectCreate.userErrors||[];
  if(errors.length)throw new Error(pathValue+': '+JSON.stringify(errors));
  return data.urlRedirectCreate.urlRedirect;
}

async function main(){
  const redirects=loadRedirects();
  if(check){
    console.log('OK '+redirects.length+' produktových redirectov; bez duplicít a self-redirectov.');
    return;
  }
  if(!apply){
    console.log('DRY RUN '+redirects.length+' redirectov');
    redirects.forEach(r=>console.log(r.old_path+' -> '+r.new_path));
    return;
  }

  const publicationId=await onlineStorePublicationId();
  await assertProductsReady(redirects,publicationId);

  const existing=await existingRedirects();
  const byPath=new Map(existing.map(r=>[r.path,r]));
  let created=0,unchanged=0;
  for(const r of redirects){
    const current=byPath.get(r.old_path);
    if(current){
      if(current.target!==r.new_path)throw new Error('konfliktný existujúci redirect '+r.old_path+' -> '+current.target+'; očakávané '+r.new_path);
      unchanged++;
      continue;
    }
    await createRedirect(r.old_path,r.new_path);
    created++;
    console.log('REDIRECT '+r.old_path+' -> '+r.new_path);
  }
  console.log('HOTOVO: '+created+' vytvorených, '+unchanged+' už existovalo.');
}

main().catch(err=>{console.error(err.stack||err.message);process.exit(1)});
