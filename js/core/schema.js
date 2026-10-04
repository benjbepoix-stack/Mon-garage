/*
 * Schéma des données de Mon Garage (table plate de clés, synchronisée clé par clé).
 *
 *   vehicles            liste des véhicules et vélos (sans photo)
 *   photo_<id>          photo compressée (data-URL JPEG), séparée pour ne pas renvoyer
 *                       toutes les photos à chaque modification
 *   v_<id>_maintenance  entretiens réalisés
 *   v_<id>_reminders    plan d'entretien (rappels date / kilométrage)
 *   v_<id>_fixed        frais fixes (assurance, stationnement, carburant estimé…)
 *   v_<id>_loan         financement (crédit, LOA, LLD)
 *   v_<id>_docs         documents et échéances
 *   v_<id>_parts        composants suivis en usure (vélos)
 *   activeId, theme, style
 *
 * v_<id>_fuel (pleins saisis à la main) a existé mais a été retiré : le carburant ne
 * se compte plus que par estimation (voir v_<id>_fixed, catégorie « Carburant » auto).
 * store.js purge les éventuelles données restantes de cette ancienne clé au chargement.
 */
import { isDateKey } from './dates.js';

export const FIELDS = ['maintenance', 'reminders', 'fixed', 'loan', 'docs', 'parts'];

export const FUELS = ['Essence', 'Diesel', 'Hybride', 'Hybride rechargeable', 'Électrique', 'GPL', 'Autre'];
export const BIKE_TYPES = ['Route', 'Gravel', 'VTT', 'VTC', 'Vélo électrique', 'Autre'];
export const MAINTENANCE_TYPES = {
  vehicle: ['Vidange', 'Révision', 'Pneus', 'Freins', 'Distribution', 'Batterie', 'Climatisation', 'Carrosserie', 'Contrôle technique', 'Réparation', 'Lavage', 'Autre'],
  bike: ['Révision', 'Chaîne', 'Cassette', 'Pneus', 'Plaquettes / patins', 'Câbles / durites', 'Purge freins', 'Roulements', 'Réglage', 'Nettoyage', 'Réparation', 'Autre']
};
export const DOC_TYPES = {
  vehicle: ['Assurance', 'Contrôle technique', 'Carte grise', 'Garantie', 'Vignette Crit’Air', 'Facture', 'Autre'],
  bike: ['Facture', 'Garantie', 'Assurance vol', 'Marquage Bicycode', 'Autre']
};
export const FIXED_CATEGORIES = ['Assurance', 'Stationnement', 'Abonnement', 'Péage / badge', 'Carburant', 'Autre'];
export const LOAN_TYPES = { none: 'Payé comptant', credit: 'Crédit', loa: 'LOA', lld: 'LLD' };
export const ARCHIVE_REASONS = ['Vendu', 'Accidenté / épave', 'Volé', 'Autre'];

/** Rappels proposés à la création (modifiables). */
export const DEFAULT_REMINDERS = {
  vehicle: [
    { label: 'Vidange', everyKm: 15000, everyMonths: 12 },
    { label: 'Pneus', everyKm: 40000, everyMonths: 0 },
    { label: 'Freins', everyKm: 30000, everyMonths: 0 }
  ],
  bike: [{ label: 'Révision', everyKm: 5000, everyMonths: 12 }]
};
/**
 * Plan d'entretien proposé selon la motorisation (voiture) ou le type (vélo),
 * à partir des préconisations usuelles des constructeurs (généralisées par
 * motorisation, pas par modèle précis — à ajuster selon le carnet d'entretien
 * réel du véhicule). Rempli automatiquement à la création d'une fiche.
 */
