/*
 * Dossier de revente : document imprimable (PDF via l'impression du
 * navigateur) regroupant l'historique complet d'un véhicule ou vélo —
 * un argument de vente à remettre à l'acheteur.
 *
 * Ouvert dans un nouvel onglet via document.write (pas de Blob URL, qui
 * serait refusée en mode PWA « écran d'accueil » sur iOS) ; l'ouverture
 * doit rester synchrone avec le clic pour ne pas être bloquée en popup.
 *
 * Les pièces jointes des documents (factures, carte grise…) sont rangées hors
 * du nœud synchronisé : lues ensuite via js/services/files.js, les photos sont
 * ajoutées en annexe une fois chargées, les PDF listés (à joindre à part).
 */
import { esc } from '../core/utils.js';
import { formatKey, todayKey } from '../core/dates.js';
import * as store from '../core/store.js';
import { costSummary, activeFuelEstimate, currentKm } from '../core/calc.js';
import { isBike, isElectric } from '../core/schema.js';
import { euro, euroRound, km, dec } from '../views/common.js';
import { getFile } from '../services/files.js';

const fmtDate = d => formatKey(d, { day: 'numeric', month: 'long', year: 'numeric' });

function section(title, bodyHTML) {
  return `<section><h2>${esc(title)}</h2>${bodyHTML}</section>`;
}

function table(headers, rows) {
  if (!rows.length) return '<p class="empty">Aucune donnée.</p>';
  return `<table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function buildBody(v, f) {
  const current = currentKm(v, f);
  const summary = costSummary(v, f);
  const photo = v.hasPhoto ? store.photo(v.id) : '';

  const identity = isBike(v)
    ? [
        ['Type', v.bikeType || '—'],
        ['Marque / modèle', [v.brand, v.model].filter(Boolean).join(' ') || '—'],
        ['Taille', v.bikeSize || '—'],
        ['Roues', v.bikeWheels || '—'],
        ['Groupe', v.bikeGroupset || '—'],
        ['Kilométrage', km(current)]
      ]
    : [
        ['Marque / modèle', [v.brand, v.model].filter(Boolean).join(' ') || '—'],
        ['Année', v.year || '—'],
        ['Mise en circulation', v.registrationDate ? fmtDate(v.registrationDate) : '—'],
        ['Immatriculation', v.plate || '—'],
        ['Carburant', v.fuel || '—'],
        ['Kilométrage', km(current)]
      ];

  const purchase = [
    ['Date d’achat', v.purchaseDate ? fmtDate(v.purchaseDate) : '—'],
    ['Prix d’achat', v.purchasePrice ? euro(v.purchasePrice) : '—'],
    ['Kilométrage à l’achat', v.purchaseKm ? km(v.purchaseKm) : '—'],
    ['Coût réel depuis l’achat', summary.monthsOwned ? euroRound(summary.realCost) : '—'],
    ['Coût au km', summary.perKm ? `${summary.perKm.toFixed(2).replace('.', ',')} €` : '—']
  ];

  const maintenance = f.maintenance.map(x => [fmtDate(x.date), x.km ? km(x.km) : '—', x.type + (x.label ? ` · ${x.label}` : ''), x.cost ? euro(x.cost) : '—', x.garage || '—']);

  const docs = f.docs.map(d => [d.type + (d.label ? ` · ${d.label}` : ''), d.expiry ? fmtDate(d.expiry) : 'Sans échéance', d.note || '—', d.files.length > 1 ? `${d.files.length} pièces jointes` : d.files.length ? '1 pièce jointe' : '—']);
  const hasFiles = f.docs.some(d => d.files.length);

  let fuelSection = '';
  if (!isBike(v)) {
    const est = activeFuelEstimate(f);
    const unit = isElectric(v) ? 'kWh' : 'L';
    fuelSection = section(
      isElectric(v) ? 'Recharge' : 'Carburant',
      est
        ? `<p>Estimation : ${dec(est.fuelConsumption, 1)} ${unit}/100 km · ${dec(est.fuelPrice, 2)} € / ${unit}.</p>`
        : '<p class="empty">Aucune estimation renseignée.</p>'
    );
  }

  let partsSection = '';
  if (isBike(v)) {
    const rows = f.parts.map(p => [p.name, p.installedDate ? fmtDate(p.installedDate) : '—', km(p.installedKm), km(p.limitKm)]);
    partsSection = section('Composants suivis', table(['Composant', 'Monté le', 'Monté à', 'Durée de vie'], rows));
  }

  return `
    <header class="dossier-head">
      ${photo ? `<img class="dossier-photo" src="${photo}" alt="">` : ''}
      <div>
        <h1>${esc(v.name)}</h1>
        <p class="dossier-sub">${esc(identity.find(([l]) => l.startsWith('Marque'))?.[1] || '')}</p>
      </div>
    </header>
    ${section('Identité', table(['', ''], identity))}
    ${section('Achat & coût', table(['', ''], purchase))}
    ${section('Historique d’entretien', table(['Date', 'Km', 'Type', 'Coût', 'Garage'], maintenance))}
    ${fuelSection}
    ${partsSection}
    ${section('Documents', table(['Document', 'Échéance', 'Note', 'Pièces jointes'], docs))}
    ${hasFiles ? `<section id="annexes"><h2>Annexes : pièces jointes</h2><p class="empty" id="annexesStatus">Chargement des pièces jointes…</p></section>` : ''}
    <p class="dossier-footer">Dossier généré le ${fmtDate(todayKey())} depuis l’application Mon Garage.</p>`;
}

function buildHTML(v, f) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Dossier de revente — ${esc(v.name)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #1a1a1a; max-width: 760px; margin: 0 auto; padding: 32px 24px 64px; line-height: 1.45; }
  .dossier-head { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
  .dossier-photo { width: 88px; height: 88px; object-fit: cover; border-radius: 12px; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  .dossier-sub { margin: 0; color: #666; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .03em; color: #666; margin: 28px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  td, th { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  th { display: none; }
  table:first-of-type td:first-child, table:first-of-type th:first-child { color: #666; width: 45%; }
  .empty { color: #999; font-style: italic; margin: 4px 0; }
  .dossier-footer { margin-top: 40px; color: #999; font-size: 12px; text-align: center; }
  .print-bar { position: sticky; top: 0; background: #fff; padding: 10px 0; margin-bottom: 8px; text-align: right; border-bottom: 1px solid #eee; }
  .print-bar button { font: inherit; padding: 8px 16px; border-radius: 8px; border: none; background: #111; color: #fff; cursor: pointer; }
  figure { margin: 16px 0; break-inside: avoid; }
  figure img { display: block; max-width: 100%; max-height: 900px; border: 1px solid #eee; border-radius: 8px; }
  figcaption, .annex-pdf { font-size: 13px; color: #666; margin-top: 4px; }
  @media print { .print-bar { display: none; } body { padding: 0; } }
</style>
</head>
<body>
  <div class="print-bar"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>
  ${buildBody(v, f)}
</body>
</html>`;
}

