import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { generateIntelligentClinicalAdvice } from './src/utils/clinicalAdvice';

async function startServer() {
  const app = express();
  // CRITICAL: Always bind to port 3000 for AI Studio web dev server
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Local-only Adolescent Counseling Clinical Advice API (External paid Gemini API disabled)
  app.post('/api/gemini/counseling-advice', async (req, res) => {
    const { studentName, school, grade, session, category, media, content } = req.body || {};

    if (!content || !String(content).trim()) {
      res.status(400).json({ error: '상담 내용(기록)을 입력해주세요.' });
      return;
    }

    const trimmedContent = String(content).trim();

    // Always use the free built-in clinical opinion generator (no external paid API calls)
    const localAdvice = generateIntelligentClinicalAdvice({
      studentName,
      school,
      grade,
      session,
      category,
      media,
      content: trimmedContent,
    });

    res.json({ advice: localAdvice });
  });

  // Serve static files in production or Vite in development
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Express + Vite server running on port ${PORT}`);
  });
}

startServer();
