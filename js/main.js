/* Point d'entrée : connexion, navigation (Rappels / Garage / Coûts), synchronisation. */
import { $, $$, esc, debounce } from './core/utils.js';
import * as store from './core/store.js';
import { rules, validate } from './core/validation.js';
import { readText, write } from './services/storage.js';
import { initFirebase, pushCloud, flushNow, clearPending, signIn, signUp, resetPassword, signOutUser, describeAuthError, currentUser, isConfigured } from './services/firebase.js';
import { initDialogs, confirmDialog, openPhotoLightbox, openSheet, closeSheet, closeAllSheets, isOpen } from './ui/dialog.js';
import { initWizards } from './ui/wizard.js';
import { applyTheme, renderStylePicker, renderThemeSwitch } from './ui/theme.js';
import { STYLES } from './core/schema.js';
import { renderStatus } from './ui/status.js';
import { toastError } from './ui/toast.js';
import { icon } from './ui/icons.js';
import { initCalendarPrompt } from './features/calendar-prompt.js';
import { initOverduePrompt, checkOverdue } from './features/overdue-prompt.js';
import { renderHome, publishAlerts, initHome } from './views/home.js';
import { initVehicles, openVehicle, openArchives } from './views/vehicles.js';
import { initDetail, renderDetail, scrollToSection, openKm } from './views/detail.js';
import { initMaintenance, openMaintenance, openReminder } from './views/maintenance.js';
import { initFuel } from './views/fuel.js';
import { initParts, openPart } from './views/parts.js';
import { initCosts, openPurchase, openFixed, renderCosts } from './views/costs.js';
import { initDocs, openDoc } from './views/docs.js';
import { initExpenses, openExpense } from './views/expenses.js';
import { scheduleBudgetSync, enableBudgetSync, resetBudgetSync } from './services/budget-sync.js';
import { enableAlertsSync, resetAlertsSync } from './services/carnet-sync.js';
import { retryPendingFiles, clearLocalFiles } from './services/files.js';
import { migrateInlineFiles } from './features/files-migration.js';
import { fieldsOf, photoHtml } from './views/common.js';

const LAST_UID = 'garage_last_uid';
const THEME_MIGRATED = 'garage_theme_auto';
/** Premier compte utilisé sur cet appareil, dont les données n'ont pas encore été reçues (uid). */
const ADOPT_UID = 'garage_adopt_uid';
let view = 'home';
let dataReady = false; // premier instantané du compte reçu
let firstAccount = false; // premier compte sur cet appareil : ses données priment sur les saisies sans compte

/* ---------- Navigation : #/v/<id>/<onglet> (Garage), #/couts/<id> (Coûts), sinon Rappels ---------- */
const hashFor = id => `#/v/${encodeURIComponent(id)}`;
const costsHash = id => `#/couts/${encodeURIComponent(id)}`;
const activeVehicles = () => store.vehicles().filter(v => !v.archived);

function route() {
  const m = /^#\/(v|couts)\/([^/]+)(?:\/(\w+))?/.exec(location.hash);
  const id = m ? decodeURIComponent(m[2]) : null;
  const v = id ? store.vehicle(id) : null;
  if (v) {
    if (store.activeId() !== id) store.setKeys({ activeId: id });
    view = m[1] === 'v' ? 'detail' : 'costs';
  } else {
    if (id) history.replaceState(null, '', location.pathname + location.search);
    view = 'home';
  }
  render();
  window.scrollTo({ top: 0 });
}

function openVehicleView(id) {
  location.hash = hashFor(id);
}

/** Depuis le pop-up des retards : page Entretien du véhicule, saisie de l'entretien (rappel coché). */
function goToReminder(vehicleId, reminderId) {
  location.hash = hashFor(vehicleId);
  route();
  openMaintenance(null, { reminderId });
}

function goHome() {
  location.hash = '';
}

/** Véhicule par défaut des onglets Entretien et Coûts : celui affiché, sinon le premier. */
function pickVehicle() {
  const list = activeVehicles();
  const a = store.active();
  return a && !a.archived ? a : list[0] || null;
}

function goNav(target) {
  if (target === 'home') return goHome();
  const v = pickVehicle();
  if (!v) return openVehicle('vehicle');
  location.hash = target === 'costs' ? costsHash(v.id) : hashFor(v.id);
}

