/**
 * MultilingualProcessor — Unified pipeline for 100+ language support
 *
 * Combines:
 * - Language detection (scripts + registry)
 * - NLLB-200 for translation
 * - SeamlessM4T for speech-to-text
 * - Llama for multilingual reasoning
 * - Language-specific prompts and formatting
 */

const { getNLLBClient } = require('./models/nllb.js');
const { getSeamlessClient } = require('./models/seamlessm4t.js');
const { getLlamaClient } = require('./models/llama.js');

// Lazy-loaded references to index functions (avoid circular dependency)
let _index = null;
function getIndex() {
  if (!_index) {
    _index = require('./index.js');
  }
  return _index;
}

class MultilingualProcessor {
  constructor(config = {}) {
    this.config = config;
    this.nllb = getNLLBClient(config.nllb);
    this.seamless = getSeamlessClient(config.seamless);
    this.llama = getLlamaClient(config.llama);
    this.defaultLang = config.defaultLang || 'en';

    // Track which models are available
    this.capabilities = {
      nllb: this.nllb.isAvailable(),
      seamless: this.seamless.isAvailable(),
      llama: this.llama.isAvailable(),
    };

    console.log('[MultilingualProcessor] Initialized:', this.capabilities);
  }

  // ==================== LANGUAGE DETECTION ====================

  /**
   * Detect language from text (WhatsApp message)
   * @param {string} text
   * @returns {string} language code
   */
  detect(text) {
    return getIndex().detectLanguage(text) || this.defaultLang;
  }

  /**
   * Detect language from audio (via SeamlessM4T language ID)
   * @param {string} base64Audio
   * @param {string} mimeType
   * @returns {Promise<string>}
   */
  async detectFromAudio(base64Audio, mimeType) {
    if (!this.capabilities.seamless) return this.defaultLang;

    try {
      // Use SeamlessM4T with language identification task
      const result = await this.seamless.transcribe(base64Audio, mimeType, 'auto', 'eng');
      return result.language || this.defaultLang;
    } catch (err) {
      console.warn('[MultilingualProcessor] Audio language detection failed:', err.message);
      return this.defaultLang;
    }
  }

  // ==================== VOICE PROCESSING ====================

  /**
   * Process voice note: transcribe in source language, optionally translate
   * @param {string} base64Audio
   * @param {string} mimeType
   * @param {string} sourceLang - Optional, auto-detected if not provided
   * @param {string} targetLang - Optional, translate to this language
   * @returns {Promise<{text: string, language: string, translatedText?: string, confidence: number}>}
   */
  async processVoice(base64Audio, mimeType, sourceLang = null, targetLang = 'en') {
    const detectedLang = sourceLang || await this.detectFromAudio(base64Audio, mimeType);
    const seamlessCode = getIndex().getSeamlessCode(detectedLang);

    let text, confidence;

    if (this.capabilities.seamless) {
      // Use SeamlessM4T for transcription
      const result = await this.seamless.transcribe(base64Audio, mimeType, seamlessCode, targetLang === 'en' ? 'eng' : seamlessCode);
      text = result.text;
      confidence = result.confidence;
    } else if (this.capabilities.llama) {
      // Fallback: Llama can't do audio directly, would need Muse Voice Transcribe
      throw new Error('No audio transcription model available');
    } else {
      throw new Error('No transcription capability');
    }

    // Translate to target language if needed
    let translatedText = text;
    if (targetLang && targetLang !== detectedLang && this.capabilities.nllb) {
      const nllbSource = getIndex().getNLLBCode(detectedLang);
      const nllbTarget = getIndex().getNLLBCode(targetLang);
      translatedText = await this.nllb.translate(text, nllbSource, nllbTarget);
    }

    return {
      text,
      language: detectedLang,
      translatedText: translatedText !== text ? translatedText : undefined,
      confidence,
    };
  }

  // ==================== STRUCTURED EXTRACTION ====================

