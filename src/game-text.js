// The hidden offscreen renderer has no OS focus, so Chromium's native caret
// does not blink. Keep a DOM caret and keyboard confined to the game edition.
export function setupGameTextInput() {
  let gamepad = false, keyboard = null, preview = null, pointerDown = false, restoringFocus = false;
  const textField = element => element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement && ['text', 'number', 'search'].includes(element.type);
  const caret = document.createElement('span'); caret.className = 'game-text-caret'; caret.hidden = true; caret.setAttribute('aria-hidden', 'true');
  const measure = document.createElement('canvas').getContext('2d');
  function updateCaret() {
    const field = preview || document.activeElement;
    if (!textField(field) || field.disabled || field.readOnly && field !== preview) { caret.hidden = true; return; }
    // Multi-line inputs retain native selection; the single-line map name and
    // keyboard preview use an explicit insertion marker even without OS focus.
    if (field instanceof HTMLTextAreaElement) { caret.hidden = true; return; }
    field.classList.add('game-caret-target');
    const parent = field.closest('dialog') || document.body;
    if (caret.parentElement !== parent) parent.append(caret); // Also inside modal top layers.
    const rect = field.getBoundingClientRect(), style = getComputedStyle(field);
    const start = field.selectionStart ?? field.value.length;
    measure.font = style.font;
    const left = parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth);
    const right = parseFloat(style.paddingRight) + parseFloat(style.borderRightWidth);
    const width = measure.measureText(field.value).width;
    const alignment = style.textAlign === 'right' ? rect.width - left - right - width : style.textAlign === 'center' ? (rect.width - left - right - width) / 2 : 0;
    const offset = measure.measureText(field.value.slice(0, start)).width - field.scrollLeft + Math.max(0, alignment);
    const height = parseFloat(style.fontSize) * 1.2;
    caret.style.left = `${rect.left + Math.max(left, Math.min(rect.width - right, left + offset))}px`;
    caret.style.top = `${rect.top + (rect.height - height) / 2}px`;
    caret.style.height = `${height}px`; caret.dataset.position = start; caret.hidden = false;
  }
  function showKeyboard(target) {
    if (!gamepad || keyboard || restoringFocus || !textField(target) || target.readOnly || target.disabled || !target.isConnected) return;
    const start = target.selectionStart ?? target.value.length, end = target.selectionEnd ?? start;
    const element = document.createElement('dialog'); keyboard = element; element.className = 'game-keyboard'; element.id = 'game-keyboard';
    const heading = document.createElement('h2'); heading.textContent = target.type === 'number' ? 'Enter number' : 'Enter text';
    const field = document.createElement('input'); preview = field; field.type = 'text';
    if (target.maxLength > 0) field.maxLength = target.maxLength;
    field.value = target.value; field.setAttribute('aria-label', 'Controller text'); element.append(heading, field);
    const keys = document.createElement('div'); keys.className = 'game-keyboard-keys'; element.append(keys);
    const controls = document.createElement('div'); controls.className = 'game-keyboard-controls'; element.append(controls);
    let uppercase = true;
    function select(from, to = from) { field.focus({ preventScroll: true }); field.setSelectionRange(from, to); updateCaret(); }
    function insert(text) {
      const from = field.selectionStart, to = field.selectionEnd;
      const capacity = target.maxLength > 0 ? Math.max(0, target.maxLength - field.value.length + to - from) : text.length;
      field.setRangeText(text.slice(0, capacity), from, to, 'end'); select(field.selectionStart);
    }
    function key(parent, label, action) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      button.addEventListener('click', action); parent.append(button); return button;
    }
    const letters = [];
    const numeric = target.type === 'number'; element.classList.toggle('game-keyboard-numeric', numeric);
    for (const chars of numeric ? ['123', '456', '789', '0.-'] : ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM-_.']) {
      const row = document.createElement('div'); row.className = 'game-keyboard-row';
      row.style.setProperty('--keys', chars.length); row.style.width = numeric ? '100%' : `${chars.length * 10}%`; keys.append(row);
      for (const char of chars) {
        const button = key(row, char, () => insert(uppercase ? char : char.toLowerCase()));
        if (/[A-Z]/.test(char)) letters.push({ button, char });
      }
    }
    if (target.type !== 'number') key(controls, 'Space', () => insert(' '));
    key(controls, '←', () => select(Math.max(0, field.selectionStart - (field.selectionStart === field.selectionEnd ? 1 : 0))));
    key(controls, '→', () => select(Math.min(field.value.length, field.selectionEnd + (field.selectionStart === field.selectionEnd ? 1 : 0))));
    key(controls, '⌫', () => {
      const from = field.selectionStart, to = field.selectionEnd;
      field.setRangeText('', from === to ? Math.max(0, from - 1) : from, to, 'end'); select(field.selectionStart);
    });
    key(controls, 'Clear', () => { field.value = ''; select(0); });
    if (letters.length) key(controls, 'Shift', () => { uppercase = !uppercase; for (const { button, char } of letters) button.textContent = uppercase ? char : char.toLowerCase(); });
    function closeKeyboard() {
      if (keyboard !== element) return;
      const position = field.selectionStart;
      restoringFocus = true;
      element.close(); preview = null; element.remove(); keyboard = null;
      target.focus({ preventScroll: true });
      if (target.selectionStart !== null) target.setSelectionRange(Math.min(position, target.value.length), Math.min(position, target.value.length));
      restoringFocus = false; updateCaret();
    }
    key(controls, 'Cancel', closeKeyboard);
    key(controls, 'Done', () => {
      target.value = field.value;
      target.dispatchEvent(new Event('input', { bubbles: true })); target.dispatchEvent(new Event('change', { bubbles: true }));
      closeKeyboard();
    }).classList.add('primary');
    element.addEventListener('cancel', event => { event.preventDefault(); closeKeyboard(); });
    element.addEventListener('close', closeKeyboard, { once: true });
    document.body.append(element); element.showModal(); select(start, end);
  }
  document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
  document.addEventListener('pointerup', () => { pointerDown = false; }, true);
  document.addEventListener('pointercancel', () => { pointerDown = false; }, true);
  document.addEventListener('focusin', event => {
    updateCaret();
    // Wait for the initiating click to finish; opening on mouseDown can make
    // its mouseUp accidentally press a virtual key in the newly opened dialog.
    if (!pointerDown && !restoringFocus) queueMicrotask(() => showKeyboard(event.target));
  });
  document.addEventListener('click', event => { showKeyboard(event.target); updateCaret(); });
  for (const name of ['selectionchange', 'input', 'keyup', 'focusout', 'scroll']) document.addEventListener(name, updateCaret, true);
  window.addEventListener('resize', updateCaret);
  return value => { gamepad = value; if (value) showKeyboard(document.activeElement); updateCaret(); };
}
