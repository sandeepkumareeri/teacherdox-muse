/**
 * BaseLanguage — Abstract interface for all language implementations
 * Every language plugin must extend this class
 */

class BaseLanguage {
  constructor(config = {}) {
    this.code = config.code || 'en';
    this.name = config.name || 'English';
    this.nativeName = config.nativeName || 'English';
    this.script = config.script || 'Latn';
    this.rtl = config.rtl || false;
    this.fontFamily = config.fontFamily || 'system-ui, sans-serif';
    this.direction = this.rtl ? 'rtl' : 'ltr';
  }

  // ==================== REQUIRED: Override in subclass ====================

  /**
   * Detect if text is primarily in this language
   * @param {string} text
   * @returns {boolean}
   */
  detect(text) {
    throw new Error(`detect() must be implemented by ${this.code}`);
  }

  /**
   * Get localized bot replies (WORDS table equivalent)
   * @returns {Object}
   */
  getWords() {
    throw new Error(`getWords() must be implemented by ${this.code}`);
  }

  // ==================== OPTIONAL: Override for customization ====================

  /**
   * Normalize text for processing (e.g., remove ZWJ, normalize numerals)
   * @param {string} text
   * @returns {string}
   */
  normalize(text) {
    return text;
  }

  /**
   * Format date/time for this locale
   * @param {Date} date
   * @param {Object} options
   * @returns {string}
   */
  formatDateTime(date, options = {}) {
    return date.toLocaleString(this.locale || 'en-US', options);
  }

  /**
   * Get NLLB language code (ISO 639-3)
   * @returns {string}
   */
  getNLLBCode() {
    return this.nllbCode || this.code;
  }

  /**
   * Get SeamlessM4T language code
   * @returns {string}
   */
  getSeamlessCode() {
    return this.seamlessCode || this.code;
  }

  /**
   * Get Llama prompt template for structured extraction
   * @param {Object} context
   * @returns {string}
   */
  getExtractionPrompt(context = {}) {
    const { classInfo, evidence, language } = context;
    return `Extract structured diary entry in ${this.nativeName} (${this.code}).
Class: ${classInfo?.grade || ''}${classInfo?.section || ''} ${classInfo?.subject || ''}
Period: ${classInfo?.period || ''}
Date: ${classInfo?.date || ''}

Evidence: ${JSON.stringify(evidence, null, 2)}

Return JSON only with fields: topic, summary, method, attendance, homework, carryForward, language.`;
  }

  /**
   * Get confidence thresholds for this language
   * @returns {Object}
   */
  getConfidenceThresholds() {
    return {
      autoAccept: 0.95,
      flagWarn: 0.80,
      flagEdit: 0.60,
      reject: 0.60,
    };
  }

  // ==================== UTILITIES ====================

  /**
   * Check if text contains this language's script
   * @param {string} text
   * @param {number} threshold - Ratio of script chars to total (default 0.3)
   * @returns {boolean}
   */
  hasScript(text, threshold = 0.3) {
    if (!text || !this.scriptRange) return false;
    const matches = text.match(this.scriptRange) || [];
    const totalChars = text.replace(/\s/g, '').length;
    return totalChars > 0 && matches.length / totalChars > threshold;
  }

  /**
   * Get language metadata for admin/debug
   * @returns {Object}
   */
  getMeta() {
    return {
      code: this.code,
      name: this.name,
      nativeName: this.nativeName,
      script: this.script,
      rtl: this.rtl,
      fontFamily: this.fontFamily,
      direction: this.direction,
      nllbCode: this.getNLLBCode(),
      seamlessCode: this.getSeamlessCode(),
      thresholds: this.getConfidenceThresholds(),
    };
  }
}

module.exports = { BaseLanguage };