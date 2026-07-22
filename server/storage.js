/**
 * Storage quota and usage tracking.
 * Enforces per-user limits (100 MB total, 20 images max).
 */
let supabaseAdmin;
try {
  supabaseAdmin = require('./supabase').supabaseAdmin;
} catch (e) {
  console.warn('[Storage] Supabase not available — quota checks disabled.');
  supabaseAdmin = null;
}

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_IMAGES = 20;

/**
 * Check if a user has enough storage quota for a file of `fileSize` bytes.
 */
async function checkQuota(userId, fileSize) {
  if (!supabaseAdmin) return { allowed: true, usedBytes: 0, remainingBytes: MAX_BYTES };

  const { data, error } = await supabaseAdmin
    .from('storage_usage')
    .select('size_bytes')
    .eq('user_id', userId);

  const usedBytes = error ? 0 : data.reduce((sum, r) => sum + Number(r.size_bytes), 0);
  const remainingBytes = MAX_BYTES - usedBytes;

  if (fileSize > remainingBytes) {
    return {
      allowed: false,
      usedBytes,
      remainingBytes: Math.max(0, remainingBytes),
      error: `Storage limit reached. You have ${(Math.max(0, remainingBytes) / 1024 / 1024).toFixed(1)} MB remaining.`,
    };
  }
  return { allowed: true, usedBytes, remainingBytes };
}

/**
 * Check if a user is at the image count limit.
 */
async function checkImageLimit(userId) {
  if (!supabaseAdmin) return { allowed: true, current: 0, max: MAX_IMAGES };

  const { count, error } = await supabaseAdmin
    .from('storage_usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('file_type', 'image');

  const current = error ? 0 : (count || 0);
  if (current >= MAX_IMAGES) {
    return {
      allowed: false,
      current,
      max: MAX_IMAGES,
      error: 'Image limit reached (20 max). Delete old images first.',
    };
  }
  return { allowed: true, current, max: MAX_IMAGES };
}

/**
 * Record a stored file in Supabase.
 */
async function recordUsage(userId, blobUrl, filename, fileType, sizeBytes) {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin.from('storage_usage').insert({
    user_id: userId,
    blob_url: blobUrl,
    filename,
    file_type: fileType,
    size_bytes: sizeBytes,
  });
  if (error) console.error('[Storage] Failed to record usage:', error.message);
}

/**
 * Delete a usage record by blob URL and return the user_id.
 */
async function deleteUsage(blobUrl) {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('storage_usage')
    .delete()
    .eq('blob_url', blobUrl)
    .select('user_id')
    .single();

  if (error) throw new Error('Failed to delete usage record');
  return data?.user_id;
}

/**
 * Get full usage summary for a user.
 */
async function getUsage(userId) {
  if (!supabaseAdmin) return { totalBytes: 0, totalImages: 0, maxBytes: MAX_BYTES, maxImages: MAX_IMAGES, usedPercent: '0.0', files: [] };

  const { data, error } = await supabaseAdmin
    .from('storage_usage')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const totalBytes = data.reduce((sum, f) => sum + Number(f.size_bytes), 0);
  const totalImages = data.filter((f) => f.file_type === 'image').length;

  return {
    totalBytes,
    totalImages,
    maxBytes: MAX_BYTES,
    maxImages: MAX_IMAGES,
    usedPercent: ((totalBytes / MAX_BYTES) * 100).toFixed(1),
    files: data,
  };
}

module.exports = { checkQuota, checkImageLimit, recordUsage, deleteUsage, getUsage };