  /**
   * Extract structured diary entry from multimodal evidence
   * @param {Object} evidence - { photos: [{base64, mimeType}], voice: [{base64, mimeType, text}], text: string }
   * @param {Object} classInfo - { grade, section, subject, period, date }
   * @param {string} targetLang - Language for output (default: detected from evidence)
   * @returns {Promise<{data: Object, confidence: Object, flags: Object, language: string}>}
   */
  async extractEntry(evidence, classInfo, targetLang = null) {
    // Detect language from evidence
    let detectedLang = targetLang;

    if (!detectedLang) {
      // Try text evidence first
      for (const v of evidence.voice || []) {
        if (v.text) {
          detectedLang = this.detect(v.text);
          break;
        }
      }
      // Try text notes
      if (!detectedLang && evidence.text) {
        detectedLang = this.detect(evidence.text);
      }
    }

    detectedLang = detectedLang || this.defaultLang;
    const langInstance = getIndex().getLanguage(detectedLang);

    // Build prompt in target language
    const prompt = langInstance?.getExtractionPrompt({ classInfo, evidence, language: detectedLang })
      || this._buildDefaultPrompt(evidence, classInfo, detectedLang);

    // Add photos to evidence for vision model
    const hasPhotos = evidence.photos && evidence.photos.length > 0;

    let result;

    if (hasPhotos && this.capabilities.llama) {
      // Use Llama Vision for board photo + text
      const photo = evidence.photos[0]; // Use first photo
      const visionPrompt = `${prompt}\n\nBoard photo analysis: Extract text, diagrams, and structure from the board image.`;
      result = await this.llama.generateWithConfidence(visionPrompt, this._getExtractionSchema());
    } else if (this.capabilities.llama) {
      // Text-only Llama
      result = await this.llama.generateWithConfidence(prompt, this._getExtractionSchema());
    } else {
      throw new Error('No extraction model available (need Llama)');
    }

    // Translate output to target language if different from detected
    let finalData = result.data;
    if (targetLang && targetLang !== detectedLang && this.capabilities.nllb) {
      finalData = await this._translateEntry(finalData, detectedLang, targetLang);
    }

    return {
      data: finalData,
      confidence: result.confidence,
      flags: result.flags,
      language: targetLang || detectedLang,
      detectedLanguage: detectedLang,
      backend: hasPhotos ? 'llama-vision' : 'llama-text',
    };
  }

  /**
   * Translate structured entry fields to target language
   */
  async _translateEntry(data, sourceLang, targetLang) {
    const nllbSource = getIndex().getNLLBCode(sourceLang);
    const nllbTarget = getIndex().getNLLBCode(targetLang);
    const translated = { ...data };

    for (const key of ['topic', 'summary', 'method', 'homework', 'carryForward']) {
      if (translated[key]) {
        translated[key] = await this.nllb.translate(translated[key], nllbSource, nllbTarget);
      }
    }
    translated.language = targetLang;
    return translated;
  }

  _getExtractionSchema() {
    return {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        summary: { type: 'string' },
        method: { type: 'string' },
        attendance: { type: 'string' },
        homework: { type: 'string' },
        carryForward: { type: 'string' },
        language: { type: 'string' },
      },
      required: ['topic', 'summary', 'language'],
    };
  }

  _buildDefaultPrompt(evidence, classInfo, lang) {
    const voiceTexts = (evidence.voice || []).map(v => v.text || v.translatedText).filter(Boolean).join(' ');
    const textNotes = evidence.text || '';

    return `Extract structured diary entry in ${lang}.
Class: ${classInfo?.grade || ''}${classInfo?.section || ''} ${classInfo?.subject || ''}
Period: ${classInfo?.period || ''}
Date: ${classInfo?.date || ''}

Voice transcript: ${voiceTexts}
Text notes: ${textNotes}
Photos: ${evidence.photos?.length || 0} image(s)

Return JSON only with fields: topic, summary, method, attendance, homework, carryForward, language.`;
  }

  // ==================== BOT REPLIES ====================

  /**
   * Get localized bot reply for a language
   * @param {string} langCode
   * @param {string} key - e.g., 'teacherWelcome', 'diary.firstEntry'
   * @param {...any} args
   * @returns {string}
   */
  getReply(langCode, key, ...args) {
    const lang = getIndex().getLanguage(langCode);
    if (!lang) return `[${langCode}] ${key} not found`;

    const words = lang.getWords();
    const keys = key.split('.');
    let fn = words;
    for (const k of keys) {
      fn = fn?.[k];
    }
    return typeof fn === 'function' ? fn(...args) : fn || `[${langCode}] ${key}`;
  }

  // ==================== UTILITIES ====================

  /**
   * Check if language is RTL
   */
  isRTL(langCode) {
    return getIndex().isRTL(langCode);
  }

  /**
   * Get font family for language
   */
  getFontFamily(langCode) {
    return getIndex().getFontFamily(langCode);
  }

  /**
   * Get all supported language codes
   */
  getSupportedLanguages() {
    return getIndex().getAllCodes();
  }

  /**
   * Get capabilities status
   */
  getCapabilities() {
    return { ...this.capabilities };
  }

  /**
   * Health check
   */
  async healthCheck() {
    const results = {};
    if (this.capabilities.nllb) {
      try {
        await this.nllb.translate('test', 'eng', 'hin');
        results.nllb = 'ok';
      } catch { results.nllb = 'error'; }
    }
    if (this.capabilities.seamless) {
      results.seamless = 'configured';
    }
    if (this.capabilities.llama) {
      results.llama = 'configured';
    }
    return results;
  }
}

// Singleton
let processorInstance = null;

function getMultilingualProcessor(config) {
  if (!processorInstance) {
    processorInstance = new MultilingualProcessor(config);
  }
  return processorInstance;
}

function resetMultilingualProcessor() {
  processorInstance = null;
}

module.exports = {
  MultilingualProcessor,
  getMultilingualProcessor,
  resetMultilingualProcessor,
};