export const FUEL_REMINDERS = {
  Essence: [
    { label: 'Vidange', everyKm: 15000, everyMonths: 12 },
    { label: 'Filtre à air', everyKm: 30000, everyMonths: 0 },
    { label: 'Bougies', everyKm: 60000, everyMonths: 0 },
    { label: 'Pneus', everyKm: 40000, everyMonths: 0 },
    { label: 'Freins', everyKm: 30000, everyMonths: 0 },
    { label: 'Liquide de frein', everyKm: 0, everyMonths: 24 }
  ],
  Diesel: [
    { label: 'Vidange', everyKm: 15000, everyMonths: 12 },
    { label: 'Filtre à air', everyKm: 30000, everyMonths: 0 },
    { label: 'Distribution', everyKm: 120000, everyMonths: 0 },
    { label: 'Pneus', everyKm: 40000, everyMonths: 0 },
    { label: 'Freins', everyKm: 30000, everyMonths: 0 },
    { label: 'Liquide de frein', everyKm: 0, everyMonths: 24 }
  ],
  GPL: [
    { label: 'Vidange', everyKm: 15000, everyMonths: 12 },
    { label: 'Filtre à air', everyKm: 30000, everyMonths: 0 },
    { label: 'Bougies', everyKm: 60000, everyMonths: 0 },
    { label: 'Pneus', everyKm: 40000, everyMonths: 0 },
    { label: 'Freins', everyKm: 30000, everyMonths: 0 },
    { label: 'Révision circuit GPL', everyKm: 0, everyMonths: 24 }
  ],
  Électrique: [
    { label: 'Pneus', everyKm: 30000, everyMonths: 0 },
    { label: 'Freins', everyKm: 60000, everyMonths: 0 },
    { label: 'Liquide de frein', everyKm: 0, everyMonths: 24 },
    { label: 'Filtre d’habitacle', everyKm: 0, everyMonths: 12 },
    { label: 'Batterie 12V', everyKm: 0, everyMonths: 48 },
    { label: 'Liquide de refroidissement batterie', everyKm: 0, everyMonths: 72 }
  ]
};
FUEL_REMINDERS.Hybride = [
  { label: 'Vidange', everyKm: 15000, everyMonths: 12 },
  { label: 'Filtre à air', everyKm: 30000, everyMonths: 0 },
  { label: 'Pneus', everyKm: 40000, everyMonths: 0 },
  { label: 'Freins', everyKm: 40000, everyMonths: 0 },
  { label: 'Liquide de frein', everyKm: 0, everyMonths: 24 },
  { label: 'Batterie 12V', everyKm: 0, everyMonths: 48 }
];
FUEL_REMINDERS['Hybride rechargeable'] = FUEL_REMINDERS.Hybride;

export const BIKE_TYPE_REMINDERS = {
  VTT: [
    { label: 'Révision', everyKm: 3000, everyMonths: 6 },
    { label: 'Chaîne', everyKm: 2000, everyMonths: 0 }
  ],
  'Vélo électrique': [
    { label: 'Révision', everyKm: 3000, everyMonths: 6 },
    { label: 'Chaîne', everyKm: 2500, everyMonths: 0 },
    { label: 'Batterie', everyKm: 0, everyMonths: 12 }
  ]
};

/**
 * Rappels proposés à la création d'une fiche, affinés selon la motorisation
 * (voiture) ou le type (vélo) quand ils sont connus, sinon plan générique.
 */
export function presetReminders({ kind, fuel, bikeType } = {}) {
  if (kind === 'bike') return BIKE_TYPE_REMINDERS[bikeType] || DEFAULT_REMINDERS.bike;
  return FUEL_REMINDERS[fuel] || DEFAULT_REMINDERS.vehicle;
}

/** Composants de vélo proposés : seuil d'usure en km. */
export const DEFAULT_PARTS = [
  { name: 'Chaîne', limitKm: 3000 },
  { name: 'Cassette', limitKm: 9000 },
  { name: 'Pneu avant', limitKm: 5000 },
  { name: 'Pneu arrière', limitKm: 4000 },
  { name: 'Plaquettes', limitKm: 2500 }
];

export const fieldKey = (id, field) => `v_${id}_${field}`;
export const photoKey = id => `photo_${id}`;
export function parseFieldKey(key) {
  const m = /^v_(.+)_([a-z]+)$/.exec(key);
  return m && FIELDS.includes(m[2]) ? { id: m[1], field: m[2] } : null;
}

export const asArray = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const str = (v, max = 200) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v)).trim().slice(0, max);
/** Pièce jointe (image ou PDF) en data URL : jamais tronquée (la couper corromprait le fichier), rejetée si trop lourde ou de type inattendu. */
const fileUrl = v => (typeof v === 'string' && /^data:(image\/|application\/pdf)/.test(v) && v.length <= 7_000_000 ? v : '');
const num = (v, max = 1e9) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(max, Math.round(n * 100) / 100) : 0;
};
const int = (v, max = 1e8) => Math.round(num(v, max));
const date = v => (isDateKey(v) ? v : '');
const id = v => (typeof v === 'string' && v ? v.slice(0, 60) : typeof v === 'number' && Number.isFinite(v) ? String(v) : null);
const oneOf = (v, list, fallback = '') => (list.includes(v) ? v : fallback);

