/** Accessible form-field markup with labels, hints and error slots. */
import { html } from '../utils/helpers.js';

let counter = 0;
const nextId = (name) => `f-${name}-${(counter += 1)}`;

export function field({ name, label, type = 'text', value = '', placeholder = '', hint, required, autocomplete, inputmode, maxlength, min, max, step, autofocus, error, srLabel = false }) {
  const id = nextId(name);
  const describedBy = [hint && `${id}-hint`, `${id}-error`].filter(Boolean).join(' ');
  return html`
    <div class="field" data-field="${name}">
      <label class="field__label${srLabel ? ' sr-only' : ''}" for="${id}">${label}</label>
      <input class="input" id="${id}" name="${name}" type="${type}" value="${value ?? ''}" placeholder="${placeholder}"
        aria-describedby="${describedBy}"${required ? html` required aria-required="true"` : ''}${autocomplete ? html` autocomplete="${autocomplete}"` : ''}${inputmode ? html` inputmode="${inputmode}"` : ''}${maxlength ? html` maxlength="${maxlength}"` : ''}${min ? html` min="${min}"` : ''}${max ? html` max="${max}"` : ''}${step ? html` step="${step}"` : ''}${autofocus ? html` autofocus` : ''}${error ? html` aria-invalid="true"` : ''} />
      ${hint ? html`<p class="field__hint" id="${id}-hint">${hint}</p>` : ''}
      <p class="field__error" id="${id}-error" role="alert"${error ? '' : html` hidden`}>${error || ''}</p>
    </div>`;
}

export function textareaField({ name, label, value = '', placeholder = '', rows = 3, maxlength }) {
  const id = nextId(name);
  return html`
    <div class="field" data-field="${name}">
      <label class="field__label" for="${id}">${label}</label>
      <textarea class="textarea" id="${id}" name="${name}" rows="${rows}" placeholder="${placeholder}" aria-describedby="${id}-error"${maxlength ? html` maxlength="${maxlength}"` : ''}>${value ?? ''}</textarea>
      <p class="field__error" id="${id}-error" role="alert" hidden></p>
    </div>`;
}

export function selectField({ name, label, options, value, hint, placeholder }) {
  const id = nextId(name);
  return html`
    <div class="field" data-field="${name}">
      <label class="field__label" for="${id}">${label}</label>
      <select class="select" id="${id}" name="${name}" aria-describedby="${id}-error${hint ? ` ${id}-hint` : ''}">
        ${placeholder ? html`<option value="">${placeholder}</option>` : ''}
        ${options.map((option) => html`<option value="${option.value}"${option.value === value ? html` selected` : ''}>${option.label}</option>`)}
      </select>
      ${hint ? html`<p class="field__hint" id="${id}-hint">${hint}</p>` : ''}
      <p class="field__error" id="${id}-error" role="alert" hidden></p>
    </div>`;
}

/** Shows server/client validation errors next to the matching fields. */
export function showFieldErrors(form, errors = {}) {
  form.querySelectorAll('[data-field]').forEach((wrapper) => {
    const name = wrapper.dataset.field;
    const control = wrapper.querySelector('input, select, textarea');
    const slot = wrapper.querySelector('.field__error');
    const message = errors[name];
    if (control) control.toggleAttribute('aria-invalid', Boolean(message));
    if (control && message) control.setAttribute('aria-invalid', 'true');
    if (slot) {
      slot.textContent = message || '';
      slot.hidden = !message;
    }
  });
  const firstInvalid = form.querySelector('[aria-invalid="true"]');
  firstInvalid?.focus();
}
