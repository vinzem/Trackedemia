/**
 * Screen 01: onboarding / sign-in. Handles sign-in, sign-up, password reset
 * request, setting a new password, the email-verification notice and the
 * OAuth/email-link callback.
 */
import { setButtonLoading } from '../components/button.js';
import { icon, logo } from '../components/icons.js';
import { field, showFieldErrors } from '../components/input.js';
import { toast } from '../components/toast.js';
import { authService } from '../features/auth/auth-service.js';
import { navigate } from '../router.js';
import { formValues, html, mount } from '../utils/helpers.js';
import { validateEmail, validatePassword } from '../utils/validation.js';

const MODES = ['signin', 'signup', 'forgot'];

function hero() {
  return html`
    <section class="auth-hero" aria-hidden="true">
      <div class="flex items-center gap-3 text-xl font-bold">${logo({ size: 36 })}Trackademia</div>
      <div class="max-w-md">
        <p class="text-4xl font-bold leading-tight tracking-tight">Write it down.<br />It lands on your calendar.</p>
        <div class="mt-8 rounded-xl bg-white/5 p-5 text-lg leading-relaxed ring-1 ring-white/10">
          Submit thesis draft <mark class="rounded bg-[#FDE68A] px-1 text-ink">next Monday at 3pm</mark>.<br />
          Dentist <mark class="rounded bg-[#FDE68A] px-1 text-ink">tomorrow at 10am</mark>.
          <div class="mt-4 flex items-center gap-2 text-sm text-white/70">${icon('calendarCheck', { size: 18 })} Added to Google Calendar</div>
        </div>
      </div>
      <p class="text-sm text-white/50">Smart notes for students and busy people.</p>
    </section>`;
}

function calendarExplainer() {
  return html`
    <div class="mt-6 rounded-lg border border-line-subtle bg-surface p-4 text-sm">
      <p class="flex items-center gap-2 font-semibold">${icon('calendar', { size: 18 })}How Google Calendar works here</p>
      <ul class="mt-2 list-disc space-y-1 pl-5 text-ink-muted">
        <li>After signing in, connect Google Calendar from Settings or the first time you add a reminder.</li>
        <li>Trackademia highlights dates in your notes and only creates events after you confirm them.</li>
        <li>You can edit or delete those events from your note at any time, or disconnect whenever you like.</li>
      </ul>
    </div>`;
}

function authForm(mode) {
  const tabs = html`
    <div class="segmented mb-6 w-full" role="tablist" aria-label="Account">
      <button class="flex-1" type="button" role="tab" data-mode="signin" aria-selected="${String(mode === 'signin')}">Sign in</button>
      <button class="flex-1" type="button" role="tab" data-mode="signup" aria-selected="${String(mode === 'signup')}">Create account</button>
    </div>`;

  if (mode === 'forgot') {
    return html`
      <h2 class="text-xl font-semibold">Reset your password</h2>
      <p class="mt-1 text-sm text-ink-muted">We will email you a secure link to choose a new password.</p>
      <form class="mt-6 space-y-4" data-form="forgot" novalidate>
        ${field({ name: 'email', label: 'Email', type: 'email', autocomplete: 'email', required: true, autofocus: true })}
        <button class="btn btn--primary btn--lg btn--block" type="submit">Send reset link</button>
        <button class="btn btn--ghost btn--block" type="button" data-mode="signin">Back to sign in</button>
      </form>`;
  }

  return html`
    ${tabs}
    <button class="btn btn--secondary btn--lg btn--block" type="button" data-action="google">${icon('google')}<span>Continue with Google</span></button>
    <div class="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-ink-muted"><span class="h-px flex-1 bg-line"></span>or with email<span class="h-px flex-1 bg-line"></span></div>
    <form class="space-y-4" data-form="${mode}" novalidate>
      ${mode === 'signup' ? field({ name: 'name', label: 'Your name', autocomplete: 'name', maxlength: 80 }) : ''}
      ${field({ name: 'email', label: 'Email', type: 'email', autocomplete: 'email', required: true, inputmode: 'email' })}
      ${field({ name: 'password', label: 'Password', type: 'password', autocomplete: mode === 'signup' ? 'new-password' : 'current-password', required: true, hint: mode === 'signup' ? 'At least 8 characters, with a letter and a number.' : undefined })}
      ${mode === 'signin' ? html`<div class="-mt-1 text-right"><button class="text-sm font-semibold text-primary" type="button" data-mode="forgot">Forgot password?</button></div>` : ''}
      <button class="btn btn--primary btn--lg btn--block" type="submit">${mode === 'signup' ? 'Create account' : 'Sign in'}</button>
    </form>`;
}

function verifyNotice(email) {
  return html`
    <div class="text-center">
      <div class="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary">${icon('mail', { size: 26 })}</div>
      <h2 class="text-xl font-semibold">Check your inbox</h2>
      <p class="mt-2 text-sm text-ink-muted">We sent a verification link to <strong class="text-ink">${email}</strong>. Open it on this device to finish creating your account.</p>
      <div class="mt-6 flex flex-col gap-2">
        <button class="btn btn--secondary btn--block" type="button" data-action="resend" data-email="${email}">Resend email</button>
        <button class="btn btn--ghost btn--block" type="button" data-mode="signin">Back to sign in</button>
      </div>
    </div>`;
}

