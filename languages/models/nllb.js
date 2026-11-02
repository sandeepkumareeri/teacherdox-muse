/**
 * NLLB-200 Integration — Meta's 200-language translation model
 *
 * Used for:
 * - Translating teacher input to English for processing
 * - Translating structured output back to teacher's language
 * - Cross-language evaluation
 *
 * API: https://github.com/facebookresearch/fairseq/tree/main/examples/nllb
 * Or via Meta's inference API when available
 */

const https = require('https');

class NLLBClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.NLLB_API_KEY || process.env.META_API_KEY;
    this.baseUrl = config.baseUrl || process.env.NLLB_API_BASE || 'https://api.meta.ai/v1';
    this.model = config.model || 'nllb-200-distilled-600M'; // or 'nllb-200-3.3B'
    this.enabled = !!this.apiKey;
    this.cache = new Map(); // Simple in-memory cache
    this.cacheMaxSize = 1000;
  }

  /**
   * Translate text from source to target language
   * @param {string} text
   * @param {string} sourceLang - NLLB language code (e.g., 'hin', 'mal', 'eng')
   * @param {string} targetLang - NLLB language code
   * @returns {Promise<string>}
   */
  async translate(text, sourceLang, targetLang) {
    if (!this.enabled) {
      console.warn('[NLLB] Not configured, returning original text');
      return text;
    }

    if (!text || sourceLang === targetLang) return text;

    const cacheKey = `${sourceLang}->${targetLang}:${text.substring(0, 100)}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const body = {
        model: this.model,
        inputs: text,
        parameters: {
          src_lang: sourceLang,
          tgt_lang: targetLang,
        },
      };

      const result = await this._request('/translation', body);
      const translated = result.translation || result.translations?.[0] || text;

      // Cache management
      if (this.cache.size >= this.cacheMaxSize) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(cacheKey, translated);

      return translated;
    } catch (err) {
      console.error(`[NLLB] Translation failed: ${err.message}`);
      return text; // Fallback to original
    }
  }

  /**
   * Batch translate multiple texts
   * @param {string[]} texts
   * @param {string} sourceLang
   * @param {string} targetLang
   * @returns {Promise<string[]>}
   */
  async translateBatch(texts, sourceLang, targetLang) {
    if (!this.enabled || !texts.length) return texts;

    try {
      const body = {
        model: this.model,
        inputs: texts,
        parameters: {
          src_lang: sourceLang,
          tgt_lang: targetLang,
        },
      };

      const result = await this._request('/translation/batch', body);
      return result.translations || texts;
    } catch (err) {
      console.error(`[NLLB] Batch translation failed: ${err.message}`);
      return texts;
    }
  }

  /**
   * Translate to English (for internal processing)
   * @param {string} text
   * @param {string} sourceLang
   * @returns {Promise<string>}
   */
  async toEnglish(text, sourceLang) {
    return this.translate(text, sourceLang, 'eng');
  }

  /**
   * Translate from English (for output)
   * @param {string} text
   * @param {string} targetLang
   * @returns {Promise<string>}
   */
  async fromEnglish(text, targetLang) {
    return this.translate(text, 'eng', targetLang);
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
        timeout: 30000,
      }, res => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(raw));
            } catch (e) {
              reject(new Error(`NLLB invalid JSON: ${raw.slice(0, 200)}`));
            }
          } else {
            reject(new Error(`NLLB ${res.statusCode}: ${raw.slice(0, 500)}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('NLLB timeout')); });
      req.write(data);
      req.end();
    });
  }

  /**
   * Check if NLLB is available
   */
  isAvailable() {
    return this.enabled;
  }

  /**
   * Get supported languages (subset of 200)
   */
  getSupportedLanguages() {
    return [
      'eng', 'hin', 'ben', 'tel', 'mar', 'tam', 'guj', 'kan', 'mal', 'ori',
      'pan', 'asm', 'mai', 'san', 'snd', 'kas', 'nep', 'kok', 'brx', 'doi',
      'sat', 'mni', 'urd', 'ara', 'fas', 'zho', 'spa', 'por', 'rus', 'jpn',
      'deu', 'kor', 'fra', 'tur', 'vie', 'pol', 'ita', 'ukr', 'nld', 'ron',
      'ind', 'swh', 'zsm', 'tgl', 'tha', 'eng',
    ];
  }
}

// Singleton instance
let nllbInstance = null;

function getNLLBClient(config) {
  if (!nllbInstance) {
    nllbInstance = new NLLBClient(config);
  }
  return nllbInstance;
}

function resetNLLBClient() {
  nllbInstance = null;
}

module.exports = {
  NLLBClient,
  getNLLBClient,
  resetNLLBClient,
};