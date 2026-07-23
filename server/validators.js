// ── Zod validation schemas ───────────────────────────────────────
// Centralized schemas and middleware factory for all endpoints.
// NOTE: Zod v4 uses .issues (not .errors) and per-schema type messages.

const { z } = require('zod');

// ── Schemas ──────────────────────────────────────────────────────

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.union([z.string(), z.array(z.any())]),
    }),
    { message: 'Messages array is required' }
  ).min(1, 'Messages array is required'),
  model: z.string().optional(),
});

const generateSchema = z.object({
  prompt: z.string({ message: 'Prompt is required' }).min(1, 'Prompt is required'),
  width: z.coerce.number().int().positive().max(1024).optional(),
  height: z.coerce.number().int().positive().max(1024).optional(),
  seed: z.coerce.number().int().optional(),
  steps: z.coerce.number().int().positive().optional(),
});

const searchSchema = z.object({
  query: z.string({ message: 'Query is required' }).min(1, 'Query is required'),
});

const flashcardSchema = z.object({
  text: z.string({ message: 'Text content is required.' }).min(1, 'Text content is required.'),
});

const quizSchema = z.object({
  text: z.string({ message: 'Text content is required.' }).min(1, 'Text content is required.'),
  type: z.enum(['multiple', 'truefalse', 'fillblank', 'mixed'], { message: 'Invalid quiz type.' }).optional(),
  count: z.coerce.number().int().min(5).max(20).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
});

const deleteUploadSchema = z.object({
  blobUrl: z.string({ message: 'blobUrl is required' }).min(1, 'blobUrl is required'),
});

// ── Middleware factory ───────────────────────────────────────────

/**
 * Returns Express middleware that validates req.body against a Zod schema.
 * On failure responds 400 with the first validation error message.
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues[0]?.message || 'Invalid request body';
      return res.status(400).json({ error: message });
    }
    next();
  };
}

module.exports = {
  validate,
  schemas: {
    chat: chatSchema,
    chatFull: chatSchema,       // same shape for both chat endpoints
    generate: generateSchema,
    search: searchSchema,
    flashcard: flashcardSchema,
    quiz: quizSchema,
    deleteUpload: deleteUploadSchema,
  },
};
