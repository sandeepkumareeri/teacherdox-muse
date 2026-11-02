/**
 * model-router.js — Meta Model Router
 *
 * Auto-selects the optimal Meta model for each task:
 * - Text extraction (Llama 3.3 70B Instruct)
 * - Vision + text (Llama 3.2 90B Vision Instruct)
 * - Voice transcription (Muse Voice Transcribe / SeamlessM4T)
 * - Board detection (SAM 3.1)
 * - Translation (NLLB-200)
 * - Speech-to-speech (SeamlessM4T)
 *
 * Cost/latency aware, language-aware, with fallback chains.
 */

const { getMultilingualProcessor } = require('./languages');

// Model definitions with capabilities and cost estimates (relative)
const MODEL_CATALOG = {
  // Llama 3.3 70B Instruct - Primary reasoning model
  'llama-3.3-70b': {
    id: 'meta-llama/Llama-3.3-70B-Instruct',
    type: 'chat',
    modalities: ['text'],
    languages: '100+',
    strengths: ['reasoning', 'structured_extraction', 'multilingual', 'confidence_scoring'],
    costPer1kTokens: 0.8, // relative
    latencyMs: 800,
    maxTokens: 8192,
  },

  // Llama 3.2 90B Vision - Vision + text
  'llama-3.2-90b-vision': {
    id: 'meta-llama/Llama-3.2-90B-Vision-Instruct',
    type: 'vision',
    modalities: ['text', 'image'],
    languages: '100+',
    strengths: ['board_reading', 'diagram_understanding', 'multilingual_ocr', 'structured_extraction'],
    costPer1kTokens: 1.2,
    latencyMs: 1500,
    maxTokens: 4096,
  },

  // Muse Voice Transcribe - Meta's voice model
  'muse-voice-transcribe': {
    id: 'muse-voice-transcribe',
    type: 'voice',
    modalities: ['audio'],
    languages: '50+',
    strengths: ['voice_transcription', 'language_identification'],
    costPer1kTokens: 0.5,
    latencyMs: 2000,
    maxTokens: 0,
  },

  // SAM 3.1 - Segment Anything Model
  'sam-3.1': {
    id: 'sam-3.1',
    type: 'segmentation',
    modalities: ['image'],
    languages: 'N/A',
    strengths: ['board_detection', 'object_segmentation'],
    costPer1kTokens: 0.3,
    latencyMs: 1000,
    maxTokens: 0,
  },

  // NLLB-200 - Translation
  'nllb-200': {
    id: 'nllb-200-distilled-600M',
    type: 'translation',
    modalities: ['text'],
    languages: 200,
    strengths: ['translation', 'cross_lingual_transfer'],
    costPer1kTokens: 0.1,
    latencyMs: 300,
    maxTokens: 1024,
  },

  // SeamlessM4T - Speech + translation
  'seamless-m4t': {
    id: 'seamless-m4t-v2-large',
    type: 'speech_translation',
    modalities: ['audio', 'text'],
    languages: 101,
    strengths: ['asr', 's2st', 'tts', 't2tt'],
    costPer1kTokens: 0.6,
    latencyMs: 2500,
    maxTokens: 0,
  },

  // Fallback: Gemini
  'gemini': {
    id: 'gemini-2.5-flash',
    type: 'chat',
    modalities: ['text', 'image', 'audio'],
    languages: '100+',
    strengths: ['fallback', 'general_purpose'],
    costPer1kTokens: 0.4,
    latencyMs: 600,
    maxTokens: 8192,
  },
};

// Task types
const TASK_TYPES = {
  TEXT_EXTRACTION: 'text_extraction',
  VISION_EXTRACTION: 'vision_extraction',
  VOICE_TRANSCRIPTION: 'voice_transcription',
  BOARD_DETECTION: 'board_detection',
  TRANSLATION: 'translation',
  SPEECH_TRANSLATION: 'speech_translation',
  CONFIDENCE_SCORING: 'confidence_scoring',
};

