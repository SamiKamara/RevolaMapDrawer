import { generateDefaultObjects, objectGenerationGeometry } from './population.js';

export function setupObjectGeneration(api) {
  const button = document.getElementById('generate-objects'), confirm = document.getElementById('object-regenerate-dialog');
  const progress = document.getElementById('object-generation-progress'), bar = progress.querySelector('progress'), stage = progress.querySelector('[role=status]');
  let working = false, choosing = false, cancellation, legacyGeometry;
  progress.addEventListener('cancel', event => { event.preventDefault(); cancellation?.abort(); });
  progress.querySelector('button').addEventListener('click', () => cancellation?.abort());
  function update() {
    const owner = api.doc();
    // Older sources may contain objects without a generation stamp. Remember
    // their first observed geometry so enlarging/editing the map during this
    // session cannot turn those categories into permanently preserved contents.
    if (!owner.objects?.length) legacyGeometry = null;
    else if (!owner.objectGeneration) legacyGeometry ??= objectGenerationGeometry(JSON.parse(JSON.stringify(owner)));
    button.disabled = working || choosing || api.blocked() || !api.floor()?.closed;
  }
  async function run() {
    const owner = api.doc(), original = JSON.stringify(owner), snapshot = JSON.parse(original), floor = api.floor(), baseline = legacyGeometry;
    const signature = await objectGenerationGeometry(snapshot);
    const regenerate = snapshot.objectGeneration ? snapshot.objectGeneration.geometry !== signature
      : !!snapshot.objects?.length && !!baseline && await baseline !== signature;
    if (api.doc() !== owner || JSON.stringify(owner) !== original) { api.status('The map changed. Press Generate objects again.'); return; }
    if (regenerate) {
      const accepted = await new Promise(resolve => {
        confirm.addEventListener('close', () => resolve(confirm.returnValue === 'regenerate'), { once: true });
        confirm.returnValue = ''; confirm.showModal();
      });
      if (!accepted) return;
      snapshot.objects = [];
    }
    if (api.doc() !== owner || JSON.stringify(owner) !== original) { api.status('The map changed. Press Generate objects again.'); return; }
    working = true; cancellation = new AbortController(); api.setBusy(true); bar.value = 0; stage.textContent = 'Preparing objects…'; progress.showModal();
    try {
      const result = await generateDefaultObjects(snapshot, { floor, signal: cancellation.signal, onProgress: (text, fraction) => { bar.value = fraction; stage.textContent = text; } });
      if (cancellation.signal.aborted) throw new Error('Object generation cancelled.');
      if (api.doc() !== owner || JSON.stringify(owner) !== original) throw new Error('The map changed. No generated objects were applied.');
      if (!regenerate && result.objects.length === 0) { api.status('No new objects fit. Categories with valid objects are kept; other categories still use Map Manager generation.'); return; }
      api.setBusy(false);
      const kept = result.skipped.length ? ` Kept existing categories: ${result.skipped.join(', ')}.` : '';
      const short = Object.keys(result.targets).filter(key => (result.counts[key] ?? 0) < result.targets[key]);
      api.commit(() => {
        owner.objects = [...(regenerate ? [] : owner.objects ?? []), ...result.objects];
        owner.objectGeneration = { version: 1, geometry: signature };
        api.clearSelection();
      }, `${regenerate ? 'Regenerated' : 'Generated'} ${result.objects.length} objects.${kept}${short.length ? ` Limited safe space: ${short.join(', ')}.` : ''}`);
    } catch (error) { api.status(error.message, !cancellation.signal.aborted); }
    finally { progress.close(); working = false; cancellation = null; api.setBusy(false); update(); }
  }
  button.addEventListener('click', () => {
    if (button.disabled || working || choosing) return;
    choosing = true; update();
    run().catch(error => api.status(error.message, true)).finally(() => { choosing = false; update(); });
  });
  // New/Open replaces the map; editing previews and Undo may also replace the
  // document object, so reference identity alone cannot reset this baseline.
  return { update, reset() { legacyGeometry = null; update(); } };
}