/** Annexes : photos jointes aux documents (lues sur l'appareil ou dans le cloud), PDF listés. */
async function fillAnnexes(win, f) {
  const doc = win.document;
  const host = doc.getElementById('annexes');
  if (!host) return;
  let missing = 0;
  for (const d of f.docs) {
    const title = d.type + (d.label ? ` · ${d.label}` : '');
    for (const file of d.files) {
      const caption = `${title}${file.name ? ` — ${file.name}` : ''}`;
      if (!file.mime.startsWith('image/')) {
        const p = doc.createElement('p');
        p.className = 'annex-pdf';
        p.textContent = `${caption} (PDF, à joindre séparément)`;
        host.appendChild(p);
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const data = file.file || (await getFile(file.id).catch(() => null));
      if (win.closed) return;
      if (!data?.startsWith('data:image/')) {
        missing++;
        continue;
      }
      const fig = doc.createElement('figure');
      const img = doc.createElement('img');
      img.src = data;
      img.alt = caption;
      const cap = doc.createElement('figcaption');
      cap.textContent = caption;
      fig.append(img, cap);
      host.appendChild(fig);
    }
  }
  const status = doc.getElementById('annexesStatus');
  if (missing) status.textContent = `${missing} photo(s) indisponible(s) hors ligne.`;
  else status.remove();
}

/** Ouvre le dossier de revente dans un nouvel onglet, prêt à imprimer en PDF. */
export function openResaleDossier(v, f) {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.open();
  win.document.write(buildHTML(v, f));
  win.document.close();
  fillAnnexes(win, f).catch(error => console.warn('[dossier] annexes', error));
  return true;
}
