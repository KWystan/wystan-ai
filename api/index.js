// Vercel serverless entry point — imports the Express app
// Vercel detects api/ as serverless functions automatically.

const app = require('../server/index');
module.exports = app;
