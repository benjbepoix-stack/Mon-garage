/*
 * Dossier de revente : document imprimable (PDF via l'impression du
 * navigateur) regroupant l'historique complet d'un véhicule ou vélo —
 * un argument de vente à remettre à l'acheteur.
 *
 * Ouvert dans un nouvel onglet via document.write (pas de Blob URL, qui
 * serait refusée en mode PWA « écran d'accueil » sur iOS) ; l'ouverture
 * doit rester synchrone avec le clic pour ne pas être bloquée en popup.
 */
import { esc } from '../core/utils.js';
import { formatKey, todayKey } from '../core/dates.js';
import * as store from '../core/store.js';
import { costSummary, activeFuelEstimate, currentKm } from '../core/calc.js';
import { isBike, isElectric } from '../core/schema.js';
import { euro, euroRound, km, dec } from '../views/common.js';

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

  const docs = f.docs.map(d => [d.type + (d.label ? ` · ${d.label}` : ''), d.expiry ? fmtDate(d.expiry) : 'Sans échéance', d.note || '—']);

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
    ${section('Documents', table(['Document', 'Échéance', 'Note'], docs))}
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
  @media print { .print-bar { display: none; } body { padding: 0; } }
</style>
</head>
<body>
  <div class="print-bar"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>
  ${buildBody(v, f)}
</body>
</html>`;
}

/** Ouvre le dossier de revente dans un nouvel onglet, prêt à imprimer en PDF. */
export function openResaleDossier(v, f) {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.open();
  win.document.write(buildHTML(v, f));
  win.document.close();
  return true;
}
