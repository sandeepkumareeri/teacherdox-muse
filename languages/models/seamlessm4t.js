/**
 * SeamlessM4T Integration — Meta's unified speech/text translation model
 *
 * Supports 100+ languages for:
 * - Speech-to-text (ASR)
 * - Speech-to-speech (S2ST)
 * - Text-to-speech (TTS)
 * - Text-to-text translation
 *
 * This replaces/augments Muse Voice Transcribe for non-English languages
 */

const https = require('https');

class SeamlessM4TClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.SEAMLESS_API_KEY || process.env.META_API_KEY;
    this.baseUrl = config.baseUrl || process.env.SEAMLESS_API_BASE || 'https://api.meta.ai/v1';
    this.model = config.model || 'seamless-m4t-v2-large'; // or 'seamless-m4t-medium'
    this.enabled = !!this.apiKey;
  }

  /**
   * Transcribe audio (speech-to-text)
   * @param {string} base64Audio - Base64 encoded audio (OGG/Opus from WhatsApp)
   * @param {string} mimeType - 'audio/ogg', 'audio/opus', 'audio/wav'
   * @param {string} sourceLang - SeamlessM4T language code (e.g., 'hin', 'mal', 'eng')
   * @param {string} targetLang - Target language code (default: same as source)
   * @returns {Promise<{text: string, language: string, confidence: number}>}
   */
  async transcribe(base64Audio, mimeType, sourceLang, targetLang = null) {
    if (!this.enabled) {
      throw new Error('SeamlessM4T not configured');
    }

    const format = mimeType.replace('audio/', '').replace('opus', 'ogg');

    try {
      const body = {
        model: this.model,
        audio: { data: base64Audio, format },
        task: 'asr', // or 's2st' for speech-to-speech
        source_lang: sourceLang,
        target_lang: targetLang || sourceLang,
      };

      const result = await this._request('/audio/transcriptions', body);

      return {
        text: result.text || result.transcription || '',
        language: result.language || sourceLang,
        confidence: result.confidence || 0.9,
      };
    } catch (err) {
      console.error(`[SeamlessM4T] Transcription failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Translate text (text-to-text)
   * @param {string} text
   * @param {string} sourceLang
   * @param {string} targetLang
   * @returns {Promise<string>}
   */
  async translateText(text, sourceLang, targetLang) {
    if (!this.enabled) throw new Error('SeamlessM4T not configured');
    if (!text || sourceLang === targetLang) return text;

    try {
      const body = {
        model: this.model,
        text,
        task: 't2tt',
        source_lang: sourceLang,
        target_lang: targetLang,
      };

      const result = await this._request('/translation', body);
      return result.translation || result.text || text;
    } catch (err) {
      console.error(`[SeamlessM4T] Text translation failed: ${err.message}`);
      return text;
    }
  }

  /**
   * Text-to-speech
   * @param {string} text
   * @param {string} targetLang
   * @returns {Promise<{base64Audio: string, mimeType: string}>}
   */
  async synthesize(text, targetLang) {
    if (!this.enabled) throw new Error('SeamlessM4T not configured');

    try {
      const body = {
        model: this.model,
        text,
        task: 'tts',
        target_lang: targetLang,
      };

      const result = await this._request('/audio/speech', body);
      return {
        base64Audio: result.audio || result.data || '',
        mimeType: 'audio/wav',
      };
    } catch (err) {
      console.error(`[SeamlessM4T] TTS failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Speech-to-speech translation
   * @param {string} base64Audio
   * @param {string} mimeType
   * @param {string} sourceLang
   * @param {string} targetLang
   * @returns {Promise<{base64Audio: string, text: string, mimeType: string}>}
   */
  async translateSpeech(base64Audio, mimeType, sourceLang, targetLang) {
    if (!this.enabled) throw new Error('SeamlessM4T not configured');

    const format = mimeType.replace('audio/', '').replace('opus', 'ogg');

    try {
      const body = {
        model: this.model,
        audio: { data: base64Audio, format },
        task: 's2st',
        source_lang: sourceLang,
        target_lang: targetLang,
      };

      const result = await this._request('/audio/translate', body);
      return {
        base64Audio: result.audio || result.data || '',
        text: result.text || '',
        mimeType: 'audio/wav',
      };
    } catch (err) {
      console.error(`[SeamlessM4T] S2ST failed: ${err.message}`);
      throw err;
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
        timeout: 60000, // Longer for audio
      }, res => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(raw));
            } catch (e) {
              reject(new Error(`SeamlessM4T invalid JSON: ${raw.slice(0, 200)}`));
            }
          } else {
            reject(new Error(`SeamlessM4T ${res.statusCode}: ${raw.slice(0, 500)}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('SeamlessM4T timeout')); });
      req.write(data);
      req.end();
    });
  }

  isAvailable() {
    return this.enabled;
  }

  getSupportedLanguages() {
    // 100+ languages supported by SeamlessM4T
    return [
      'eng', 'hin', 'ben', 'tel', 'mar', 'tam', 'guj', 'kan', 'mal', 'ori',
      'pan', 'asm', 'urd', 'ara', 'fas', 'zho', 'spa', 'por', 'rus', 'jpn',
      'deu', 'kor', 'fra', 'tur', 'vie', 'pol', 'ita', 'ukr', 'nld', 'ron',
      'ind', 'swh', 'zsm', 'tgl', 'tha',
    ];
  }
}

let seamlessInstance = null;

function getSeamlessClient(config) {
  if (!seamlessInstance) {
    seamlessInstance = new SeamlessM4TClient(config);
  }
  return seamlessInstance;
}

function resetSeamlessClient() {
  seamlessInstance = null;
}

module.exports = {
  SeamlessM4TClient,
  getSeamlessClient,
  resetSeamlessClient,
};