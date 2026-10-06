/*
 * Ouverture des pièces jointes (documents) dans l'app.
 *
 * - Photo : lightbox existante.
 * - PDF : visionneuse plein écran intégrée (rendu page par page avec pdf.js, chargé à la demande
 *   depuis cdnjs et mis en cache par le service worker). Un bouton « Ouvrir / Partager » passe
 *   par la feuille de partage native (iPhone : Fichiers, Imprimer, Mail…) ou un nouvel onglet.
 *
 * Avant, un PDF était « téléchargé » via un lien data: : sur iPhone en mode app (PWA) il s'ouvrait
 * en plein écran sans bouton retour, ou pas du tout ; Chrome bloque aussi l'ouverture des data:.
 */
import { esc } from '../core/utils.js';
import { icon } from './icons.js';
import { openSheet, openPhotoLightbox } from './dialog.js';
import { toastError } from './toast.js';

const PDFJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
const MAX_PAGES = 40;
const ZOOMS = [1, 1.5, 2, 3];
const ANIMATION_MS = 320;

let pdfjsPromise = null;

/** Charge pdf.js une seule fois (script UMD : window.pdfjsLib). */
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!pdfjsPromise) {
    pdfjsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `${PDFJS_BASE}pdf.min.js`;
      s.crossOrigin = 'anonymous';
      s.onload = () => {
        if (!window.pdfjsLib) return reject(new Error('pdf.js indisponible'));
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}pdf.worker.min.js`;
        resolve(window.pdfjsLib);
      };
      s.onerror = () => reject(new Error('pdf.js injoignable'));
      document.head.appendChild(s);
    }).catch(error => {
      pdfjsPromise = null; // nouvel essai à la prochaine ouverture (ex. retour du réseau)
      throw error;
    });
  }
  return pdfjsPromise;
}

/** data:…;base64,… → octets. */
function dataUrlBytes(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const meta = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  if (!/;base64/i.test(meta)) return new TextEncoder().encode(decodeURIComponent(body));
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const pdfName = name => {
  const base = (name || 'document').trim() || 'document';
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
};

/** Ouvre le PDF hors de l'app : feuille de partage native si possible, sinon nouvel onglet, sinon téléchargement. */
async function openExternally(bytes, name) {
  const fileName = pdfName(name);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  try {
    const file = new File([blob], fileName, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: fileName });
      return;
    }
  } catch (error) {
    if (error?.name === 'AbortError') return; // partage annulé par l'utilisateur
  }
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Visionneuse PDF plein écran. */
export function openPdfViewer(dataUrl, name = '') {
  let bytes;
  try {
    bytes = dataUrlBytes(dataUrl);
  } catch {
    toastError('Ce PDF est illisible (fichier endommagé).');
    return;
  }
  const title = name || 'Document PDF';
  const el = document.createElement('div');
  el.className = 'sheet-backdrop sheet-backdrop--dialog sheet-backdrop--pdf';
  el.hidden = true;
  el.innerHTML = `
    <div class="sheet sheet--pdf" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1">
      <header class="pdf-viewer__bar">
        <button type="button" class="icon-btn" data-close aria-label="Fermer">${icon('close', 20)}</button>
        <span class="pdf-viewer__title">${esc(title)}</span>
        <span class="pdf-viewer__pages" data-pages></span>
        <button type="button" class="icon-btn" data-zoom="-1" aria-label="Dézoomer" disabled>−</button>
        <button type="button" class="icon-btn" data-zoom="1" aria-label="Zoomer" disabled>+</button>
        <button type="button" class="icon-btn" data-external aria-label="Ouvrir ou partager le PDF" title="Ouvrir / Partager">${icon('share', 19)}</button>
      </header>
      <div class="pdf-viewer__scroll" data-scroll>
        <p class="pdf-viewer__status" data-status>Chargement du PDF…</p>
        <div class="pdf-viewer__pages-list" data-list></div>
      </div>
    </div>`;
  document.body.appendChild(el);

  const scroll = el.querySelector('[data-scroll]');
  const list = el.querySelector('[data-list]');
  const status = el.querySelector('[data-status]');
  const zoomBtns = [...el.querySelectorAll('[data-zoom]')];
  let doc = null;
  let zoomIndex = 0;
  let renderToken = 0;
  let closed = false;

  const setStatus = (text, { fallback = false } = {}) => {
    status.hidden = !text;
    status.innerHTML = text ? `${esc(text)}${fallback ? `<br><button type="button" class="btn btn--primary btn--sm pdf-viewer__open" data-external>${icon('share', 16)}<span>Ouvrir le PDF</span></button>` : ''}` : '';
  };

  async function render() {
    const token = ++renderToken;
    const zoom = ZOOMS[zoomIndex];
    zoomBtns[0].disabled = zoomIndex === 0;
    zoomBtns[1].disabled = zoomIndex === ZOOMS.length - 1;
    const width = Math.max(240, scroll.clientWidth - 24) * zoom;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    list.style.width = zoom > 1 ? `${Math.round(width)}px` : '';
    const count = Math.min(doc.numPages, MAX_PAGES);
    const canvases = [];
    list.innerHTML = '';
    for (let i = 1; i <= count; i++) {
      const c = document.createElement('canvas');
      c.className = 'pdf-viewer__page';
      list.appendChild(c);
      canvases.push(c);
    }
    if (doc.numPages > MAX_PAGES) {
      const more = document.createElement('p');
      more.className = 'pdf-viewer__status';
      more.textContent = `Seules les ${MAX_PAGES} premières pages sont affichées : « Ouvrir / Partager » pour la suite.`;
      list.appendChild(more);
    }
    for (let i = 1; i <= count; i++) {
      if (closed || token !== renderToken) return;
      // eslint-disable-next-line no-await-in-loop
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      // Limite la taille des canvas (mémoire des iPhone) tout en restant net.
      const scale = Math.min((width * dpr) / base.width, 4096 / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const c = canvases[i - 1];
      c.width = Math.floor(viewport.width);
      c.height = Math.floor(viewport.height);
      c.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
      // eslint-disable-next-line no-await-in-loop
      await page.render({ canvasContext: c.getContext('2d'), viewport }).promise;
      page.cleanup();
    }
  }

  el.addEventListener('click', e => {
    if (e.target.closest('[data-external]')) {
      openExternally(bytes, name).catch(() => toastError('Impossible d’ouvrir ce PDF hors de l’app.'));
      return;
    }
    const z = e.target.closest('[data-zoom]');
    if (z && doc) {
      const next = Math.max(0, Math.min(ZOOMS.length - 1, zoomIndex + Number(z.dataset.zoom)));
      if (next !== zoomIndex) {
        zoomIndex = next;
        render().catch(() => {});
      }
    }
  });

  openSheet(el, {
    focus: false,
    onClose: () => {
      closed = true;
      renderToken++;
      doc?.destroy();
      setTimeout(() => el.remove(), ANIMATION_MS + 50);
    }
  });

  loadPdfJs()
    .then(pdfjs => pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise)
    .then(d => {
      if (closed) return d.destroy();
      doc = d;
      setStatus('');
      el.querySelector('[data-pages]').textContent = `${d.numPages} p.`;
      return render();
    })
    .catch(error => {
      if (closed) return;
      const offline = !navigator.onLine || /injoignable|indisponible/.test(error?.message || '');
      setStatus(
        error?.name === 'PasswordException'
          ? 'Ce PDF est protégé par un mot de passe.'
          : offline
            ? 'Aperçu indisponible hors ligne.'
            : 'Aperçu impossible pour ce PDF.',
        { fallback: true }
      );
    });
}

/** Ouvre une pièce jointe de document (photo ou PDF). */
export function openAttachment(file, name = '') {
  if (!file) return;
  if (file.startsWith('data:image/')) return openPhotoLightbox(file, name);
  if (file.startsWith('data:application/pdf')) return openPdfViewer(file, name);
  toastError('Format de pièce jointe non reconnu.');
}

