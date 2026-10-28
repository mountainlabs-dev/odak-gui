// Interface language for the main window: English or Turkish.
//
// The English text is the key: t('Connected to {path}', { path }) looks the sentence up in
// locales/tr.js and falls back to the English when it has no translation. The static page
// (index.html) is translated once at start-up by translatePage(); text nodes and the title,
// placeholder and aria-label attributes are looked up as they are, and elements marked
// data-i18n-html (sentences with <b> or links inside) are looked up by their whole inner HTML.
// Changing the language reloads the window (see renderer.js), so nothing is re-translated live.

import TR from './locales/tr.js';

const STORAGE_KEY = 'odak.language';
export const LANGUAGES = { en: 'English', tr: 'Türkçe' };

function detectLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in LANGUAGES) return saved;
  } catch (e) { /* storage blocked: follow the system */ }
  return (navigator.language || '').toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

export const lang = detectLanguage();
/** For toLocaleString() and friends. */
export const locale = lang === 'tr' ? 'tr-TR' : 'en-GB';

export function saveLanguage(code) {
  try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* ignore */ }
}

const normalize = (text) => text.replace(/\s+/g, ' ').trim();

/** Translate `text` and fill in {name} placeholders from `vars`. */
export function t(text, vars) {
  let out = lang === 'tr' && TR[text] !== undefined ? TR[text] : text;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? vars[key] : m));
  return out;
}

/** Translate the static text of the page (or of `root`). */
export function translatePage(root = document.body) {
  document.documentElement.lang = lang;
  if (lang === 'en') return;
  document.title = t(document.title);
  for (const el of root.querySelectorAll('[data-i18n-html]')) {
    const html = TR[normalize(el.innerHTML)];
    if (html !== undefined) el.innerHTML = html;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement.closest('script, style, [data-i18n-html]')
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const key = normalize(node.nodeValue);
    if (!key || TR[key] === undefined) continue;
    const lead = /^\s*/.exec(node.nodeValue)[0];
    const trail = /\s*$/.exec(node.nodeValue)[0];
    node.nodeValue = `${lead}${TR[key]}${trail}`;
  }
  for (const attr of ['title', 'placeholder', 'aria-label']) {
    for (const el of root.querySelectorAll(`[${attr}]`)) {
      const value = TR[normalize(el.getAttribute(attr))];
      if (value !== undefined) el.setAttribute(attr, value);
    }
  }
}
