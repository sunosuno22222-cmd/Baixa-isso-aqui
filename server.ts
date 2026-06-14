import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import {join} from 'node:path';

const browserDistFolder = join(process.cwd(), 'dist/app/browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

app.use(express.json({limit: '50mb'}));

/**
 * AI Chat endpoint with streaming
 */
app.post('/api/chat', async (req, res) => {
  const { messages, model = 'openai/gpt-oss-120b:free' } = req.body;
  const apiKey = process.env['OPENROUTER_API_KEY'];

  if (!apiKey) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured.' });
  }

  try {
    const formattedMessages = messages.map((m: { role: string; content: string; files?: { name: string; type: string; data: string }[] }) => {
      if (m.files && m.files.length > 0) {
        const contentParts: { type: string; text?: string; image_url?: { url: string } }[] = [{ type: 'text', text: m.content }];
        
        m.files.forEach((file) => {
          if (file.type.startsWith('image/')) {
            contentParts.push({
              type: 'image_url',
              image_url: { url: file.data }
            });
          } else {
            // For text files, we append as text block
            if (contentParts[0].text !== undefined) {
              contentParts[0].text += `\n\n[Arquivo: ${file.name}]\n${file.data}`;
            }
          }
        });
        
        return { role: m.role, content: contentParts };
      }
      return { role: m.role, content: m.content };
    });

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env['APP_URL'] || 'https://ai.studio/build',
        'X-Title': 'XZAFE AI',
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: `Você é a XZAFE AI.
DIRETRIZES:
1. IDENTIDADE: Você foi criado por "zafe". Se perguntarem quem te criou, responda que foi o zafe e forneça o link [Instagram do dono](https://www.instagram.com/h._eodog_?igsh=MWFubmx2OGg0aHBqbA==).
2. JAMAIS use tabelas. Use listas para organizar dados.
3. Todo código DEVE estar em blocos: \`\`\`linguagem[nome_do_arquivo].
4. IMPORTANTE: Após terminar um bloco de código, SEMPRE continue falando para explicar o que foi feito ou dar contexto. Nunca termine a resposta apenas com o código.
5. Use LaTeX para matemática.
6. Responda de forma limpa, técnica e amigável.`
          },
          ...formattedMessages
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No body in response');

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
    }

    res.end();
    return;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('Chat Error:', error);
    res.status(500).json({ error: message });
    return;
  }
});

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 3000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
