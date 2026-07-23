// ── Shared text extraction utilities ────────────────────────────
// Used by both /api/upload and project sources endpoints.
const { FILE_TYPES } = require('./file-types');

/** Maximum characters to send as context to the LLM (~15-20K tokens). */
const MAX_CONTEXT_CHARS = 50000;

/** Truncate text content with a notice if it exceeds MAX_CONTEXT_CHARS. */
function truncateContent(text) {
  if (!text || text.length <= MAX_CONTEXT_CHARS) return text;
  return text.slice(0, MAX_CONTEXT_CHARS) +
    `\n\n[Content truncated at ${MAX_CONTEXT_CHARS.toLocaleString()} characters. The original file was ${(text.length / 1024).toFixed(0)} KB.]`;
}

/**
 * Extract text from a PDF buffer using pdf-parse.
 */
async function extractPdfText(buffer) {
  let PDFParse;
  try {
    PDFParse = require('pdf-parse').PDFParse;
  } catch (e) {
    console.warn('pdf-parse not available — PDF processing disabled:', e.message);
    return null;
  }
  try {
    const parser = new PDFParse({ data: buffer });
    const pdfResult = await parser.getText();
    return pdfResult.text || pdfResult;
  } catch (e) {
    console.error('PDF text extraction failed:', e.message);
    return null;
  }
}

/**
 * Extract text from a DOCX buffer using mammoth.
 */
async function extractDocxText(buffer) {
  try {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (e) {
    console.error('DOCX extraction failed:', e.message);
    return null;
  }
}

/**
 * Extract text from a PPTX buffer (zip of XML slides) using adm-zip.
 */
function extractPptxText(buffer) {
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    const slideTexts = [];

    for (const entry of entries) {
      if (!entry.entryName.startsWith('ppt/slides/') || !entry.entryName.endsWith('.xml')) continue;

      const xml = entry.getData().toString('utf8');
      const texts = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map(m => m[1]);
      if (texts.length) slideTexts.push(texts.join(' '));
    }

    return slideTexts.join('\n\n');
  } catch (e) {
    console.error('PPTX extraction failed:', e.message);
    return null;
  }
}

/**
 * Extract text from XLSX/XLS buffer using xlsx.
 */
function extractXlsxText(buffer) {
  try {
    const XLSX = require('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const parts = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      return csv ? `--- ${name} ---\n${csv}` : null;
    }).filter(Boolean);
    return parts.join('\n\n');
  } catch (e) {
    console.error('XLSX/XLS parsing failed:', e.message);
    return null;
  }
}

/**
 * Extract text from a file buffer based on its type and extension.
 * Dispatches to the correct extractor based on the file type mapping.
 *
 * @param {Buffer} buffer - Raw file buffer
 * @param {string} ext - Lowercase file extension (without dot)
 * @param {string} mimetype - MIME type from upload
 * @returns {Promise<string|null>} Extracted text or null
 */
async function extractText(buffer, ext, mimetype) {
  const info = FILE_TYPES[ext] || {};
  const group = info.group;

  if (group === 'text') {
    return buffer.toString('utf8');
  }

  if (group === 'document') {
    if (info.type === 'pdf')  return await extractPdfText(buffer);
    if (info.type === 'docx') return await extractDocxText(buffer);
    if (info.type === 'pptx') return extractPptxText(buffer);
  }

  if (group === 'table') {
    if (info.type === 'csv' || info.type === 'tsv') {
      return buffer.toString('utf8');
    }
    return extractXlsxText(buffer);
  }

  return null;
}

module.exports = {
  MAX_CONTEXT_CHARS,
  truncateContent,
  extractText,
  extractPdfText,
  extractDocxText,
  extractPptxText,
  extractXlsxText,
};
