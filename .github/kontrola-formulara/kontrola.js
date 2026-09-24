/* Jednorazová kontrola servera formulára (na žiadosť majiteľa, 24. 9. 2026):
   jeden skúšobný dopyt s jeho e-mailom a presná odpoveď servera.
   id ako UUID od Resendu = e-mail odišiel; 32 znakov hex = denný strop,
   dopyt je len uložený; EMAIL_SEND_FAILED = Resend odmietol. */
(async () => {
  const telo = {
    typ: 'Prístrešok pre auto', meno: 'Daniel – kontrola formulára', telefon: '0948 482 266',
    email: 'daniel.vendzur@gmail.com', miesto: '', website: '', prilohy: [],
    sprava: 'Test: kontrola, či dopyty aj potvrdenia chodia (Claude, 24. 9.). Nie je to skutočný dopyt.',
    suhlas: 'Odoslaním súhlasí', startedAt: Date.now() - 9000, stranka: 'https://koverta.sk/'
  };
  const r = await fetch('https://koverta-formular.vercel.app/api/dopyt', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://koverta.sk' }, body: JSON.stringify(telo)
  });
  const text = await r.text();
  let j = {}; try { j = JSON.parse(text); } catch (e) {}
  const id = String(j.id || '');
  const vyklad = !r.ok ? `CHYBA servera: ${j.code || text.slice(0, 200)}`
    : j.test ? 'TEST (nič sa neodoslalo)'
    : /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(id) ? 'E-MAIL ODIŠIEL (Resend id)'
    : /^[0-9a-f]{32}$/.test(id) ? 'DENNÝ STROP: dopyt uložený, e-mail neodišiel'
    : 'nejasné';
  console.log(`HTTP ${r.status} · ${text.slice(0, 300)}`);
  console.log(`VÝSLEDOK: ${vyklad}`);
})();