/** Dernier jour du mois précédant le 1er jour donné (ex. « 2026-10-01 » → « 2026-09-30 »). */
function monthEndBefore(isoFirstOfMonth) {
  const [y, m] = isoFirstOfMonth.split('-').map(Number);
  const d = new Date(y, m - 1, 0); // jour 0 d'un mois = dernier jour du mois précédent
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Les périodes d'estimation carburant automatique (voir js/views/fuel.js) ne doivent jamais se
 * chevaucher au niveau du mois : les coûts se comptent par mois entier, sans prorata journalier
 * (fixedFor dans calc.js), donc deux périodes touchant le même mois le comptaient chacune en
 * entier ce mois-là. D'anciennes données (bascules faites en plein mois, avant correction) peuvent
 * encore avoir ce chevauchement : on le répare au chargement, en clôturant chaque période la veille
 * du 1er du mois où démarre la suivante.
 */
function repairAutoFuelOverlaps(list) {
  const autoFuel = list.filter(x => x.category === 'Carburant' && x.auto).sort((a, b) => a.start.localeCompare(b.start));
  if (autoFuel.length < 2) return list;
  const fixedEnd = new Map();
  for (let i = 0; i < autoFuel.length - 1; i++) {
    const cur = autoFuel[i];
    const nextStartMonth = autoFuel[i + 1].start.slice(0, 7);
    if (cur.end && cur.end.slice(0, 7) < nextStartMonth) continue; // déjà correct
    const monthEnd = monthEndBefore(`${nextStartMonth}-01`);
    fixedEnd.set(cur.id, monthEnd > cur.start ? monthEnd : cur.start);
  }
  if (!fixedEnd.size) return list;
  return list.map(x => (fixedEnd.has(x.id) ? { ...x, end: fixedEnd.get(x.id) } : x));
}
const byDateDesc = (a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id));
const MAX_DOC_FILES = 10;

/**
 * Pièces jointes d'un document : plusieurs fichiers possibles (`files`). Reprend aussi l'ancien
 * format à un seul fichier (`file`/`fileName`, avant l'ajout des pièces jointes multiples).
 */
function normalizeDocFiles(x) {
  const legacy = fileUrl(x.file);
  const raw = Array.isArray(x.files) ? x.files : legacy ? [{ id: x.id, file: legacy, fileName: x.fileName }] : [];
  return raw
    .filter(isObj)
    .map(y => ({ id: id(y.id) || makeId(), file: fileUrl(y.file), fileName: str(y.fileName, 150) }))
    .filter(y => y.file)
    .slice(0, MAX_DOC_FILES);
}

export function normalizeVehicles(raw) {
  return asArray(raw)
    .filter(isObj)
    .map(v => ({
      id: id(v.id),
      kind: v.kind === 'bike' ? 'bike' : 'vehicle',
      name: str(v.name, 80) || 'Sans nom',
      brand: str(v.brand, 60),
      model: str(v.model, 60),
      year: v.year ? int(v.year, 2100) || '' : '',
      mileage: int(v.mileage),
      fuel: oneOf(v.fuel, FUELS),
      plate: str(v.plate, 20).toUpperCase(),
      bikeType: oneOf(v.bikeType, BIKE_TYPES),
      bikeSize: str(v.bikeSize, 30),
      bikeWheels: str(v.bikeWheels, 60),
      bikeGroupset: str(v.bikeGroupset, 60),
      notes: str(v.notes, 2000),
      purchaseDate: date(v.purchaseDate),
      purchasePrice: num(v.purchasePrice),
      purchaseKm: int(v.purchaseKm),
      resaleValue: num(v.resaleValue),
      hasPhoto: Boolean(v.hasPhoto),
      archived: Boolean(v.archived),
      archivedReason: Boolean(v.archived) ? oneOf(v.archivedReason, ARCHIVE_REASONS, 'Autre') : '',
      archivedDate: Boolean(v.archived) ? date(v.archivedDate) : ''
    }))
    .filter(v => v.id);
}