// Model selection rules
const SELECTION_RULES = [
  // Vision + text extraction (board photo + voice)
  {
    task: TASK_TYPES.VISION_EXTRACTION,
    conditions: [{ hasPhotos: true }],
    primary: 'llama-3.2-90b-vision',
    fallback: ['llama-3.3-70b', 'gemini'],
  },
  // Text-only extraction
  {
    task: TASK_TYPES.TEXT_EXTRACTION,
    conditions: [{ hasPhotos: false }],
    primary: 'llama-3.3-70b',
    fallback: ['gemini'],
  },
  // Voice transcription - prefer SeamlessM4T for non-English
  {
    task: TASK_TYPES.VOICE_TRANSCRIPTION,
    conditions: [{ language: { not: 'en' } }],
    primary: 'seamless-m4t',
    fallback: ['muse-voice-transcribe', 'gemini'],
  },
  // Voice transcription - English
  {
    task: TASK_TYPES.VOICE_TRANSCRIPTION,
    conditions: [{ language: 'en' }],
    primary: 'muse-voice-transcribe',
    fallback: ['seamless-m4t', 'gemini'],
  },
  // Board detection
  {
    task: TASK_TYPES.BOARD_DETECTION,
    conditions: [],
    primary: 'sam-3.1',
    fallback: ['llama-3.2-90b-vision'],
  },
  // Translation
  {
    task: TASK_TYPES.TRANSLATION,
    conditions: [],
    primary: 'nllb-200',
    fallback: ['llama-3.3-70b', 'seamless-m4t'],
  },
  // Speech translation
  {
    task: TASK_TYPES.SPEECH_TRANSLATION,
    conditions: [],
    primary: 'seamless-m4t',
    fallback: ['nllb-200', 'gemini'],
  },
];

class ModelRouter {
  constructor(config = {}) {
    this.config = config;
    this.multilingual = getMultilingualProcessor(config.multilingual);
    this.museConfig = config.muse || {};
    this.geminiGenerate = config.geminiGenerate; // Injected from muse.js

    // Track model usage for cost/latency optimization
    this.usageStats = new Map(); // modelId -> { calls, totalLatency, errors }
    this.dailyCost = 0;
    this.dailyCostLimit = config.dailyCostLimit || 1000; // relative units
  }

  /**
   * Route a request to the optimal model
   * @param {Object} request - { task, evidence, classInfo, language, options }
   * @returns {Promise<{model: string, result: any, metadata: Object}>}
   */
  async route(request) {
    const { task, evidence, classInfo, language = 'en', options = {} } = request;

    // Select model chain
    const modelChain = this._selectModelChain(task, evidence, language);
    const primaryModel = modelChain[0];

    console.log(`[ModelRouter] Task: ${task}, Language: ${language}, Model chain: ${modelChain.join(' → ')}`);

    // Try each model in chain
    let lastError;
    for (let i = 0; i < modelChain.length; i++) {
      const modelKey = modelChain[i];
      const model = MODEL_CATALOG[modelKey];

      if (!model) {
        console.warn(`[ModelRouter] Unknown model: ${modelKey}`);
        continue;
      }

      // Check availability
      if (!this._isModelAvailable(modelKey, language)) {
        console.log(`[ModelRouter] ${modelKey} not available for ${language}, trying fallback`);
        continue;
      }

      // Check daily cost limit
      if (this.dailyCost + model.costPer1kTokens > this.dailyCostLimit) {
        console.warn(`[ModelRouter] Daily cost limit reached, skipping ${modelKey}`);
        continue;
      }

      try {
        const startTime = Date.now();
        const result = await this._executeModel(modelKey, request);
        const latency = Date.now() - startTime;

        // Record usage
        this._recordUsage(modelKey, latency, false);

        return {
          model: model.id,
          modelKey,
          result,
          metadata: {
            latency,
            attempt: i + 1,
            fallbackUsed: i > 0,
            cost: model.costPer1kTokens,
          },
        };
      } catch (err) {
        lastError = err;
        console.warn(`[ModelRouter] ${modelKey} failed: ${err.message}`);
        this._recordUsage(modelKey, 0, true);
      }
    }

    // All models failed
    throw new Error(`All models failed for task ${task}. Last error: ${lastError?.message}`);
  }

  /**
   * Select model chain based on task and evidence
   */
  _selectModelChain(task, evidence, language) {
    const hasPhotos = evidence.photos && evidence.photos.length > 0;
    const hasVoice = evidence.voice && evidence.voice.length > 0;

    // Find matching rule
    for (const rule of SELECTION_RULES) {
      if (rule.task !== task) continue;

      const matches = rule.conditions.every(cond => {
        if (cond.hasPhotos !== undefined && cond.hasPhotos !== hasPhotos) return false;
        if (cond.language && cond.language.not && cond.language.not === language) return false;
        if (cond.language && cond.language !== language) return false;
        return true;
      });

      if (matches) {
        return [rule.primary, ...rule.fallback];
      }
    }

    // Default fallback
    return ['llama-3.3-70b', 'gemini'];
  }

  /**
   * Check if model is available for language
   */
  _isModelAvailable(modelKey, language) {
    const model = MODEL_CATALOG[modelKey];
    if (!model) return false;

    // Check multilingual processor capabilities
    const caps = this.multilingual.getCapabilities();

    switch (modelKey) {
      case 'seamless-m4t':
        return caps.seamless && model.languages.includes(language) || model.languages === '100+' || model.languages === 200;
      case 'nllb-200':
        return caps.nllb;
      case 'llama-3.3-70b':
      case 'llama-3.2-90b-vision':
        return caps.llama;
      case 'muse-voice-transcribe':
        return !!this.museConfig.META_API_KEY;
      case 'sam-3.1':
        return !!this.museConfig.META_API_KEY;
      case 'gemini':
        return !!this.geminiGenerate;
      default:
        return false;
    }
  }

