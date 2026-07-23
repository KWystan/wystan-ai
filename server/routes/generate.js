// ── Image generation route ────────────────────────────────────────
// POST /api/generate — Image generation via NVIDIA Flux 2

const { Router } = require('express');

const { validate, schemas } = require('../validators');
const { asyncHandler, AppError } = require('../errors');

const router = Router();

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

/**
 * POST /api/generate — Generate an image from a text prompt.
 * Uses NVIDIA's black-forest-labs/flux.2-klein-4b model.
 */
router.post('/', validate(schemas.generate), asyncHandler(async (req, res) => {
  const { prompt, width: rawWidth, height: rawHeight, seed = 0, steps = 4 } = req.body;

  // Clamp dimensions — Flux.2-klein-4b caps at 1024
  const width = Math.min(rawWidth || 1024, 1024);
  const height = Math.min(rawHeight || 1024, 1024);

  if (!NVIDIA_API_KEY || NVIDIA_API_KEY === 'nvapi-YOUR_API_KEY_HERE') {
    throw new AppError('Image generation is not configured. Set NVIDIA_API_KEY in the server .env file.', 503, { log: 'Generate' });
  }

  const nvidiaRes = await fetch('https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${NVIDIA_API_KEY}`,
    },
    body: JSON.stringify({ prompt, width, height, seed, steps }),
  });

  if (!nvidiaRes.ok) {
    const errText = await nvidiaRes.text();
    console.error('NVIDIA GenAI error:', nvidiaRes.status, errText);

    // Check if it was flagged as NSFW / content policy violation
    const isContentPolicy = /nsfw|content.?policy|inappropriate|safety|filtered/i.test(errText);

    throw new AppError(
      isContentPolicy
        ? 'Your prompt was flagged by the content safety filter. Please try something else.'
        : `Image generation failed (${nvidiaRes.status}): ${errText.slice(0, 300)}`,
      isContentPolicy ? 400 : 502,
      { log: 'Generate' }
    );
  }

  const data = await nvidiaRes.json();

  // Some models return nsfw_content_detected in the success payload
  const artifacts = Array.isArray(data) ? data : data.artifacts || data.data || [];
  if (artifacts.length > 0 && artifacts[0].nsfw_content_detected) {
    throw new AppError('Your prompt was flagged by the content safety filter. Please try something else.', 400, { log: 'Generate' });
  }

  res.json(data);
}));

module.exports = router;
