import { applyDocumentPatch, documentPatch } from './shared-document.js';

// Activated only by the authenticated Unity game bridge's initial capability.
// Browser and standalone desktop windows have no such bridge or capability.
export function sharedGame(initial, api) {
  const bridge = window.revolaGame, info = initial.shared;
  let documentId = info.document, revision = info.revision, authoritative = JSON.parse(initial.project), serial = info.lastId ?? 0;
  let queued = null, pending = false, frozen = info.frozen === true, canUndo = info.canUndo, canRedo = info.canRedo;
  let canCancel = info.cancelable === true;
  const cursors = new Map();
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
      api.busy(frozen); if (reset) cursors.clear();
      enqueue(authoritative, reset);
    } else if (value.document !== documentId) return;
    else if (value.kind === 'change') {
      if (value.revision <= revision) return;
      if (value.revision !== revision + 1) { bridge.request('snapshot').catch(error => api.status(error.message, true)); return; }
      authoritative = applyDocumentPatch(authoritative, value.patch); revision = value.revision;
      if (value.author === info.author) { canUndo = value.canUndo; canRedo = value.canRedo; api.remap?.(value.aliases ?? {}); }
      enqueue(authoritative);
    } else if (value.kind === 'cursor') {
      if (value.author !== info.author) { cursors.set(value.author, { ...value, received: performance.now() }); api.render(); }
    } else if (value.kind === 'freeze') { frozen = value.active; canCancel = value.cancelable === true; api.busy(frozen || pending); api.status(value.message || (frozen ? 'Waiting for all players to save…' : 'Shared map ready.')); }
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
    } catch (error) { api.status(error.message, true); await bridge.request('snapshot').catch(() => {}); enqueue(authoritative); }
    finally { pending = false; api.busy(frozen); flush(); }
  }
  let previousCursor = '', lastCursor = 0;
  setInterval(() => {
    flush();
    const point = api.pointer(), cursor = point && !document.querySelector('dialog[open]') ? { x: point.x, y: point.y, visible: true } : { x: 0, y: 0, visible: false };
    const text = JSON.stringify(cursor), now = performance.now();
    if ((text !== previousCursor || now - lastCursor > 1000) && now - lastCursor >= 66) {
      previousCursor = text; lastCursor = now;
      bridge.request('cursor', { data: text }).catch(() => {});
    }
    for (const [id, value] of cursors) if (now - value.received > 3000) { cursors.delete(id); api.render(); }
  }, 66);
  return { host: info.host, get frozen() { return frozen; }, get canCancel() { return canCancel; }, get canUndo() { return canUndo; }, get canRedo() { return canRedo; },
    submit: (before, after) => send('edit', before, after), undo: () => send('undo'), redo: () => send('redo'),
    draw(ctx, camera) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.font = '11px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      for (const value of cursors.values()) {
        if (!value.visible) continue;
        const x = value.x * camera.scale + camera.x, y = value.y * camera.scale + camera.y;
        let color = 0; for (const character of value.author) color = (color * 31 + character.charCodeAt(0)) >>> 0;
        ctx.strokeStyle = ['#97d6ff', '#ffc693', '#dab2ff', '#a4edb3'][color % 4]; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7); ctx.stroke();
        const name = String(value.name || '?').slice(0, 100), width = ctx.measureText(name).width;
        ctx.fillStyle = '#000d'; ctx.fillRect(x + 10, y + 7, width + 8, 19); ctx.fillStyle = ctx.strokeStyle; ctx.fillText(name, x + 14, y + 10);
      }
      ctx.restore();
    } };
}
