// Display-only cursor positions in each receiver's own viewport. UI coordinates
// are normalized; map coordinates retain their shared world-space meaning.
export function createCursorOverlay(cursors) {
  const overlay = document.createElement('canvas'); overlay.id = 'shared-cursor-overlay';
  overlay.className = 'shared-cursor-overlay'; overlay.setAttribute('aria-hidden', 'true');
  const topLayer = typeof overlay.showPopover === 'function';
  if (topLayer) overlay.setAttribute('popover', 'manual');
  document.body.append(overlay);
  function foreground() {
    if (!topLayer) return;
    if (overlay.matches(':popover-open')) overlay.hidePopover();
    overlay.showPopover();
  }
  foreground();
  document.addEventListener('toggle', event => {
    if (event.target instanceof HTMLDialogElement && event.target.open) queueMicrotask(foreground);
  }, true);
  let pointer = null;
  document.addEventListener('pointermove', event => {
    pointer = { x: event.clientX / innerWidth, y: event.clientY / innerHeight,
      map: event.target === document.getElementById('map-canvas') && !document.querySelector('dialog[open]') };
  }, true);
  document.addEventListener('pointerleave', () => { pointer = null; });
  window.addEventListener('blur', () => { pointer = null; });
  const ctx = overlay.getContext('2d');
  return {
    pointer(world) { return pointer ? pointer.map && world ? { ...world, space: 'map', visible: true }
      : { x: pointer.x, y: pointer.y, space: 'ui', visible: true } : null; },
    draw(camera) {
      const ratio = devicePixelRatio || 1;
      if (overlay.width !== Math.round(innerWidth * ratio) || overlay.height !== Math.round(innerHeight * ratio)) {
        overlay.width = Math.round(innerWidth * ratio); overlay.height = Math.round(innerHeight * ratio);
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight);
      ctx.font = '11px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const rect = document.getElementById('map-canvas').getBoundingClientRect();
      for (const value of cursors.values(performance.now())) {
        if (!value.visible) continue;
        const ui = value.space === 'ui';
        const x = ui ? value.x * innerWidth : rect.left + value.x * camera.scale + camera.x;
        const y = ui ? value.y * innerHeight : rect.top + value.y * camera.scale + camera.y;
        if (!ui && (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom)) continue;
        ctx.save();
        if (!ui) { ctx.beginPath(); ctx.rect(rect.left, rect.top, rect.width, rect.height); ctx.clip(); }
        let color = 0; for (const character of value.author) color = (color * 31 + character.charCodeAt(0)) >>> 0;
        ctx.strokeStyle = ['#97d6ff', '#ffc693', '#dab2ff', '#a4edb3'][color % 4]; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7); ctx.stroke();
        const name = String(value.name || '?').slice(0, 100), width = ctx.measureText(name).width;
        const left = Math.max(0, Math.min(innerWidth - width - 8, x + 10)), top = Math.max(0, Math.min(innerHeight - 19, y + 7));
        ctx.fillStyle = '#000d'; ctx.fillRect(left, top, width + 8, 19); ctx.fillStyle = ctx.strokeStyle; ctx.fillText(name, left + 4, top + 3);
        ctx.restore();
      }
    },
  };
}
