/** Profile / account settings stored in public.profiles (RLS: owner only). */
import { fromDatabaseError } from '../utils/errors.js';

const COLUMNS = 'id, display_name, timezone, default_calendar_id, default_calendar_name, ai_detection_enabled, created_at, updated_at';

export async function getProfile(db, user) {
  const { data, error } = await db.from('profiles').select(COLUMNS).eq('id', user.id).maybeSingle();
  if (error) throw fromDatabaseError(error, 'Profile');
  if (data) return data;
  // Profile rows are created by a trigger; create one if it is missing (e.g. pre-existing users).
  const created = await db.from('profiles')
    .upsert({ id: user.id, display_name: user.name || user.email?.split('@')[0] || null }, { onConflict: 'id' })
    .select(COLUMNS).single();
  if (created.error) throw fromDatabaseError(created.error, 'Profile');
  return created.data;
}

export async function updateProfile(db, user, patch) {
  await getProfile(db, user);
  const { data, error } = await db.from('profiles').update(patch).eq('id', user.id).select(COLUMNS).single();
  if (error) throw fromDatabaseError(error, 'Profile');
  return data;
}
