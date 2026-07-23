// ── File type registry ──────────────────────────────────────────
// Canonical FILE_TYPES mapping used by both /api/upload and project sources.
const FILE_TYPES = {
  // Documents
  pdf:  { type: 'pdf',  group: 'document' },
  docx: { type: 'docx', group: 'document' },
  pptx: { type: 'pptx', group: 'document' },
  // Spreadsheets / tables
  xlsx: { type: 'xlsx', group: 'table' },
  xls:  { type: 'xls',  group: 'table' },
  csv:  { type: 'csv',  group: 'table' },
  tsv:  { type: 'tsv',  group: 'table' },
  // Code files (sent as context to LLM)
  js:   { type: 'code', group: 'text', language: 'javascript' },
  jsx:  { type: 'code', group: 'text', language: 'jsx' },
  ts:   { type: 'code', group: 'text', language: 'typescript' },
  tsx:  { type: 'code', group: 'text', language: 'tsx' },
  py:   { type: 'code', group: 'text', language: 'python' },
  rb:   { type: 'code', group: 'text', language: 'ruby' },
  java: { type: 'code', group: 'text', language: 'java' },
  c:    { type: 'code', group: 'text', language: 'c' },
  cpp:  { type: 'code', group: 'text', language: 'cpp' },
  cs:   { type: 'code', group: 'text', language: 'csharp' },
  go:   { type: 'code', group: 'text', language: 'go' },
  rs:   { type: 'code', group: 'text', language: 'rust' },
  swift:{ type: 'code', group: 'text', language: 'swift' },
  kt:   { type: 'code', group: 'text', language: 'kotlin' },
  php:  { type: 'code', group: 'text', language: 'php' },
  html: { type: 'code', group: 'text', language: 'html' },
  css:  { type: 'code', group: 'text', language: 'css' },
  scss: { type: 'code', group: 'text', language: 'scss' },
  less: { type: 'code', group: 'text', language: 'less' },
  sql:  { type: 'code', group: 'text', language: 'sql' },
  sh:   { type: 'code', group: 'text', language: 'bash' },
  bash: { type: 'code', group: 'text', language: 'bash' },
  yaml: { type: 'code', group: 'text', language: 'yaml' },
  yml:  { type: 'code', group: 'text', language: 'yaml' },
  xml:  { type: 'code', group: 'text', language: 'xml' },
  json: { type: 'code', group: 'text', language: 'json' },
  md:   { type: 'code', group: 'text', language: 'markdown' },
  r:    { type: 'code', group: 'text', language: 'r' },
  // Plain text
  txt:  { type: 'text', group: 'text' },
  // Images
  png:  { type: 'image', group: 'image' },
  jpg:  { type: 'image', group: 'image' },
  jpeg: { type: 'image', group: 'image' },
  gif:  { type: 'image', group: 'image' },
  webp: { type: 'image', group: 'image' },
  svg:  { type: 'image', group: 'image' },
  bmp:  { type: 'image', group: 'image' },
};

/**
 * Determine file info from extension or MIME type.
 * @param {string} ext - Lowercase file extension (without dot)
 * @param {string} mimetype - MIME type from upload
 * @returns {{ type: string, group: string, language?: string }}
 */
function getFileInfo(ext, mimetype) {
  let info = FILE_TYPES[ext];

  // Fallback: infer from MIME type when extension isn't in our map
  if (!info) {
    if (mimetype.startsWith('image/'))        info = { type: 'image', group: 'image' };
    else if (mimetype.startsWith('text/'))     info = { type: 'text',  group: 'text' };
    else if (mimetype === 'application/json')  info = { type: 'code', group: 'text', language: 'json' };
    else if (mimetype === 'application/pdf')   info = { type: 'pdf',  group: 'document' };
    else if (mimetype.includes('xml'))          info = { type: 'code', group: 'text', language: 'xml' };
    else                                        info = { type: 'file', group: 'other' };
  }

  return info;
}

module.exports = { FILE_TYPES, getFileInfo };