/** Changer de véhicule depuis Entretien ou Coûts : même écran, autre véhicule. */
function chooseVehicle(id) {
  closeSheet('pickSheet');
  location.hash = view === 'costs' ? costsHash(id) : hashFor(id);
}

/** Feuille « Vos véhicules » ; depuis le Garage (bouton +), seulement les boutons d'ajout. */
function renderPick() {
  const home = view === 'home';
  $('#pickTitle').textContent = home ? 'Ajouter au garage' : 'Vos véhicules';
  $('#pickList').hidden = home;
  const cur = store.activeId();
  $('#pickList').innerHTML = activeVehicles()
    .map(v => `<button type="button" class="pick__row" data-pick="${esc(v.id)}" aria-current="${v.id === cur}">${photoHtml(v, 40)}<span class="pick__name">${esc(v.name)}</span>${v.id === cur ? `<span class="pick__check">${icon('check', 18)}</span>` : ''}</button>`)
    .join('');
  const archived = store.vehicles().filter(v => v.archived);
  $('#archivesLink').hidden = home || !archived.length;
  if (archived.length) $('#archivesLinkLabel').textContent = `Archives (${archived.length})`;
}

/* ---------- Rendu ---------- */
function render() {
  const v = view !== 'home' ? store.active() : null;
  if (view !== 'home' && !v) {
    view = 'home';
    history.replaceState(null, '', location.pathname + location.search);
  }
  const home = view === 'home';
  $('#homeView').hidden = !home;
  $('#detailView').hidden = view !== 'detail';
  $('#costsView').hidden = view !== 'costs';
  $('#topTitles').hidden = !home;
  $('#vehiclePick').hidden = home;
  $('#editVehicleBtn').hidden = view !== 'detail';
  $('#settingsBtn').hidden = !home;
  $('#fabBtn').setAttribute('aria-label', { home: 'Ajouter un véhicule', detail: 'Noter un entretien', costs: 'Ajouter une dépense' }[view]);
  document.body.dataset.view = view;
  document.body.classList.toggle('is-detail', !home);
  $$('#tabbar [data-nav]').forEach(b => {
    const on = b.dataset.nav === view;
    b.classList.toggle('is-active', on);
    if (on) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  if (home) {
    $('#topKicker').textContent = '';
    $('#topTitle').textContent = 'Garage';
    document.title = 'Mon Garage';
    renderHome();
  } else {
    $('#vehiclePickName').textContent = v.name;
    document.title = `${v.name} · ${view === 'costs' ? 'Coûts' : 'Mon Garage'}`;
    if (view === 'detail') renderDetail();
    else renderCosts(v, fieldsOf(v.id));
  }
  if (isOpen('pickSheet')) renderPick();
  publishLinks();
}

/** Bouton + : un véhicule (Garage), un entretien (Entretien) ou une dépense (Coûts). */
function onFab() {
  if (view === 'costs') return openExpense();
  if (view === 'detail') return openMaintenance();
  renderPick();
  openSheet('pickSheet', { focus: false });
}

/** Un rappel glissé « c'est fait » : la saisie de l'entretien s'ouvre, rappel coché. */
function reminderDone(vehicleId, reminderId, onClose) {
  if (store.activeId() !== vehicleId) store.setKeys({ activeId: vehicleId });
  openMaintenance(null, { reminderId, onClose });
}

/** Publication (débouncée) vers Mon Budget et Carnet ; n'a lieu qu'une fois les données du compte chargées. */
function publishLinks() {
  // Dépenses publiées vers Mon Budget (tous véhicules, archivés compris : la dépense a bien eu lieu).
  scheduleBudgetSync(store.vehicles().map(vehicle => ({ vehicle, field: fieldsOf(vehicle.id) })));
  // Échéances publiées vers Carnet (véhicules actifs).
  publishAlerts();
}

/** Données du compte chargées (cloud reçu) : liaisons avec Mon Budget et Carnet autorisées (rien sans compte). */
function enableLinks() {
  enableBudgetSync();
  enableAlertsSync();
}

/** Changement de compte ou déconnexion : rien n'est publié avant le chargement des données du compte suivant. */
function resetLinks() {
  resetBudgetSync();
  resetAlertsSync();
}

/* ---------- Pièces jointes ---------- */
/** Copie cloud exigée avant d'alléger un document : un compte est utilisé sur cet appareil. */
const needsCloud = () => Boolean(currentUser() || readText(LAST_UID, ''));

/** Range hors du nœud synchronisé les fichiers encore contenus dans les documents. */
function migrateFiles() {
  migrateInlineFiles({ needsCloud }).then(n => n && console.info(`[files] ${n} pièce(s) jointe(s) rangée(s) hors du nœud synchronisé`));
}

/**
 * Données prêtes (premier instantané du compte, ou appareil seul) : liaisons, envois de fichiers
 * en attente, migration des pièces jointes.
 */
function onDataReady() {
  enableLinks();
  publishLinks();
  checkOverdue();
  // En arrière-plan : hors ligne, la base Firebase ne répond qu'au retour du réseau.
  if (currentUser()) retryPendingFiles().catch(() => {});
  migrateFiles();
}

/* ---------- Thème ---------- */
/**
 * Thème « Auto » : l'ancien défaut « Sombre » enregistré devient « Auto », une seule fois
 * (sur l'appareil au lancement, puis à la première réception des données du compte).
 * Un choix fait dans les réglages arrête la migration.
 */
function migrateTheme(stage) {
  const done = readText(THEME_MIGRATED, '');
  if (done === 'cloud' || (stage === 'local' && done)) return;
  if (store.theme() === 'dark') store.setKeys({ theme: 'auto' });
  write(THEME_MIGRATED, stage);
}

/* ---------- Connexion ---------- */
let authMode = 'login';

function showAuth(state) {
  document.documentElement.classList.add('is-auth-pending');
  $('#authScreen').hidden = false;
  $('#authLoading').hidden = state !== 'loading';
  $('#authForm').hidden = state !== 'form';
  $('#authOffline').hidden = state !== 'offline';
}

function hideAuth() {
  document.documentElement.classList.remove('is-auth-pending');
  $('#authScreen').hidden = true;
}

function renderAuthMode() {
  const texts = {
    login: ['Connexion', 'Même compte que Ma Maison, Carnet, Allure et Mon budget.', 'Se connecter', 'Créer un compte'],
    signup: ['Créer mon compte', 'Un compte pour synchroniser votre garage entre vos appareils.', 'Créer le compte', 'J’ai déjà un compte'],
    reset: ['Mot de passe oublié', 'Indiquez votre e-mail : vous recevrez un lien pour choisir un nouveau mot de passe.', 'Envoyer le lien', 'Retour à la connexion']
  }[authMode];
  [$('#authTitle').textContent, $('#authSub').textContent, $('#authSubmit').textContent, $('#authSwitch').textContent] = texts;
  $('#authPasswordField').hidden = authMode === 'reset';
  $('#authForgot').hidden = authMode !== 'login';
  $('#authPassword').autocomplete = authMode === 'signup' ? 'new-password' : 'current-password';
  $('#authError').textContent = '';
  $('#authError').classList.remove('is-success');
}

async function onAuthSubmit(e) {
  e.preventDefault();
  const email = $('#authEmail').value.trim();
  const password = $('#authPassword').value;
  const err = $('#authError');
  const { valid, errors } = validate(
    { email, password },
    {
      email: [rules.required('L’e-mail'), v => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Adresse e-mail invalide.')],
      password: authMode === 'reset' ? [] : [rules.required('Le mot de passe'), v => (v.length >= 6 ? null : '6 caractères minimum.')]
    }
  );
  if (!valid) {
    err.textContent = Object.values(errors)[0];
    return;
  }
  const btn = $('#authSubmit');
  btn.classList.add('is-loading');
  btn.disabled = true;
  err.textContent = '';
  try {
    if (authMode === 'login') await signIn(email, password);
    else if (authMode === 'signup') await signUp(email, password);
    else {
      await resetPassword(email);
      err.classList.add('is-success');
      err.textContent = 'E-mail envoyé. Pensez à vérifier vos courriers indésirables.';
    }
  } catch (error) {
    console.error('[auth]', error);
    err.classList.remove('is-success');
    err.textContent = describeAuthError(error);
  } finally {
    btn.classList.remove('is-loading');
    btn.disabled = false;
  }
}

function onUser(user) {
  dataReady = false;
  resetLinks();
  if (user) {
    // Autre compte que le précédent sur cet appareil : on repart d'une base vide.
    const last = readText(LAST_UID, '');
    if (!last) write(ADOPT_UID, user.uid);
    if (last && last !== user.uid) {
      clearPending();
      store.resetLocal();
      clearLocalFiles();
      write(ADOPT_UID, '');
    }
    // Gardé jusqu'à la réception des données (lecture refusée, app fermée avant : toujours protégé).
    firstAccount = readText(ADOPT_UID, '') === user.uid;
    write(LAST_UID, user.uid);
    $('#accountLine').textContent = `Connecté : ${user.email}`;
    $('#logoutBtn').hidden = false;
    hideAuth();
    route();
  } else {
    // Déconnexion (ici ou depuis une autre app : session commune) : rien de l'ancien compte au-dessus de l'écran de connexion.
    closeAllSheets();
    authMode = 'login';
    renderAuthMode();
    showAuth('form');
  }
}

function initAuthUI() {
  $('#authForm').addEventListener('submit', onAuthSubmit);
  $('#authSwitch').addEventListener('click', () => {
    authMode = authMode === 'login' ? 'signup' : 'login';
    renderAuthMode();
  });
  $('#authForgot').addEventListener('click', () => {
    authMode = 'reset';
    renderAuthMode();
  });
  $('#authRetry').addEventListener('click', () => location.reload());
  $('#authLocal').addEventListener('click', () => {
    hideAuth();
    // La pastille « Local » de l'en-tête suffit à signaler le mode hors ligne.
    $('#accountLine').textContent = '';
    // Pop-up des entretiens en retard : une fois l'écran de connexion fermé, pas par-dessus.
    onDataReady();
  });
  $('#logoutBtn').addEventListener('click', async () => {
    if (!currentUser()) return;
    if (!(await confirmDialog({ title: 'Se déconnecter ?', message: 'Vos données restent enregistrées dans votre compte.', confirmLabel: 'Se déconnecter' }))) return;
    try {
      await signOutUser();
    } catch {
      toastError('Déconnexion impossible. Réessayez.');
    }
  });
}

/* ---------- Actions ---------- */
const OPENERS = {
  km: () => openKm(),
  maintenance: () => openMaintenance(),
  reminder: () => openReminder(),
  part: () => openPart(),
  purchase: () => openPurchase(),
  fixed: () => openFixed(),
  expense: () => openExpense(),
  doc: () => openDoc()
};

function onClick(e) {
  const photoBtn = e.target.closest('[data-photo]');
  if (photoBtn) {
    const img = photoBtn.querySelector('img');
    if (img?.src) openPhotoLightbox(img.src, img.alt);
    return;
  }
  const kmBtn = e.target.closest('[data-km]');
  if (kmBtn) {
    // Depuis l'accueil : le compteur se met à jour sans ouvrir la fiche.
    if (store.activeId() !== kmBtn.dataset.km) store.setKeys({ activeId: kmBtn.dataset.km });
    return openKm();
  }
  // Carte de l'accueil : elle ouvre la fiche, sauf ses échéances (liens vers l'onglet concerné).
  const card = e.target.closest('[data-vehicle]');
  if (card && !e.target.closest('a[href]')) return openVehicleView(card.dataset.vehicle);
  const add = e.target.closest('[data-new]');
  if (add) {
    closeSheet('pickSheet');
    return openVehicle(add.dataset.new);
  }
  const open = e.target.closest('[data-open]');
  if (open && OPENERS[open.dataset.open] && store.active()) OPENERS[open.dataset.open]();
}

function initGlobalErrors() {
  let last = 0;
  const report = error => {
    console.error(error);
    if (Date.now() - last < 4000) return;
    last = Date.now();
    toastError('Une erreur inattendue est survenue. Vos données sont conservées.');
  };
  window.addEventListener('error', e => report(e.error || e.message));
  window.addEventListener('unhandledrejection', e => report(e.reason));
}

async function init() {
  initGlobalErrors();
  store.loadLocal();
  migrateTheme('local');
  applyTheme(store.theme(), store.style());
  renderStylePicker(STYLES, store.style());
  renderThemeSwitch(store.theme());
  $$('[data-icon]').forEach(el => (el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 22)));

  initDialogs();
  initWizards();
  initCalendarPrompt();
  initVehicles({ deleted: () => goHome() });
  initHome();
  initDetail({
    onReminderDone: reminderDone,
    onEditNote: () => store.active() && openVehicle(store.active().kind, store.activeId())
  });
  initMaintenance();
  initFuel();
  initParts();
  initCosts();
  initDocs();
  initExpenses();
  initOverduePrompt({ onView: goToReminder });
  initAuthUI();

  store.subscribe(keys => {
    if (keys.includes('theme') || keys.includes('style')) {
      applyTheme(store.theme(), store.style(), { animate: true });
      renderStylePicker(STYLES, store.style());
      renderThemeSwitch(store.theme());
    }
    if (keys.length === 1 && keys[0] === 'activeId') return;
    render();
  });
  document.addEventListener('click', onClick);
  window.addEventListener('hashchange', route);
  $('#tabbar').addEventListener('click', e => {
    const b = e.target.closest('[data-nav]');
    if (b) goNav(b.dataset.nav);
  });
  $('#fabBtn').addEventListener('click', onFab);
  $('#vehiclePick').addEventListener('click', () => {
    renderPick();
    openSheet('pickSheet', { focus: false });
  });
  $('#pickList').addEventListener('click', e => {
    const b = e.target.closest('[data-pick]');
    if (b) chooseVehicle(b.dataset.pick);
  });
  // Nouvel entretien depuis la fiche : on montre l'historique, où il reçoit son tampon.
  document.addEventListener('garage:maintenance-saved', e => {
    if (e.detail.isNew && view === 'detail' && e.detail.vehicleId === store.activeId()) requestAnimationFrame(() => scrollToSection('history'));
  });
  $('#editVehicleBtn').addEventListener('click', () => store.active() && openVehicle(store.active().kind, store.activeId()));
  $('#settingsBtn').addEventListener('click', () => openSheet('settingsSheet'));
  $('#archivesLink').addEventListener('click', openArchives);
  $('#homeArchives').addEventListener('click', openArchives);
  $('#stylePicker')?.addEventListener('click', e => {
    const pick = e.target.closest('[data-style-pick]')?.dataset.stylePick;
    if (pick && pick !== store.style()) store.setKeys({ style: pick });
  });
  $('#themeSwitch').addEventListener('change', e => {
    const val = e.target.closest('input[name="theme"]')?.value;
    if (!val) return;
    write(THEME_MIGRATED, 'cloud'); // choix explicite : plus de migration
    if (val !== store.theme()) store.setKeys({ theme: val });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
    else render();
  });
  window.addEventListener('pagehide', flushNow);
  window.addEventListener('resize', debounce(render, 200));

  route();

  // Mises à jour : voir sw.js. Un nouveau service worker recharge la page une fois.
  // Enregistré avant la branche Firebase pour fonctionner même sans projet configuré.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) location.reload();
    });
    navigator.serviceWorker.register('sw.js').catch(error => console.warn('[sw] enregistrement impossible', error));
  }

  if (!isConfigured()) {
    // Pas encore de projet Firebase : tout fonctionne sur l'appareil.
    hideAuth();
    renderStatus('local', 'Données enregistrées sur cet appareil');
    $('#accountLine').textContent = 'Données enregistrées sur cet appareil (synchronisation à venir).';
    onDataReady();
    return;
  }
  showAuth('loading');
  store.setCloudSink(pushCloud);
  const ok = await initFirebase({
    onUser,
    onRemote: remote => {
      if (!dataReady && firstAccount) {
        // Premier compte sur cet appareil, déjà rempli : les saisies faites sans compte ne
        // remplacent rien dans le compte (les véhicules créés sur l'appareil y sont ajoutés).
        clearPending();
        store.adoptRemote(remote);
      } else store.applyRemote(remote);
      migrateTheme('cloud');
      if (dataReady) {
        enableLinks();
        // Fichier ajouté dans un document par un appareil resté à l'ancienne version : rangé à part.
        migrateFiles();
      }
    },
    // Premier instantané reçu (même vide : les données de l'appareil deviennent celles du compte).
    // Lecture refusée (loaded: false) : rien n'est publié ni repris ; pop-up des retards sur les données de l'appareil.
    onReady: ({ loaded } = {}) => {
      if (!loaded) return checkOverdue();
      dataReady = true;
      write(ADOPT_UID, '');
      onDataReady();
    },
    onStatus: renderStatus,
    onError: message => toastError(`Synchronisation : ${message}`),
    onAck: store.acknowledge,
    getSnapshot: store.cloudSnapshot
  });
  if (!ok) showAuth('offline');
}

init();
