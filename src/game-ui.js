// Only active in the renderer embedded in Revola's own window.
export function setupGameEditor({ snapshot, replace, confirmReplacement, saved, blocked, closed, status, setBusy }) {
  const bridge = window.revolaGame;
  let gamepadMode = false, keyboardOpen = false;
  document.body.classList.add('game-editor');
  // Render dropdowns as DOM controls too: native OS menus cannot own the game's
  // controller cursor or reliably appear in an offscreen bitmap.
  function chooseOption(target) {
    if (!(target instanceof HTMLSelectElement) || target.disabled || document.getElementById('game-select')) return;
    const popup = document.createElement('dialog'); popup.id = 'game-select';
    const heading = document.createElement('h2'); heading.textContent = target.getAttribute('aria-label') || 'Choose an option'; popup.append(heading);
    const list = document.createElement('div'); list.className = 'game-select-list'; popup.append(list);
    for (const option of target.options) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = option.textContent; button.disabled = option.disabled;
      button.addEventListener('click', () => { target.value = option.value; target.dispatchEvent(new Event('input', { bubbles: true })); target.dispatchEvent(new Event('change', { bubbles: true })); popup.close(); }); list.append(button);
    }
    const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.addEventListener('click', () => popup.close()); popup.append(cancel);
    popup.addEventListener('close', () => popup.remove(), { once: true }); document.body.append(popup); popup.showModal();
  }
  document.addEventListener('pointerdown', event => { if (event.target instanceof HTMLSelectElement) { event.preventDefault(); chooseOption(event.target); } }, true);
  document.addEventListener('mousedown', event => { if (event.target instanceof HTMLSelectElement) event.preventDefault(); }, true);
  document.addEventListener('keydown', event => { if (event.target instanceof HTMLSelectElement && ['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); chooseOption(event.target); } }, true);
  for (const id of ['project-button', 'save-all-button']) document.getElementById(id).style.display = 'none';
  document.querySelector('.image-export-actions').style.display = 'none';
  const nav = document.querySelector('[aria-label="File actions"]');
  function button(id, text, action) {
    const element = document.createElement('button'); element.id = id; element.textContent = text;
    element.addEventListener('click', action); nav.append(element); return element;
  }
  function dialog(title, field, confirm) {
    const element = document.createElement('dialog'), form = document.createElement('form'); form.method = 'dialog';
    const heading = document.createElement('h2'); heading.textContent = title;
    const cancel = document.createElement('button'); cancel.value = 'cancel'; cancel.textContent = 'Cancel'; cancel.formNoValidate = true;
    const ok = document.createElement('button'); ok.value = 'ok'; ok.textContent = confirm;
    form.append(heading, field, cancel, ok); element.append(form); document.body.append(element);
    return new Promise(resolve => {
      element.addEventListener('close', () => { resolve(element.returnValue === 'ok' ? field.value : null); element.remove(); }, { once: true });
      element.showModal(); field.focus();
    });
  }
  let saving = false;
  async function save(saveAs = false, launch = false) {
    if (saving || blocked() || launch && !closed()) return;
    const project = snapshot();
    let name = project.name;
    if (saveAs) {
      const field = document.createElement('input'); field.required = true; field.maxLength = 80; field.value = name;
      field.setAttribute('aria-label', 'Map name');
      name = await dialog('Save map as', field, 'Save');
      if (name === null) return;
      project.name = name.trim() || 'Untitled map';
    }
    saving = true; setBusy(true); update(); status(launch ? 'Saving and generating map…' : 'Saving map…');
    try {
      const result = await bridge.request('save', { project: JSON.stringify(project), name: project.name, saveAs, launch });
      // A cancelled save, write failure or generation failure never clears dirty state.
      if (saveAs) replace(project);
      saved(project);
      status(`Saved ${result.name}.${result.warning ? ` ${result.warning}` : launch ? ' Launching map…' : ''}`);
    } catch (error) { status(`Could not ${launch ? 'launch' : 'save'}: ${error.message}`, true); }
    finally { saving = false; setBusy(false); update(); }
  }
  async function close() {
    if (saving || document.querySelector('dialog[open]') || !(await confirmReplacement('Leave the map editor?'))) return;
    await bridge.request('close');
  }
  async function open() {
    if (saving || blocked() || !(await confirmReplacement())) return;
    try {
      const result = await bridge.request('list');
      if (!result.entries.length) { status('No saved maps yet. Use New to create one.'); return; }
      const field = document.createElement('select'); field.setAttribute('aria-label', 'Saved map');
      for (const entry of result.entries) { const option = document.createElement('option'); option.value = entry.key; option.textContent = entry.name; field.append(option); }
      const key = await dialog('Open map', field, 'Open'); if (key === null) return;
      const file = await bridge.request('open', { key }); replace(JSON.parse(file.project)); status(`Opened ${file.name}.`);
    } catch (error) { status(`Could not open: ${error.message}`, true); }
  }
  const saves = [button('game-save', 'Save', () => save()), button('game-save-as', 'Save as', () => save(true)),
    button('game-launch', 'Save and launch', () => save(false, true))];
  saves[2].classList.add('save-all');
  button('game-folder', 'Show in explorer', () => bridge.request('folder').catch(error => status(error.message, true)));
  const back = button('game-back', 'Back to Test maps', close);
  const hint = document.createElement('div'); hint.className = 'gamepad-help'; hint.hidden = true;
  hint.textContent = 'Left stick: cursor · Action / Attack: click or hold to drag · Right stick: scroll / zoom · Zoom in / out: zoom · RB: pan · Utility: back';
  document.querySelector('.topbar').after(hint);
  function textField(element) {
    return element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement && ['text', 'number', 'search'].includes(element.type);
  }
  async function showKeyboard(target) {
    if (!gamepadMode || keyboardOpen || !textField(target) || target.readOnly || target.disabled) return;
    keyboardOpen = true;
    const element = document.createElement('dialog'); element.className = 'game-keyboard'; element.id = 'game-keyboard';
    const heading = document.createElement('h2'); heading.textContent = target.type === 'number' ? 'Enter number' : 'Enter text';
    const preview = document.createElement('input'); preview.readOnly = true; preview.value = target.value; preview.setAttribute('aria-label', 'Controller text');
    element.append(heading, preview);
    let uppercase = true;
    const letters = [];
    function key(label, action) { const key = document.createElement('button'); key.type = 'button'; key.textContent = label; key.addEventListener('click', action); element.append(key); return key; }
    for (const char of target.type === 'number' ? '1234567890.-' : '1234567890QWERTYUIOPASDFGHJKLZXCVBNM-_.') {
      const keyButton = key(char, () => { preview.value += uppercase ? char : char.toLowerCase(); });
      if (/[A-Z]/.test(char)) letters.push({ element: keyButton, char });
    }
    key('Space', () => { preview.value += ' '; }); key('⌫', () => { preview.value = preview.value.slice(0, -1); });
    key('Clear', () => { preview.value = ''; });
    if (letters.length) key('Shift', () => { uppercase = !uppercase; for (const { element, char } of letters) element.textContent = uppercase ? char : char.toLowerCase(); });
    key('Cancel', () => element.close());
    key('Done', () => {
      target.value = target.maxLength > 0 ? preview.value.slice(0, target.maxLength) : preview.value;
      target.dispatchEvent(new Event('input', { bubbles: true })); target.dispatchEvent(new Event('change', { bubbles: true })); element.close();
    });
    document.body.append(element);
    element.addEventListener('close', () => { element.remove(); setTimeout(() => { keyboardOpen = false; }, 0); }, { once: true });
    element.showModal();
  }
  document.addEventListener('focusin', event => showKeyboard(event.target));
  bridge.onInputMode(value => { gamepadMode = value; hint.hidden = !value; if (value) showKeyboard(document.activeElement); });
  function update() {
    for (const element of saves) element.disabled = saving || blocked();
    saves[2].disabled ||= !closed(); back.disabled = saving;
    document.getElementById('new-button').disabled = saving;
    document.getElementById('open-button').disabled = saving;
  }
  bridge.onClose(close);
  return { save, open, close, update };
}
