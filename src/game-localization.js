// The Unity bridge supplies this machine's language. Source names, IDs, field
// values and export data never pass through the presentation translator.
let strings = {}, patterns = [], observer;
const cache = new Map();
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function translateGameText(value, ...values) {
  const source = String(value ?? '');
  if (values.length) value = source.replace(/\{(\d+)\}/g, (_, i) => String(values[Number(i)] ?? ''));
  else value = source;
  if (cache.has(value)) return cache.get(value);
  let result = strings[value];
  if (result === undefined && strings[source] !== undefined && values.length)
    result = strings[source].replace(/\{(\d+)\}/g, (_, i) => String(values[Number(i)] ?? ''));
  if (result === undefined) for (const pattern of patterns) {
    const match = pattern.regex.exec(value); if (!match) continue;
    const error = /^(Could not |Cannot paste here:|Floor check unavailable:)/.test(pattern.source);
    const args = match.slice(1).map(arg => pattern.source.startsWith('Generator default') ? strings[arg] ?? arg : error ? translateGameText(arg) : arg);
    result = pattern.value.replace(/\{(\d+)\}/g, (_, i) => args[pattern.indices.indexOf(Number(i))] ?? '');
    break;
  }
  result ??= value;
  if (cache.size > 2048) cache.clear(); cache.set(value, result); return result;
}
export function configureGameLocalization(info) {
  if (!info?.strings || !window.revolaGame) return;
  observer?.disconnect(); strings = info.strings; patterns = []; cache.clear();
  for (const [source, value] of Object.entries(strings)) {
    const indices = [], parts = []; let at = 0;
    for (const match of source.matchAll(/\{(\d+)\}/g)) { parts.push(escape(source.slice(at, match.index)), '(.*?)'); indices.push(Number(match[1])); at = match.index + match[0].length; }
    if (indices.length) { parts.push(escape(source.slice(at))); patterns.push({ regex: new RegExp('^' + parts.join('') + '$', 's'), value, indices, source,
      specificity: source.replace(/\{\d+\}/g, '').length }); }
  }
  patterns.sort((a,b) => b.specificity - a.specificity);
  document.documentElement.lang = info.language || 'en';
  const roomGuide = document.querySelector('.room-rotation-guide p');
  if (roomGuide) roomGuide.textContent = translateGameText('Drag to size a room. Shift keeps sides equal; Shift+R rotates 45°.');
  const seen = new WeakMap();
  const literal = element => element?.closest('[data-revola-literal],#document-title,#canvas-title,script,style,pre,code');
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (literal(node.parentElement)) return;
      const before = node.data, trimmed = before.trim(); if (!trimmed || seen.get(node) === before) return;
      const after = translateGameText(trimmed); if (after !== trimmed) node.data = before.replace(trimmed, () => after);
      seen.set(node, node.data);
    } else if (node.nodeType === Node.ELEMENT_NODE && !literal(node)) {
      for (const attr of ['title','aria-label','placeholder']) if (node.hasAttribute(attr)) {
        const old = node.getAttribute(attr), next = translateGameText(old); if (old !== next) node.setAttribute(attr,next);
      }
      for (const child of [...node.childNodes]) walk(child);
    }
  }
  walk(document.body);
  observer = new MutationObserver(records => { for (const record of records) walk(record.type === 'characterData' ? record.target : record.target); });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title','aria-label','placeholder'] });
}
