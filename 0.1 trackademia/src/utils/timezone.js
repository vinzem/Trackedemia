/** Timezone helpers built on Intl (no external data needed in the browser). */

export function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function isValidTimezone(zone) {
  if (typeof zone !== 'string' || !zone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const FALLBACK_ZONES = ['UTC', 'Asia/Manila', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles'];

export function listTimezones() {
  try {
    const zones = Intl.supportedValuesOf('timeZone');
    return zones.includes('UTC') ? zones : ['UTC', ...zones];
  } catch {
    return FALLBACK_ZONES;
  }
}

/** Short offset label such as "GMT+8" for a zone at a given instant. */
export function offsetLabel(zone, date = new Date()) {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' })
      .formatToParts(date).find((p) => p.type === 'timeZoneName');
    return part?.value || zone;
  } catch {
    return zone;
  }
}
