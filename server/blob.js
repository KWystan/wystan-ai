/**
 * Azure Blob Storage client wrapper.
 * Handles upload and delete operations for the wystanai storage account.
 */
const { BlobServiceClient } = require('@azure/storage-blob');

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = process.env.AZURE_STORAGE_CONTAINER || 'uploads';

let blobServiceClient = null;
let containerClient = null;

/** Lazy-init clients so the module doesn't crash when env vars are missing. */
function getClients() {
  if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is not configured.');
  }
  if (!blobServiceClient) {
    blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    containerClient = blobServiceClient.getContainerClient(containerName);
  }
  return { containerClient };
}

/**
 * Upload a buffer to Azure Blob Storage.
 * @param {string}   userId   - Supabase user ID (used as folder prefix)
 * @param {string}   folder   - 'docs' | 'images'
 * @param {string}   filename - Unique filename (use UUID prefix to avoid collisions)
 * @param {Buffer}   buffer   - File data
 * @param {string}   mimetype - MIME type
 * @returns {Promise<{ blobUrl: string, blobName: string }>}
 */
async function uploadBlob(userId, folder, filename, buffer, mimetype) {
  const { containerClient } = getClients();
  const blobName = `${userId}/${folder}/${filename}`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: mimetype },
  });

  return { blobUrl: blockBlobClient.url, blobName };
}

/**
 * Delete a blob by its full URL.
 * @param {string} blobUrl - e.g. https://wystanai.blob.core.windows.net/uploads/userId/docs/file.pdf
 */
async function deleteBlob(blobUrl) {
  const { containerClient } = getClients();
  const url = new URL(blobUrl);
  // Pathname is /{containerName}/{blobName} — strip leading /
  const blobName = decodeURIComponent(url.pathname.replace(`/${containerName}/`, ''));
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.deleteIfExists();
}

/**
 * Check whether Azure Blob Storage is configured.
 */
function isConfigured() {
  return !!connectionString;
}

module.exports = { uploadBlob, deleteBlob, isConfigured };
