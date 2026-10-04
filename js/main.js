/* Point d'entrée : connexion, navigation (accueil / fiche), synchronisation. */
import { $, $$, debounce } from './core/utils.js';
import * as store from './core/store.js';
import { isBike } from './core/schema.js';
import { rules, validate } from './core/validation.js';
import { readText, write } from './services/storage.js';
import { initFirebase, pushCloud, flushNow, clearPending, signIn, signUp, resetPassword, signOutUser, describeAuthError, currentUser, isConfigured } from './services/firebase.js';
import { initDialogs, confirmDialog, openPhotoLightbox, openSheet } from './ui/dialog.js';
import { applyTheme, renderStylePicker, renderThemeSwitch } from './ui/theme.js';
import { STYLES } from './core/schema.js';
import { renderStatus } from './ui/status.js';
import { toast, toastError } from './ui/toast.js';
import { icon } from './ui/icons.js';
import { initCalendarPrompt } from './features/calendar-prompt.js';
import { initOverduePrompt, checkOverdue } from './features/overdue-prompt.js';
import { renderHome } from './views/home.js';
import { initVehicles, openVehicle, openArchives } from './views/vehicles.js';
import { initDetail, renderDetail, setTab, currentTab, openKm } from './views/detail.js';
import { initMaintenance, openMaintenance, openReminder } from './views/maintenance.js';
import { initFuel } from './views/fuel.js';
import { initParts, openPart } from './views/parts.js';
import { initCosts, openPurchase, openFixed, resetCostWindow } from './views/costs.js';
import { initDocs, openDoc } from './views/docs.js';

const LAST_UID = 'garage_last_uid';
let view = 'home';

/* ---------- Navigation (#/v/<id>/<onglet>) ---------- */
const hashFor = (id, tab) => `#/v/${encodeURIComponent(id)}${tab && tab !== 'overview' ? `/${tab}` : ''}`;

function route() {
  const m = /^#\/v\/([^/]+)(?:\/(\w+))?/.exec(location.hash);
  const id = m ? decodeURIComponent(m[1]) : null;
  const v = id ? store.vehicle(id) : null;
  if (v) {
    if (store.activeId() !== id) store.setKeys({ activeId: id });
    if (view !== 'detail') resetCostWindow();
    setTab(m[2] || 'overview', v);
    view = 'detail';
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

function goToReminder(vehicleId, reminderId) {
  location.hash = hashFor(vehicleId, 'maintenance');
  route();
  openReminder(reminderId);
}

function goTab(tab) {
  const v = store.active();
  if (!v) return;
  setTab(tab, v);
  history.replaceState(null, '', hashFor(v.id, currentTab()));
  render();
  const tabs = $('#vehicleTabs');
  if (tabs.getBoundingClientRect().top < 0 || window.scrollY > tabs.offsetTop) window.scrollTo({ top: Math.max(0, $('#vehicleHero').offsetTop + $('#vehicleHero').offsetHeight - 40), behavior: 'smooth' });
}

function goHome() {
  if (history.length > 1 && /^#\/v\//.test(location.hash)) history.back();
  else location.hash = '';
}

/* ---------- Rendu ---------- */
function render() {
  const v = view === 'detail' ? store.active() : null;
  if (view === 'detail' && !v) {
    view = 'home';
    history.replaceState(null, '', location.pathname + location.search);
  }
  const detail = view === 'detail';
  $('#homeView').hidden = detail;
  $('#detailView').hidden = !detail;
  $('#backBtn').hidden = !detail;
  $('#editVehicleBtn').hidden = !detail;
  $('#settingsBtn').hidden = detail;
  document.body.classList.toggle('is-detail', detail);
  $('#topKicker').textContent = detail ? (isBike(v) ? 'Vélo' : 'Véhicule') : 'Garage personnel';
  $('#topTitle').textContent = detail ? v.name : 'Mon Garage';
  document.title = detail ? `${v.name} · Mon Garage` : 'Mon Garage';
  if (detail) renderDetail();
  else renderHome();
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
    login: ['Connexion', 'Retrouvez vos véhicules sur tous vos appareils.', 'Se connecter', 'Créer un compte'],
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
  if (user) {
    // Autre compte que le précédent sur cet appareil : on repart d'une base vide.
    const last = readText(LAST_UID, '');
    if (last && last !== user.uid) {
      clearPending();
      store.resetLocal();
    }
    write(LAST_UID, user.uid);
    $('#accountLine').textContent = `Connecté : ${user.email}`;
    $('#logoutBtn').hidden = false;
    hideAuth();
    route();
  } else {
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
    $('#accountLine').textContent = 'Mode hors ligne : données de cet appareil uniquement.';
    toast('Mode hors ligne', { type: 'info' });
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
  doc: () => openDoc()
};

function onClick(e) {
  const photoBtn = e.target.closest('[data-photo]');
  if (photoBtn) {
    const img = photoBtn.querySelector('img');
    if (img?.src) openPhotoLightbox(img.src, img.alt);
    return;
  }
  const card = e.target.closest('[data-vehicle]');
  if (card) return openVehicleView(card.dataset.vehicle);
  const add = e.target.closest('[data-new]');
  if (add) return openVehicle(add.dataset.new);
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
  applyTheme(store.theme(), store.style());
  renderStylePicker(STYLES, store.style());
  renderThemeSwitch(store.theme());
  $$('[data-icon]').forEach(el => (el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 22)));

  initDialogs();
  initCalendarPrompt();
  initVehicles({ deleted: () => goHome() });
  initDetail({ onTab: goTab });
  initMaintenance();
  initFuel();
  initParts();
  initCosts();
  initDocs();
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
  $('#backBtn').addEventListener('click', goHome);
  $('#editVehicleBtn').addEventListener('click', () => store.active() && openVehicle(store.active().kind, store.activeId()));
  $('#settingsBtn').addEventListener('click', () => openSheet('settingsSheet'));
  $('#archivesLink').addEventListener('click', openArchives);
  $('#stylePicker').addEventListener('click', e => {
    const pick = e.target.closest('[data-style-pick]')?.dataset.stylePick;
    if (pick && pick !== store.style()) store.setKeys({ style: pick });
  });
  $('#themeSwitch').addEventListener('change', e => {
    const val = e.target.closest('input[name="theme"]')?.value;
    if (val && val !== store.theme()) store.setKeys({ theme: val });
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
    checkOverdue();
    return;
  }
  showAuth('loading');
  store.setCloudSink(pushCloud);
  const ok = await initFirebase({
    onUser,
    onRemote: remote => {
      store.applyRemote(remote);
      checkOverdue();
    },
    onStatus: renderStatus,
    onError: message => toastError(`Synchronisation : ${message}`),
    onAck: store.acknowledge,
    getSnapshot: store.cloudSnapshot
  });
  if (!ok) {
    showAuth('offline');
    checkOverdue();
  }
}

init();
