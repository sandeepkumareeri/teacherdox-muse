/**
 * Llama Multilingual Integration — Meta's Llama models for reasoning in 100+ languages
 *
 * Used for:
 * - Structured extraction in teacher's native language
 * - Confidence scoring per field
 * - Multilingual prompt templates
 * - Fallback when NLLB/SeamlessM4T unavailable
 */

const https = require('https');

class LlamaClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.LLAMA_API_KEY || process.env.META_API_KEY;
    this.baseUrl = config.baseUrl || process.env.LLAMA_API_BASE || 'https://api.meta.ai/v1';
    // Default to Llama 3.3 70B Instruct (multilingual)
    this.model = config.model || process.env.META_MODEL_CHAT || 'meta-llama/Llama-3.3-70B-Instruct';
    this.enabled = !!this.apiKey;
    this.visionModel = config.visionModel || process.env.META_MODEL_VISION || 'meta-llama/Llama-3.2-90B-Vision-Instruct';
  }

  /**
   * Generate structured extraction in target language
   * @param {string} prompt - Language-specific prompt
   * @param {Object} options - { temperature, maxTokens, jsonMode }
   * @returns {Promise<{text: string, usage: Object}>}
   */
  async generate(prompt, options = {}) {
    if (!this.enabled) {
      throw new Error('Llama not configured');
    }

    try {
      const body = {
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 2048,
        top_p: options.topP ?? 0.95,
        response_format: options.jsonMode ? { type: 'json_object' } : undefined,
      };

      const result = await this._request('/chat/completions', body);

      return {
        text: result.choices?.[0]?.message?.content || '',
        usage: result.usage,
        model: result.model,
      };
    } catch (err) {
      console.error(`[Llama] Generation failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Vision + text generation (board photo + voice transcript)
   * @param {string} prompt
   * @param {string} base64Image
   * @param {string} mimeType
   * @param {Object} options
   * @returns {Promise<{text: string, usage: Object}>}
   */
  async generateVision(prompt, base64Image, mimeType, options = {}) {
    if (!this.enabled) {
      throw new Error('Llama not configured');
    }

    try {
      const body = {
        model: this.visionModel,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
          ],
        }],
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 4096,
        top_p: options.topP ?? 0.95,
      };

      const result = await this._request('/chat/completions', body);

      return {
        text: result.choices?.[0]?.message?.content || '',
        usage: result.usage,
        model: result.model,
      };
    } catch (err) {
      console.error(`[Llama] Vision generation failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Generate with confidence scoring (returns parsed JSON + confidence per field)
   * @param {string} prompt
   * @param {Object} schema - Expected JSON schema
   * @returns {Promise<{data: Object, confidence: Object, raw: string}>}
   */
  async generateWithConfidence(prompt, schema) {
    const confidencePrompt = `${prompt}

Return ONLY valid JSON matching this schema:
${JSON.stringify(schema, null, 2)}

Also include a "confidence" object with per-field scores (0.0-1.0):
{ "fieldName": 0.95, ... }

And a "flags" object:
{ "guessedFields": [], "lowConfidence": [], "unreadableEvidence": [] }`;

    const result = await this.generate(confidencePrompt, { jsonMode: true, temperature: 0.1 });

    try {
      const parsed = JSON.parse(result.text);
      return {
        data: parsed,
        confidence: parsed.confidence || {},
        flags: parsed.flags || { guessedFields: [], lowConfidence: [], unreadableEvidence: [] },
        raw: result.text,
        usage: result.usage,
        model: result.model,
      };
    } catch (err) {
      console.error(`[Llama] Failed to parse confidence response: ${err.message}`);
      return {
        data: {},
        confidence: {},
        flags: { guessedFields: [], lowConfidence: [], unreadableEvidence: [] },
        raw: result.text,
        parseError: true,
      };
    }
  }

  /**
   * HTTP request helper
   */
  async _request(path, body) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const url = `${this.baseUrl}${path}`;

      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: 60000,
      }, res => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(raw));
            } catch (e) {
              reject(new Error(`Llama invalid JSON: ${raw.slice(0, 200)}`));
            }
          } else {
            reject(new Error(`Llama ${res.statusCode}: ${raw.slice(0, 500)}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Llama timeout')); });
      req.write(data);
      req.end();
    });
  }

  isAvailable() {
    return this.enabled;
  }
}

let llamaInstance = null;

function getLlamaClient(config) {
  if (!llamaInstance) {
    llamaInstance = new LlamaClient(config);
  }
  return llamaInstance;
}

function resetLlamaClient() {
  llamaInstance = null;
}

module.exports = {
  LlamaClient,
  getLlamaClient,
  resetLlamaClient,
};