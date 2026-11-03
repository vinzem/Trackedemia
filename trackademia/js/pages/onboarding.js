import { bootstrapScreen } from '../app.js';
import { navigate } from '../router.js';
import { setState } from '../state.js';
import { connectCalendar } from '../features/calendar-sync.js';
import { createButton, setButtonLoading } from '../components/button.js';
import { openBottomSheet } from '../components/bottom-sheet.js';
import { showToast } from '../components/toast.js';
import { createElement, icon } from '../utils/helpers.js';
import { validateSignUp } from '../utils/validation.js';

const ILLUSTRATION = `
  <svg class="onboarding__illustration" viewBox="0 0 240 168" role="img" aria-label="Illustration: a note turning into a calendar reminder">
    <rect x="16" y="20" width="112" height="132" rx="14" fill="#F0F0F0" stroke="#C7C7C7" stroke-width="2" stroke-dasharray="6 5"/>
    <rect x="32" y="42" width="64" height="8" rx="4" fill="#D4D4D4"/>
    <rect x="32" y="62" width="80" height="6" rx="3" fill="#E5E5E5"/>
    <rect x="32" y="78" width="72" height="6" rx="3" fill="#E5E5E5"/>
    <rect x="32" y="94" width="44" height="6" rx="3" fill="#FDE68A"/>
    <rect x="32" y="110" width="76" height="6" rx="3" fill="#E5E5E5"/>
    <path d="M136 86h22" stroke="#A3A3A3" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 5"/>
    <path d="M154 80l7 6-7 6" fill="none" stroke="#A3A3A3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="166" y="44" width="62" height="74" rx="12" fill="#FFFFFF" stroke="#C7C7C7" stroke-width="2" stroke-dasharray="6 5"/>
    <path d="M166 64h62" stroke="#D4D4D4" stroke-width="2"/>
    <rect x="178" y="74" width="12" height="10" rx="2" fill="#E5E5E5"/>
    <rect x="196" y="74" width="12" height="10" rx="2" fill="#6366F1" opacity=".85"/>
    <rect x="178" y="92" width="12" height="10" rx="2" fill="#E5E5E5"/>
    <rect x="196" y="92" width="12" height="10" rx="2" fill="#E5E5E5"/>
    <circle cx="214" cy="136" r="12" fill="#F0F0F0" stroke="#C7C7C7" stroke-width="2" stroke-dasharray="4 4"/>
    <path d="M185 144l9-16 9 16z" fill="#F0F0F0" stroke="#C7C7C7" stroke-width="2" stroke-linejoin="round"/>
  </svg>
`;

function finishOnboarding(message, detail) {
  setState({ flash: { message, detail } });
  navigate('notes');
}

async function handleGoogle(button) {
  setButtonLoading(button, true, 'Connecting to Google…');
  const response = await connectCalendar();
  if (!response.ok) {
    setButtonLoading(button, false);
    showToast({ message: 'Could not connect', detail: response.error?.message, variant: 'error' });
    return;
  }
  finishOnboarding('Signed in with Google', 'Calendar connected (simulated).');
}

function openEmailSignUp() {
  const form = createElement(`
    <form class="stack-2" novalidate>
      <div class="field">
        <label class="field__label" for="signup-name">Name</label>
        <input id="signup-name" name="name" class="input" type="text" autocomplete="name" placeholder="Alex Rivera" required>
        <p class="field__error" hidden></p>
      </div>
      <div class="field">
        <label class="field__label" for="signup-email">Email</label>
        <input id="signup-email" name="email" class="input" type="email" autocomplete="email" placeholder="you@school.edu" required>
        <p class="field__error" hidden></p>
      </div>
      <p class="text-caption">Prototype only: your details are stored in this browser.</p>
      <button type="submit" hidden aria-hidden="true" tabindex="-1"></button>
    </form>
  `);

  const submit = () => {
    const values = { name: form.elements.name.value.trim(), email: form.elements.email.value.trim() };
    const { valid, errors } = validateSignUp(values);
    ['name', 'email'].forEach((key) => {
      const input = form.elements[key];
      const errorEl = input.parentElement.querySelector('.field__error');
      errorEl.hidden = !errors[key];
      errorEl.textContent = errors[key] || '';
      input.setAttribute('aria-invalid', errors[key] ? 'true' : 'false');
    });
    if (!valid) return false;
    setState({ user: { ...values, provider: 'email', googleConnected: false }, calendarConnected: false });
    finishOnboarding(`Welcome, ${values.name.split(' ')[0]}!`, 'Connect Google Calendar from your profile anytime.');
    return true;
  };

  const sheet = openBottomSheet({
    title: 'Sign up with Email',
    description: 'Create an account to start capturing notes.',
    content: form,
    actions: [
      { label: 'Create account', variant: 'primary', icon: 'mail', keepOpen: true, onClick: () => submit() },
      { label: 'Cancel', variant: 'ghost' },
    ],
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit();
  });
  return sheet;
}

bootstrapScreen('onboarding', (content) => {
  const view = createElement(`
    <section class="screen onboarding">
      <div class="onboarding__brand">
        <span class="logo-mark">${icon('logo', { size: 32 })}</span>
        <h1 class="onboarding__name">Trackademia</h1>
        <p class="onboarding__tagline">Your notes. Your reminders. Automatically.</p>
      </div>
      <div class="onboarding__art">${ILLUSTRATION}</div>
      <div class="onboarding__actions"></div>
    </section>
  `);

  const actions = view.querySelector('.onboarding__actions');
  const googleButton = createButton({
    label: 'Continue with Google',
    variant: 'primary',
    icon: 'google',
    block: true,
    size: 'lg',
    annotation: 1,
    placement: 'top-right',
    onClick: () => handleGoogle(googleButton),
  });
  const support = createElement('<p class="text-caption text-center">Connect your calendar to auto-create reminders.</p>');
  const emailButton = createButton({
    label: 'Sign up with Email',
    variant: 'link',
    annotation: 2,
    placement: 'right',
    onClick: openEmailSignUp,
  });
  actions.append(googleButton, support, emailButton);
  content.appendChild(view);
});
