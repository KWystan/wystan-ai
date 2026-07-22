# Wystan AI — Azure Blob Storage Integration Plan

## 1. Overview

This document outlines the integration of **Azure Blob Storage** into the Wystan AI platform for persistent file storage. Azure provides scalable, cost-effective blob storage that integrates with the existing file upload pipeline.

### Account Details
- **Storage Account**: `wystanai`
- **Resource Group**: `wystan-an`
- **Container**: `uploads` (created automatically)
- **Connection String**: Configured in `server/.env`

---

## 2. Architecture

### 2.1 Data Flow
```
User uploads file ? POST /api/upload
                        ?
                Multer processes file (memory storage)
                        ?
                Type detection + content extraction
                        ?
        +--- Azure Blob Storage (if logged in) ---+
        ¦ 1. Check quotas (100MB total, 20 images) ¦
        ¦ 2. Upload to `{userId}/docs/` or `images/`¦
        ¦ 3. Record in `storage_usage` table        ¦
        ¦ 4. Return `{stored: true, blobUrl, ...}`   ¦
        +------------------------------------------+
                        ?
                Response with extracted content
```

### 2.2 File Organization
```
uploads/                                    ? Container
+-- {userId}/                               ? Per-user folder
¦   +-- docs/                               ? Documents (PDF, DOCX, TXT, etc.)
¦   ¦   +-- {timestamp}-{random}-{filename}
¦   +-- images/                             ? Images (PNG, JPG, etc.)
¦       +-- {timestamp}-{random}-{filename}
```

### 2.3 Quota Rules
| Resource | Limit | Enforcement |
|----------|-------|-------------|
| Total storage | 100 MB per user | `checkQuota()` before upload |
| Images | 20 per user | `checkImageLimit()` for image uploads |
| File size | 10 MB per file | Multer configuration |
| Content preview | 50 KB truncated | `truncateContent()` for LLM safety |

---

## 3. Server Modules

### 3.1 `server/blob.js` — Azure Blob Client
```javascript
// Upload a buffer to Azure
uploadBlob(userId, folder, filename, buffer, mimetype)
  ? { blobUrl, blobName }

// Delete a blob by URL
deleteBlob(blobUrl)
  ? void

// Check if Azure is configured
isConfigured()
  ? boolean
```

### 3.2 `server/storage.js` — Quota & Usage Tracking
```javascript
// Check storage quota
checkQuota(userId, fileSize)
  ? { allowed, usedBytes, remainingBytes, error? }

// Check image limit
checkImageLimit(userId)
  ? { allowed, current, max, error? }

// Record a stored file
recordUsage(userId, blobUrl, filename, fileType, sizeBytes)
  ? void

// Delete a usage record
deleteUsage(blobUrl)
  ? userId

// Get full usage summary
getUsage(userId)
  ? { totalBytes, totalImages, maxBytes, maxImages, usedPercent, files }
```

---

## 4. API Endpoints

### 4.1 `POST /api/upload` (Updated)
- **Auth**: `optionalAuth` — works for both guests and logged-in users
- **Body**: `multipart/form-data` with `file` field
- **Azure Integration** (for logged-in users):
  1. Check image quota if file is an image
  2. Check total storage quota
  3. Upload to Azure Blob Storage
  4. Record usage in Supabase `storage_usage` table
  5. Return `{ stored: true, blobUrl, storage: { usedBytes, remainingBytes } }`
- **Failure is non-blocking**: If Azure is unreachable, file is processed ephemerally

### 4.2 `DELETE /api/upload` (New)
- **Auth**: `requireAuth`
- **Body**: `{ blobUrl }`
- **Process**: Delete blob from Azure ? Delete usage record
- **Response**: `{ success: true }`

### 4.3 `GET /api/storage/usage` (New)
- **Auth**: `requireAuth`
- **Response**: `{ totalBytes, totalImages, maxBytes, maxImages, usedPercent, files[] }`

---

## 5. Database Schema

### 5.1 `storage_usage` Table (Supabase)
```sql
CREATE TABLE storage_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  blob_url TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,        -- 'image' | 'doc'
  size_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, blob_url)
);

CREATE INDEX idx_storage_usage_user ON storage_usage(user_id);
CREATE INDEX idx_storage_usage_type ON storage_usage(user_id, file_type);
```

---

## 6. Environment Variables

```env
# server/.env
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=wystanai;AccountKey=...;EndpointSuffix=core.windows.net
AZURE_STORAGE_CONTAINER=uploads
```

---

## 7. Client-Side Integration

### 7.1 Current Implementation
- File upload is already fully functional via `FlashcardsPage.jsx` and `ChatPage.jsx`
- Upload response now includes `stored`, `blobUrl`, and `storage` fields

### 7.2 Future UI Components
- **Storage meter** in sidebar (below user avatar) showing used/quota
- **Image gallery** in GeneratePage showing user's stored images
- **Storage manager modal** for viewing/deleting stored files

---

## 8. Error Handling

| Scenario | Behavior | HTTP Status |
|----------|----------|-------------|
| Azure not configured | `stored: false`, file processed ephemerally | 200 |
| Azure upload fails | `stored: false`, `storageError` message, file still processed | 200 |
| Storage quota exceeded | File rejected with quota message | 403 |
| Image limit reached | File rejected with limit message | 403 |
| File too large | Multer rejection | 413 |
| Invalid file type | Error message returned | 400 |

---

## 9. Cost Estimates

Azure Blob Storage costs are minimal for this use case:
- **Hot tier**: ~$0.018/GB/month for storage
- **Operations**: ~$0.05/10,000 write operations
- **Estimated monthly cost**: Under $1 for typical usage

---

## 10. Security Considerations

- Connection string stored in `.env` (not committed to git)
- Per-user folder isolation (`{userId}/docs/`, `{userId}/images/`)
- Quota enforced server-side (cannot be bypassed by client)
- File type validation on both client and server
- Content truncation prevents LLM context window abuse
- Azure failure is non-blocking (service remains functional)
