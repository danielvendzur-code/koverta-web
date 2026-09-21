const POVOLENE_POVODY = new Set(['https://koverta.sk', 'https://www.koverta.sk', 'https://maleprojekty-sk.myshopify.com']);
const POVOLENE_TYPY = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
export const config = { runtime: 'edge' };

function hlavicky(povod) { return { 'Access-Control-Allow-Origin': povod, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin', 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }; }
function odpoved(povod, status, telo) { return new Response(JSON.stringify(telo), { status, headers: hlavicky(povod) }); }
function text(data, nazov, max = 2000) { return String(data.get(nazov) || '').trim().slice(0, max); }
function esc(v) { return String(v).replace(/[&<>"']/g, z => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[z])); }
function riadok(n, v) { return v ? `<tr><th align="left" style="padding:8px 12px 8px 0;vertical-align:top">${esc(n)}</th><td style="padding:8px 0">${esc(v).replace(/\n/g,'<br>')}</td></tr>` : ''; }

export default async function dopyt(request) {
  const povod = request.headers.get('origin') || '';
  if (!POVOLENE_POVODY.has(povod)) return odpoved('https://koverta.sk', 403, { ok:false });
  if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:hlavicky(povod) });
  if (request.method !== 'POST') return odpoved(povod, 405, { ok:false });
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_TO || !process.env.RESEND_FROM) return odpoved(povod, 503, { ok:false });
  let data; try { data = await request.formData(); } catch { return odpoved(povod, 400, { ok:false }); }
  if (text(data, 'website', 200)) return odpoved(povod, 200, { ok:true });
  const meno=text(data,'contact[name]',120), telefon=text(data,'contact[phone]',80), email=text(data,'contact[email]',180).toLowerCase();
  const co=text(data,'contact[Čo rieši]',180), miesto=text(data,'contact[Miesto realizácie]',180), sprava=text(data,'contact[body]',5000), suhlas=text(data,'contact[Súhlas]',300), stranka=text(data,'source_url',500);
  if (!meno || !telefon || !email || !suhlas || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return odpoved(povod, 422, { ok:false });
  const subory=data.getAll('contact[Prílohy][]').filter(s=>s instanceof File && s.size);
  if (subory.length>5) return odpoved(povod,413,{ok:false});
  let spolu=0; const attachments=[];
  for (const s of subory) {
    spolu+=s.size; if (s.size>3*1024*1024 || spolu>3.5*1024*1024 || !POVOLENE_TYPY.has(s.type)) return odpoved(povod,413,{ok:false});
    const b=new Uint8Array(await s.arrayBuffer()); let raw=''; for(let i=0;i<b.length;i+=0x8000) raw+=String.fromCharCode(...b.subarray(i,i+0x8000));
    attachments.push({filename:s.name.slice(0,160),content:btoa(raw)});
  }
  const html=`<div style="font-family:Arial,sans-serif;color:#12171a"><h1>Nový dopyt z webu Koverta</h1><table>${riadok('Čo rieši',co)}${riadok('Meno',meno)}${riadok('Telefón',telefon)}${riadok('E-mail',email)}${riadok('Miesto realizácie',miesto)}${riadok('Správa',sprava)}${riadok('Zdrojová stránka',stranka)}</table></div>`;
  const headers={Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'};
  const poslany=await fetch('https://api.resend.com/emails',{method:'POST',headers,body:JSON.stringify({from:process.env.RESEND_FROM,to:[process.env.RESEND_TO],reply_to:email,subject:`Dopyt z webu – ${co||'Koverta'} – ${meno}`,html,attachments})});
  if(!poslany.ok) return odpoved(povod,502,{ok:false});
  if(process.env.RESEND_CONFIRMATION!=='false') await fetch('https://api.resend.com/emails',{method:'POST',headers,body:JSON.stringify({from:process.env.RESEND_FROM,to:[email],reply_to:process.env.RESEND_TO,subject:'Potvrdenie dopytu – Koverta',html:`<div style="font-family:Arial,sans-serif;color:#12171a"><h1>Ďakujeme, ${esc(meno)}</h1><p>Váš dopyt sme prijali. Ozveme sa vám do jedného pracovného dňa.</p><p>Koverta</p></div>`})});
  return odpoved(povod,200,{ok:true});
}