function resetForm() {
  return html`
    <h2 class="text-xl font-semibold">Choose a new password</h2>
    <form class="mt-6 space-y-4" data-form="reset" novalidate>
      ${field({ name: 'password', label: 'New password', type: 'password', autocomplete: 'new-password', required: true, autofocus: true, hint: 'At least 8 characters, with a letter and a number.' })}
      ${field({ name: 'confirm', label: 'Confirm password', type: 'password', autocomplete: 'new-password', required: true })}
      <button class="btn btn--primary btn--lg btn--block" type="submit">Update password</button>
    </form>`;
}

export async function render(ctx) {
  const { main, path, query } = ctx;
  let mode = MODES.includes(query.get('mode')) ? query.get('mode') : 'signin';
  ctx.setTitle(path === '/reset-password' ? 'Reset password' : 'Welcome');

  const draw = (panel) => mount(main, html`
    <div class="auth-layout">
      ${hero()}
      <section class="auth-panel">
        <div class="mb-8 flex items-center gap-3 lg:hidden">${logo({ size: 40 })}<div><p class="text-xl font-bold">Trackademia</p><p class="text-sm text-ink-muted">Notes that schedule themselves.</p></div></div>
        <h1 class="sr-only">Trackademia account</h1>
        ${authService.isConfigured() ? '' : html`<div class="alert alert--warning mb-6">${icon('info')}<p>Supabase is not configured. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> and rebuild.</p></div>`}
        <div class="auth-card" data-panel>${panel}</div>
        ${path === '/onboarding' ? calendarExplainer() : ''}
        <p class="mt-6 text-center text-xs text-ink-muted">By continuing you agree that dates in your notes may be analysed to suggest reminders. See Settings → Privacy.</p>
      </section>
    </div>`);

  if (path === '/auth/callback') {
    draw(html`<div class="py-10 text-center" role="status"><span class="spinner text-primary"></span><p class="mt-3 text-ink-muted">Signing you in…</p></div>`);
    const errorDescription = query.get('error_description') || new URLSearchParams(window.location.hash.slice(1)).get('error_description');
    if (errorDescription) {
      toast.error('Sign-in failed', { detail: errorDescription });
      navigate('/onboarding', { replace: true, force: true });
      return undefined;
    }
    // supabase-js exchanges ?code= automatically (PKCE). Wait briefly for the session.
    for (let i = 0; i < 20; i += 1) {
      if (await authService.getSession()) {
        navigate('/notes', { replace: true, force: true });
        return undefined;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    toast.error('The sign-in link is invalid or expired', { detail: 'Please sign in again.' });
    navigate('/onboarding', { replace: true, force: true });
    return undefined;
  }

  if (path === '/reset-password') draw(resetForm());
  else draw(authForm(mode));

  const onClick = async (event) => {
    const modeButton = event.target.closest('[data-mode]');
    if (modeButton) {
      mode = modeButton.dataset.mode;
      main.querySelector('[data-panel]').innerHTML = authForm(mode).value;
      main.querySelector('[data-panel] input')?.focus();
      return;
    }
    const action = event.target.closest('[data-action]');
    if (!action) return;
    if (action.dataset.action === 'google') {
      const restore = setButtonLoading(action, 'Redirecting to Google…');
      try {
        await authService.signInWithGoogle();
      } catch (error) {
        restore();
        toast.error('Google sign-in failed', { detail: error.message });
      }
    }
    if (action.dataset.action === 'resend') {
      const restore = setButtonLoading(action, 'Sending…');
      try {
        await authService.resendVerification(action.dataset.email);
        toast.success('Verification email sent');
      } catch (error) {
        toast.error('Could not resend', { detail: error.message });
      } finally {
        restore();
      }
    }
  };

  const onSubmit = async (event) => {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    const kind = form.dataset.form;
    const values = formValues(form);
    const errors = {};
    if ('email' in values && !validateEmail(values.email)) errors.email = 'Enter a valid email address.';
    if (kind === 'signup' || kind === 'reset') {
      const problem = validatePassword(values.password);
      if (problem) errors.password = problem;
    } else if (kind === 'signin' && !values.password) errors.password = 'Enter your password.';
    if (kind === 'reset' && values.password !== values.confirm) errors.confirm = 'Passwords do not match.';
    showFieldErrors(form, errors);
    if (Object.keys(errors).length) return;

    const submit = form.querySelector('[type=submit]');
    const restore = setButtonLoading(submit, { signin: 'Signing in…', signup: 'Creating account…', forgot: 'Sending…', reset: 'Updating…' }[kind]);
    try {
      if (kind === 'signin') {
        await authService.signIn({ email: values.email.trim(), password: values.password });
        // Navigation happens in the auth state listener.
      } else if (kind === 'signup') {
        const data = await authService.signUp({ email: values.email.trim(), password: values.password, name: values.name?.trim() });
        if (!data.session) main.querySelector('[data-panel]').innerHTML = verifyNotice(values.email.trim()).value;
      } else if (kind === 'forgot') {
        await authService.requestPasswordReset(values.email.trim());
        toast.success('Check your email', { detail: 'If an account exists, a reset link is on its way.' });
        mode = 'signin';
        main.querySelector('[data-panel]').innerHTML = authForm(mode).value;
      } else if (kind === 'reset') {
        await authService.updatePassword(values.password);
        toast.success('Password updated');
        navigate('/notes', { replace: true, force: true });
      }
    } catch (error) {
      showFieldErrors(form, { [kind === 'forgot' ? 'email' : 'password']: error.message });
    } finally {
      if (document.body.contains(submit)) restore();
    }
  };

  main.addEventListener('click', onClick);
  main.addEventListener('submit', onSubmit);
  return () => {
    main.removeEventListener('click', onClick);
    main.removeEventListener('submit', onSubmit);
  };
}
