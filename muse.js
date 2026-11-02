/**
 * muse.js — Meta Model API client + router for TeacherDox hackathon
 *
 * Boundary: drop-in replacement for gemini.generate(body, { timeout, user })
 * Callers (ai.js, canvas.js, agent.js) don't change — they call generate(body, opts)
 * which routes to Meta or Gemini based on AI_BACKEND.
 *
 * On any Meta error/timeout: log once, fall back to Gemini, record which model produced the entry.
 */

const https = require('https');
const { generate: geminiGenerate } = require('./gemini.js'); // fallback

// ──────────────────────────────────────────────────────────────────────────────
// Config (mirrors gemini.js style)
// ──────────────────────────────────────────────────────────────────────────────

const AI_BACKEND = process.env.AI_BACKEND || 'gemini'; // 'meta' | 'gemini'
const META_API_KEY = process.env.META_API_KEY;

// Model IDs — from Meta's dev.meta.ai docs. Override via env if needed.
const META_MODEL_CHAT = process.env.META_MODEL_CHAT || 'meta-llama/Llama-3.3-70B-Instruct';
const META_MODEL_VISION = process.env.META_MODEL_VISION || 'meta-llama/Llama-3.2-90B-Vision-Instruct';
const META_MODEL_TRANSCRIBE = process.env.META_MODEL_TRANSCRIBE || 'muse-voice-transcribe';

// Allow-list for Meta backend (privacy: free credits = content may be used for improvement)
const META_AI_PHONES = (process.env.META_AI_PHONES || '').split(',').map(s => s.trim()).filter(Boolean);

// Daily limits (mirror gemini.js)
const META_DAILY_LIMIT = parseInt(process.env.META_DAILY_LIMIT || '500', 10);
const META_DAILY_LIMIT_PER_USER = parseInt(process.env.META_DAILY_LIMIT_PER_USER || '40', 10);

// In-memory counters (per IST day, like gemini.js)
let metaCallsToday = 0;
let metaCallsByUser = new Map();
let lastMetaDayKey = null;