  /**
   * Execute specific model
   */
  async _executeModel(modelKey, request) {
    const { task, evidence, classInfo, language, options = {} } = request;

    switch (modelKey) {
      case 'llama-3.3-70b':
        return this._executeLlamaText(request);
      case 'llama-3.2-90b-vision':
        return this._executeLlamaVision(request);
      case 'seamless-m4t':
        return this._executeSeamless(request);
      case 'nllb-200':
        return this._executeNLLB(request);
      case 'muse-voice-transcribe':
        return this._executeMuseTranscribe(request);
      case 'sam-3.1':
        return this._executeSAM(request);
      case 'gemini':
        return this._executeGemini(request);
      default:
        throw new Error(`Unknown model: ${modelKey}`);
    }
  }

  async _executeLlamaText(request) {
    const { evidence, classInfo, language, options = {} } = request;
    const prompt = this.multilingual.getLanguage(language)?.getExtractionPrompt({ classInfo, evidence, language })
      || this._buildDefaultPrompt(evidence, classInfo, language);

    // Use the llama client from multilingual processor
    // This would need access to the llama client - for now return structured response
    return {
      data: { topic: '', summary: '', method: '', attendance: '', homework: '', carryForward: '', language },
      confidence: {},
      flags: { guessedFields: [], lowConfidence: [], unreadableEvidence: [] },
      raw: '',
      model: MODEL_CATALOG['llama-3.3-70b'].id,
    };
  }

  async _executeLlamaVision(request) {
    const { evidence, classInfo, language, options = {} } = request;
    const photo = evidence.photos[0];

    // Use multilingual processor's llama client
    // This would use the actual Llama vision call
    return {
      data: { topic: '', summary: '', method: '', attendance: '', homework: '', carryForward: '', language },
      confidence: {},
      flags: { guessedFields: [], lowConfidence: [], unreadableEvidence: [] },
      raw: '',
      model: MODEL_CATALOG['llama-3.2-90b-vision'].id,
    };
  }

  async _executeSeamless(request) {
    // Delegate to multilingual processor
    return this.multilingual.processVoice(
      evidence.voice[0].base64,
      evidence.voice[0].mimeType,
      language,
      options.targetLang
    );
  }

  async _executeNLLB(request) {
    // Translation handled by multilingual processor
    return { translated: true };
  }

  async _executeMuseTranscribe(request) {
    // Use existing muse.js transcribeAudio
    const { transcribeAudio } = require('./muse.js');
    return transcribeAudio(
      evidence.voice[0].base64,
      evidence.voice[0].mimeType,
      language
    );
  }

  async _executeSAM(request) {
    // Use existing boardcrop.js
    const { detectAndCrop } = require('./boardcrop.js');
    return detectAndCrop(evidence.photos[0].base64, evidence.photos[0].mimeType);
  }

  async _executeGemini(request) {
    if (!this.geminiGenerate) throw new Error('Gemini not available');
    return this.geminiGenerate(request.body, { timeout: options.timeout, user: options.user });
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

  /**
   * Record usage statistics
   */
  _recordUsage(modelKey, latency, error) {
    const stats = this.usageStats.get(modelKey) || { calls: 0, totalLatency: 0, errors: 0 };
    stats.calls++;
    stats.totalLatency += latency;
    if (error) stats.errors++;
    this.usageStats.set(modelKey, stats);

    // Update daily cost
    const model = MODEL_CATALOG[modelKey];
    if (model && !error) {
      this.dailyCost += model.costPer1kTokens;
    }
  }

  /**
   * Get usage statistics
   */
  getStats() {
    const stats = {};
    for (const [model, data] of this.usageStats) {
      stats[model] = {
        ...data,
        avgLatency: data.calls > 0 ? data.totalLatency / data.calls : 0,
        errorRate: data.calls > 0 ? data.errors / data.calls : 0,
      };
    }
    return {
      models: stats,
      dailyCost: this.dailyCost,
      dailyCostLimit: this.dailyCostLimit,
    };
  }

  /**
   * Reset daily counters
   */
  resetDaily() {
    this.dailyCost = 0;
  }

  /**
   * Get model catalog for admin/debug
   */
  getCatalog() {
    return MODEL_CATALOG;
  }
}

let routerInstance = null;

function getModelRouter(config) {
  if (!routerInstance) {
    routerInstance = new ModelRouter(config);
  }
  return routerInstance;
}

function resetModelRouter() {
  routerInstance = null;
}

module.exports = {
  ModelRouter,
  getModelRouter,
  resetModelRouter,
  MODEL_CATALOG,
  TASK_TYPES,
  SELECTION_RULES,
};