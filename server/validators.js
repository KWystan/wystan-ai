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
  cardStyle: z.enum(['term-definition', 'question-answer', 'cloze', 'concept-example']).optional(),
  difficulty: z.enum(['recap', 'review', 'master']).optional(),
  count: z.coerce.number().int().min(5).max(20).optional(),
  orientation: z.enum(['front-back', 'back-front']).optional(),
  rerollFor: z.object({
    question: z.string(),
    answer: z.string(),
  }).optional(),
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

const studyChatSchema = z.object({
  prompt: z.string({ message: 'Prompt is required' }).min(1, 'Prompt is required').max(50000),
  activeSourceIds: z.array(z.string().uuid(), { message: 'activeSourceIds must be an array of UUIDs' }).min(1, 'At least one source must be active').max(50),
  model: z.string().optional(),
  conversationId: z.string().uuid().optional(),
});

const studyUploadSchema = z.object({
  fileName: z.string({ message: 'fileName is required' }).min(1, 'fileName is required'),
  fileType: z.string({ message: 'fileType is required' }).min(1, 'fileType is required'),
  pages: z.array(z.object({
    text: z.string(),
    pageNumber: z.number().int().positive().optional(),
  }), { message: 'pages array is required' }).min(1, 'At least one page is required'),
});

const studyToolSchema = z.object({
  activeSourceIds: z.array(z.string().uuid(), { message: 'activeSourceIds must be an array of UUIDs' }).min(1, 'At least one source must be active').max(50),
  chatHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).max(50).optional(),
  count: z.coerce.number().int().min(3).max(50).optional(),
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
    studyChat: studyChatSchema,
    studyUpload: studyUploadSchema,
    studyTool: studyToolSchema,
  },
};