function getTodayKey() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, '0')}-${String(ist.getDate()).padStart(2, '0')}`;
}

function resetIfNewDay() {
  const today = getTodayKey();
  if (today !== lastMetaDayKey) {
    metaCallsToday = 0;
    metaCallsByUser.clear();
    lastMetaDayKey = today;
  }
}

function checkLimits(user) {
  resetIfNewDay();
  if (metaCallsToday >= META_DAILY_LIMIT) {
    return { allowed: false, code: 'META_DAILY_LIMIT', message: `Meta daily limit (${META_DAILY_LIMIT}) reached` };
  }
  if (user) {
    const userCalls = metaCallsByUser.get(user) || 0;
    if (userCalls >= META_DAILY_LIMIT_PER_USER) {
      return { allowed: false, code: 'META_DAILY_LIMIT_PER_USER', message: `Meta per-user daily limit (${META_DAILY_LIMIT_PER_USER}) reached for ${user}` };
    }
  }
  return { allowed: true };
}

function recordCall(user) {
  metaCallsToday++;
  if (user) {
    metaCallsByUser.set(user, (metaCallsByUser.get(user) || 0) + 1);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// HTTP helper
// ──────────────────────────────────────────────────────────────────────────────

function metaRequest(path, body, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = `https://api.meta.ai/v1${path}`; // CONFIRM: check dev.meta.ai for exact endpoint
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${META_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: timeoutMs,
    }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(new Error(`Meta API invalid JSON: ${raw.slice(0, 200)}`));
          }
        } else {
          reject(new Error(`Meta API ${res.statusCode}: ${raw.slice(0, 500)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Meta API timeout')); });
    req.write(data);
    req.end();
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Request/response translation: Gemini shape <-> Meta shape
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Convert Gemini generateContent request body to Meta chat/completions format.
 * Gemini body: { contents: [{ role, parts: [{ text } | { inlineData: { mimeType, data } }] }], ... }
 * Meta expects: { model, messages: [{ role, content: [...] }], ... }
 */
function geminiToMeta(body, isVision = false) {
  const model = isVision ? META_MODEL_VISION : META_MODEL_CHAT;
  const messages = (body.contents || []).map(c => {
    const role = c.role === 'model' ? 'assistant' : 'user';
    const content = (c.parts || []).map(p => {
      if (p.text) return { type: 'text', text: p.text };
      if (p.inlineData) return { type: 'image_url', image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } };
      return null;
    }).filter(Boolean);
    return { role, content };
  });
  return {
    model,
    messages,
    temperature: body.generationConfig?.temperature ?? 0.2,
    max_tokens: body.generationConfig?.maxOutputTokens ?? 4096,
    top_p: body.generationConfig?.topP ?? 0.95,
  };
}

/**
 * Convert Meta response to Gemini-shaped { candidates: [...] }
 * Meta: { choices: [{ message: { content } }], model, usage }
 */
function metaToGemini(metaResp) {
  const text = metaResp.choices?.[0]?.message?.content ?? '';
  return {
    candidates: [{ content: { parts: [{ text }], role: 'model' } }],
    model: metaResp.model,
    usageMetadata: metaResp.usage ? {
      promptTokenCount: metaResp.usage.prompt_tokens,
      candidatesTokenCount: metaResp.usage.completion_tokens,
      totalTokenCount: metaResp.usage.total_tokens,
    } : undefined,
  };
}

/**
 * Transcribe audio via Muse Voice Transcribe.
 * Input: base64 audio (OGG/Opus from WhatsApp), language hint.
 * Returns: { text, language }
 */
async function transcribeAudio(base64Audio, mimeType, languageHint = 'en') {
  if (!META_API_KEY) throw new Error('META_API_KEY not set');
  const body = {
    model: META_MODEL_TRANSCRIBE,
    audio: { data: base64Audio, format: mimeType.replace('audio/', '') },
    language: languageHint,
  };
  const resp = await metaRequest('/audio/transcriptions', body);
  return { text: resp.text || '', language: resp.language || languageHint };
}

// ──────────────────────────────────────────────────────────────────────────────
// Main entry: generate(body, opts) — same signature as gemini.generate
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @param {Object} body — Gemini generateContent request body
 * @param {Object} opts — { timeout?, user? }
 * @returns {Promise<{ candidates, model, usageMetadata, backend, modelName }>}
 */
async function generate(body, opts = {}) {
  const { timeout = 60000, user } = opts;
  const isVision = (body.contents || []).some(c =>
    (c.parts || []).some(p => p.inlineData)
  );

  // 1) Backend selection
  const useMeta = AI_BACKEND === 'meta' &&
    META_API_KEY &&
    (!META_AI_PHONES.length || (user && META_AI_PHONES.includes(user))) &&
    (!user || META_AI_PHONES.includes('all'));

  if (!useMeta) {
    // Direct Gemini call
    const result = await geminiGenerate(body, { timeout, user });
    return { ...result, backend: 'gemini', modelName: result.model };
  }

  // 2) Meta limits check
  const limitCheck = checkLimits(user);
  if (!limitCheck.allowed) {
    console.warn(`[muse] ${limitCheck.code}: ${limitCheck.message} — falling back to Gemini`);
    const result = await geminiGenerate(body, { timeout, user });
    return { ...result, backend: 'gemini', modelName: result.model, fallback: limitCheck.code };
  }

  // 3) Meta call with fallback
  try {
    recordCall(user);
    const metaBody = geminiToMeta(body, isVision);
    const metaResp = await metaRequest(isVision ? '/chat/completions' : '/chat/completions', metaBody, timeout);
    const geminiResp = metaToGemini(metaResp);
    return {
      ...geminiResp,
      backend: 'meta',
      modelName: metaResp.model,
    };
  } catch (err) {
    // One-time log, then fallback
    console.error(`[muse] Meta call failed: ${err.message} — falling back to Gemini`);
    const result = await geminiGenerate(body, { timeout, user });
    return { ...result, backend: 'gemini', modelName: result.model, fallback: err.message };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────────────────────────────

module.exports = {
  generate,
  transcribeAudio,
  checkLimits,
  getTodayKey,
  // Expose config for admin/debug
  _config: () => ({
    AI_BACKEND,
    META_MODEL_CHAT,
    META_MODEL_VISION,
    META_MODEL_TRANSCRIBE,
    META_DAILY_LIMIT,
    META_DAILY_LIMIT_PER_USER,
    metaCallsToday,
    metaCallsByUser: Object.fromEntries(metaCallsByUser),
  }),
};