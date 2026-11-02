import { applyDocumentPatch, documentPatch } from './shared-document.js';
import { SharedCursors } from './shared-cursors.js';
import { createCursorOverlay } from './shared-cursor-overlay.js';

// Activated only by the authenticated Unity game bridge's initial capability.
// Browser and standalone desktop windows have no such bridge or capability.
export function sharedGame(initial, api) {
  const bridge = window.revolaGame, info = initial.shared;
  const labels = { waiting: 'Waiting for all players to save…', ready: 'Shared map ready.', cancel: 'Cancel save',
    saving: 'Saving map…', saved: 'Saved {0}.', loading: 'Loading map…', failed: 'The shared map operation failed.', ...info.labels };
  let documentId = info.document, revision = info.revision, authoritative = JSON.parse(initial.project), serial = info.lastId ?? 0;
  let queued = null, pending = false, frozen = info.frozen === true, canUndo = info.canUndo, canRedo = info.canRedo;
  let canCancel = info.cancelable === true;
  const cursors = new SharedCursors();
  const cursorOverlay = createCursorOverlay(cursors);
  api.issues?.labels(info.labels?.issues);
  let cursorFrame = false;
  function animateCursors() {
    if (cursorFrame || !cursors.moving(performance.now())) return;
    cursorFrame = true;
    requestAnimationFrame(() => { cursorFrame = false; api.render(); animateCursors(); });
  }
  function enqueue(project, reset = false) { queued = { project, reset }; flush(); }
  function flush() {
    if (queued && !pending && !api.blocked()) { const value = queued; queued = null; api.apply(value.project, value.reset); }
    api.history(canUndo, canRedo); api.host(info.host);
  }
  function receive(value) {
    if (!value || value.session !== info.session) return;
    if (value.kind === 'document') {
      const reset = value.document !== documentId;
      documentId = value.document; revision = value.revision; authoritative = JSON.parse(value.project);
      canUndo = value.canUndo; canRedo = value.canRedo; serial = Math.max(reset ? 0 : serial, value.lastId ?? 0); pending = false;
      api.busy(frozen); if (reset) { cursors.clear(); api.render(); }
      enqueue(authoritative, reset);
    } else if (value.document !== documentId) return;
    else if (value.kind === 'change') {
      if (value.revision <= revision) return;
      if (value.revision !== revision + 1) { bridge.request('snapshot').catch(error => api.status(error.message, true)); return; }
      authoritative = applyDocumentPatch(authoritative, value.patch); revision = value.revision;
      if (value.author === info.author) { canUndo = value.canUndo; canRedo = value.canRedo; api.remap?.(value.aliases ?? {}); }
      enqueue(authoritative);
    } else if (value.kind === 'cursor') {
      if (value.author !== info.author) { cursors.update(value, performance.now()); api.render(); animateCursors(); }
    } else if (value.kind === 'freeze') {
      frozen = value.active; canCancel = value.cancelable === true; api.busy(frozen || pending);
      api.status(value.message || (frozen ? labels.waiting : labels.ready));
      if (value.issue) api.issues?.show(value.issue);
    }
    else if (value.kind === 'saved') { api.saved(authoritative); }
  }
  bridge.onShared(receive);
  async function send(action, before, after) {
    if (pending || frozen) return;
    pending = true; api.busy(true);
    try {
      const result = await bridge.request('shared', { data: JSON.stringify({ id: ++serial, revision, action,
        patch: action === 'edit' ? documentPatch(before, after) : undefined }) });
      receive(result);
    } catch (error) { api.status(error.message, true); if (error.issue) api.issues?.show(error); await bridge.request('snapshot').catch(() => {}); enqueue(authoritative); }
    finally { pending = false; api.busy(frozen); flush(); }
  }
  let previousCursor = '', lastCursor = 0;
  setInterval(() => {
    flush();
    const cursor = cursorOverlay.pointer(api.pointer()) || { x: 0, y: 0, visible: false, space: 'ui' };
    const text = JSON.stringify(cursor), now = performance.now();
    if ((text !== previousCursor || now - lastCursor > 1000) && now - lastCursor >= 66) {
      previousCursor = text; lastCursor = now;
      bridge.request('cursor', { data: text }).catch(() => {});
    }
    if (cursors.expire(now)) api.render();
  }, 66);
  return { host: info.host, labels, get frozen() { return frozen; }, get canCancel() { return canCancel; }, get canUndo() { return canUndo; }, get canRedo() { return canRedo; },
    submit: (before, after) => send('edit', before, after), undo: () => send('undo'), redo: () => send('redo'),
    draw(ctx, camera) {
      cursorOverlay.draw(camera);
    } };
}