const normalizers = {
  maintenance: raw =>
    asArray(raw)
      .filter(isObj)
      .map(x => ({ id: id(x.id), date: date(x.date), km: int(x.km), type: str(x.type, 40) || 'Autre', label: str(x.label, 120), cost: num(x.cost), garage: str(x.garage, 80), note: str(x.note, 1000) }))
      .filter(x => x.id && x.date)
      .sort(byDateDesc),
  reminders: raw =>
    asArray(raw)
      .filter(isObj)
      .map(x => ({ id: id(x.id), label: str(x.label, 60), everyKm: int(x.everyKm, 1e6), everyMonths: int(x.everyMonths, 240), lastDate: date(x.lastDate), lastKm: int(x.lastKm) }))
      .filter(x => x.id && x.label && (x.everyKm || x.everyMonths)),
  fixed: raw =>
    repairAutoFuelOverlaps(
      asArray(raw)
        .filter(isObj)
        .map(x => ({
          id: id(x.id),
          label: str(x.label, 80),
          category: oneOf(x.category, FIXED_CATEGORIES, 'Autre'),
          amount: num(x.amount, 1e6),
          period: x.period === 'year' ? 'year' : 'month',
          start: date(x.start),
          end: date(x.end),
          // Entrée « Carburant » générée par l'estimation automatique (coûts) plutôt que saisie à la main.
          auto: Boolean(x.auto),
          fuelConsumption: num(x.fuelConsumption, 100),
          fuelPrice: num(x.fuelPrice, 1000)
        }))
        .filter(x => x.id && x.amount && x.start)
    ),
  loan: raw => {
    const x = isObj(raw) ? raw : {};
    return {
      type: LOAN_TYPES[x.type] ? x.type : 'none',
      principal: num(x.principal),
      rate: num(x.rate, 100),
      months: int(x.months, 120),
      monthly: num(x.monthly, 1e5),
      start: date(x.start),
      firstPayment: num(x.firstPayment),
      residual: num(x.residual),
      // Solde réglé par anticipation (crédit) : clôt le prêt à cette date, mensualités suivantes ignorées.
      earlyPayoffAmount: num(x.earlyPayoffAmount),
      earlyPayoffDate: date(x.earlyPayoffDate)
    };
  },
  docs: raw =>
    asArray(raw)
      .filter(isObj)
      .map(x => ({ id: id(x.id), type: str(x.type, 40) || 'Autre', label: str(x.label, 120), expiry: date(x.expiry), note: str(x.note, 1000), files: normalizeDocFiles(x) }))
      .filter(x => x.id)
      .sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999')),
  parts: raw =>
    asArray(raw)
      .filter(isObj)
      .map(x => ({ id: id(x.id), name: str(x.name, 60), installedKm: int(x.installedKm), installedDate: date(x.installedDate), limitKm: int(x.limitKm, 1e6), cost: num(x.cost) }))
      .filter(x => x.id && x.name)
};

export const DEFAULTS = { maintenance: [], reminders: [], fixed: [], loan: normalizers.loan(null), docs: [], parts: [] };

/** Styles graphiques proposés (le premier est celui par défaut). */
export const STYLES = [
  { id: 'graphite', name: 'Graphite', hint: 'Sobre' },
  { id: 'british', name: 'British', hint: 'Vert anglais' }
];

export function normalizeKey(key, value) {
  if (key === 'vehicles') return normalizeVehicles(value);
  if (key === 'activeId') return typeof value === 'string' ? value : null;
  if (key === 'theme') return value === 'light' ? 'light' : 'dark';
  if (key === 'style') return STYLES.some(x => x.id === value) ? value : STYLES[0].id;
  if (key.startsWith('photo_')) return typeof value === 'string' && value.startsWith('data:image/') ? value : null;
  const fk = parseFieldKey(key);
  return fk ? normalizers[fk.field](value) : value;
}

export const isKnownKey = key => key === 'vehicles' || key === 'activeId' || key === 'theme' || key === 'style' || key.startsWith('photo_') || Boolean(parseFieldKey(key));

export const makeId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const isBike = v => v?.kind === 'bike';
export const isElectric = v => v?.fuel === 'Électrique';
