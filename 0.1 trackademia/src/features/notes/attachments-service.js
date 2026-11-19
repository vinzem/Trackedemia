/**
 * Note attachments in the private Supabase Storage bucket "attachments".
 * Paths are <user_id>/<note_id>/<file>; storage RLS limits access to the owner.
 */
import { supabase } from '../../services/supabase.js';

const BUCKET = 'attachments';
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const folder = (userId, noteId) => `${userId}/${noteId}`;
const safeName = (name) => name.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-120) || 'file';

export async function listAttachments(userId, noteId) {
  if (!supabase || !noteId) return [];
  const { data, error } = await supabase.storage.from(BUCKET).list(folder(userId, noteId), { sortBy: { column: 'created_at', order: 'asc' } });
  if (error) throw error;
  return (data || []).filter((item) => item.name !== '.emptyFolderPlaceholder').map((item) => ({
    name: item.name.replace(/^\d+-/, ''), path: `${folder(userId, noteId)}/${item.name}`, size: item.metadata?.size ?? 0,
  }));
}

export async function uploadAttachment(userId, noteId, file) {
  if (!supabase) throw new Error('File storage is not configured.');
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('Files must be 10 MB or smaller.');
  const path = `${folder(userId, noteId)}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
  if (error) throw error;
  return path;
}

export async function attachmentUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function removeAttachment(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
