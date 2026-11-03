/**
 * Minimal request layer for the prototype. Every integration call goes
 * through here, so swapping in real `fetch` calls later only touches this
 * module and the services that use it.
 */

export const DEFAULT_LATENCY = 450;

export function createResponse({ ok, data = null, error = null, label, latency }) {
  return {
    ok,
    data,
    error,
    meta: { simulated: true, label, latency, timestamp: new Date().toISOString() },
  };
}

/** Resolves with a structured response after a simulated network delay. Never rejects. */
export function simulateRequest(resolver, { label = 'request', latency = DEFAULT_LATENCY } = {}) {
  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        resolve(createResponse({ ok: true, data: resolver(), label, latency }));
      } catch (error) {
        resolve(createResponse({ ok: false, error: { message: error.message }, label, latency }));
      }
    }, latency);
  });
}
