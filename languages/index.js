/**
 * languages/index.js — Central language registry and detector
 *
 * This is the main entry point for all language operations.
 * Auto-loads all language plugins from registry/
 */

const fs = require('fs');
const path = require('path');
const { BaseLanguage } = require('./base.js');

// Script detectors
const { hasDevanagari } = require('./scripts/devanagari.js');
const { hasMalayalam } = require('./scripts/malayalam.js');
const { hasTelugu } = require('./scripts/telugu.js');
const { hasArabic } = require('./scripts/arabic.js');
const { hasLatin } = require('./scripts/latin.js');

// ==================== LANGUAGE REGISTRY ====================

const languageRegistry = new Map();
const scriptDetectors = [
  { code: 'hi', detect: hasDevanagari, scripts: ['devanagari'] },
  { code: 'mr', detect: hasDevanagari, scripts: ['devanagari'] },
  { code: 'ne', detect: hasDevanagari, scripts: ['devanagari'] },
  { code: 'ml', detect: hasMalayalam, scripts: ['malayalam'] },
  { code: 'te', detect: hasTelugu, scripts: ['telugu'] },
  { code: 'ar', detect: hasArabic, scripts: ['arabic'] },
  { code: 'ur', detect: hasArabic, scripts: ['arabic'] },
  { code: 'fa', detect: hasArabic, scripts: ['arabic'] },
  { code: 'en', detect: hasLatin, scripts: ['latin'] },
  { code: 'id', detect: hasLatin, scripts: ['latin'] },
  { code: 'vi', detect: hasLatin, scripts: ['latin'] },
];

// Language metadata for 100+ languages (subset loaded dynamically)
const LANGUAGE_METADATA = {
  // Indian languages (22 scheduled + more)
  hi: { name: 'Hindi', nativeName: 'हिन्दी', script: 'Deva', rtl: false, nllbCode: 'hin', seamlessCode: 'hin' },
  bn: { name: 'Bengali', nativeName: 'বাংলা', script: 'Beng', rtl: false, nllbCode: 'ben', seamlessCode: 'ben' },
  te: { name: 'Telugu', nativeName: 'తెలుగు', script: 'Telu', rtl: false, nllbCode: 'tel', seamlessCode: 'tel' },
  mr: { name: 'Marathi', nativeName: 'मराठी', script: 'Deva', rtl: false, nllbCode: 'mar', seamlessCode: 'mar' },
  ta: { name: 'Tamil', nativeName: 'தமிழ்', script: 'Taml', rtl: false, nllbCode: 'tam', seamlessCode: 'tam' },
  gu: { name: 'Gujarati', nativeName: 'ગુજરાતી', script: 'Gujr', rtl: false, nllbCode: 'guj', seamlessCode: 'guj' },
  kn: { name: 'Kannada', nativeName: 'ಕನ್ನಡ', script: 'Knda', rtl: false, nllbCode: 'kan', seamlessCode: 'kan' },
  ml: { name: 'Malayalam', nativeName: 'മലയാളം', script: 'Mlym', rtl: false, nllbCode: 'mal', seamlessCode: 'mal' },
  or: { name: 'Odia', nativeName: 'ଓଡ଼ିଆ', script: 'Orya', rtl: false, nllbCode: 'ori', seamlessCode: 'ori' },
  pa: { name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', script: 'Guru', rtl: false, nllbCode: 'pan', seamlessCode: 'pan' },
  as: { name: 'Assamese', nativeName: 'অসমীয়া', script: 'Beng', rtl: false, nllbCode: 'asm', seamlessCode: 'asm' },
  ma: { name: 'Maithili', nativeName: 'मैथिली', script: 'Deva', rtl: false, nllbCode: 'mai', seamlessCode: 'mai' },
  sa: { name: 'Sanskrit', nativeName: 'संस्कृतम्', script: 'Deva', rtl: false, nllbCode: 'san', seamlessCode: 'san' },
  sd: { name: 'Sindhi', nativeName: 'سنڌي', script: 'Arab', rtl: true, nllbCode: 'snd', seamlessCode: 'snd' },
  ks: { name: 'Kashmiri', nativeName: 'कॉशुर', script: 'Arab', rtl: true, nllbCode: 'kas', seamlessCode: 'kas' },
  ne: { name: 'Nepali', nativeName: 'नेपाली', script: 'Deva', rtl: false, nllbCode: 'nep', seamlessCode: 'nep' },
  kok: { name: 'Konkani', nativeName: 'कोंकणी', script: 'Deva', rtl: false, nllbCode: 'kok', seamlessCode: 'kok' },
  brx: { name: 'Bodo', nativeName: 'बड़ो', script: 'Deva', rtl: false, nllbCode: 'brx', seamlessCode: 'brx' },
  doi: { name: 'Dogri', nativeName: 'डोगरी', script: 'Deva', rtl: false, nllbCode: 'doi', seamlessCode: 'doi' },
  mai: { name: 'Maithili', nativeName: 'मैथिली', script: 'Deva', rtl: false, nllbCode: 'mai', seamlessCode: 'mai' },
  sat: { name: 'Santali', nativeName: 'ᱥᱟᱱᱛᱟᱲᱤ', script: 'Olck', rtl: false, nllbCode: 'sat', seamlessCode: 'sat' },
  mni: { name: 'Manipuri', nativeName: 'মেইতেই', script: 'Beng', rtl: false, nllbCode: 'mni', seamlessCode: 'mni' },

  // Major global languages
  en: { name: 'English', nativeName: 'English', script: 'Latn', rtl: false, nllbCode: 'eng', seamlessCode: 'eng' },
  zh: { name: 'Chinese', nativeName: '中文', script: 'Hans', rtl: false, nllbCode: 'zho', seamlessCode: 'cmn' },
  es: { name: 'Spanish', nativeName: 'Español', script: 'Latn', rtl: false, nllbCode: 'spa', seamlessCode: 'spa' },
  ar: { name: 'Arabic', nativeName: 'العربية', script: 'Arab', rtl: true, nllbCode: 'ara', seamlessCode: 'ara' },
  hi: { name: 'Hindi', nativeName: 'हिन्दी', script: 'Deva', rtl: false, nllbCode: 'hin', seamlessCode: 'hin' },
  bn: { name: 'Bengali', nativeName: 'বাংলা', script: 'Beng', rtl: false, nllbCode: 'ben', seamlessCode: 'ben' },
  pt: { name: 'Portuguese', nativeName: 'Português', script: 'Latn', rtl: false, nllbCode: 'por', seamlessCode: 'por' },
  ru: { name: 'Russian', nativeName: 'Русский', script: 'Cyrl', rtl: false, nllbCode: 'rus', seamlessCode: 'rus' },
  ja: { name: 'Japanese', nativeName: '日本語', script: 'Jpan', rtl: false, nllbCode: 'jpn', seamlessCode: 'jpn' },
  de: { name: 'German', nativeName: 'Deutsch', script: 'Latn', rtl: false, nllbCode: 'deu', seamlessCode: 'deu' },
  ko: { name: 'Korean', nativeName: '한국어', script: 'Kore', rtl: false, nllbCode: 'kor', seamlessCode: 'kor' },
  fr: { name: 'French', nativeName: 'Français', script: 'Latn', rtl: false, nllbCode: 'fra', seamlessCode: 'fra' },
  tr: { name: 'Turkish', nativeName: 'Türkçe', script: 'Latn', rtl: false, nllbCode: 'tur', seamlessCode: 'tur' },
  vi: { name: 'Vietnamese', nativeName: 'Tiếng Việt', script: 'Latn', rtl: false, nllbCode: 'vie', seamlessCode: 'vie' },
  ta: { name: 'Tamil', nativeName: 'தமிழ்', script: 'Taml', rtl: false, nllbCode: 'tam', seamlessCode: 'tam' },
  ur: { name: 'Urdu', nativeName: 'اردو', script: 'Arab', rtl: true, nllbCode: 'urd', seamlessCode: 'urd' },
  fa: { name: 'Persian', nativeName: 'فارسی', script: 'Arab', rtl: true, nllbCode: 'fas', seamlessCode: 'fas' },
  pl: { name: 'Polish', nativeName: 'Polski', script: 'Latn', rtl: false, nllbCode: 'pol', seamlessCode: 'pol' },
  it: { name: 'Italian', nativeName: 'Italiano', script: 'Latn', rtl: false, nllbCode: 'ita', seamlessCode: 'ita' },
  uk: { name: 'Ukrainian', nativeName: 'Українська', script: 'Cyrl', rtl: false, nllbCode: 'ukr', seamlessCode: 'ukr' },
  nl: { name: 'Dutch', nativeName: 'Nederlands', script: 'Latn', rtl: false, nllbCode: 'nld', seamlessCode: 'nld' },
  ro: { name: 'Romanian', nativeName: 'Română', script: 'Latn', rtl: false, nllbCode: 'ron', seamlessCode: 'ron' },
  id: { name: 'Indonesian', nativeName: 'Bahasa Indonesia', script: 'Latn', rtl: false, nllbCode: 'ind', seamlessCode: 'ind' },
  sw: { name: 'Swahili', nativeName: 'Kiswahili', script: 'Latn', rtl: false, nllbCode: 'swh', seamlessCode: 'swh' },
  ms: { name: 'Malay', nativeName: 'Bahasa Melayu', script: 'Latn', rtl: false, nllbCode: 'zsm', seamlessCode: 'zsm' },
  tl: { name: 'Tagalog', nativeName: 'Tagalog', script: 'Latn', rtl: false, nllbCode: 'tgl', seamlessCode: 'tgl' },
  th: { name: 'Thai', nativeName: 'ไทย', script: 'Thai', rtl: false, nllbCode: 'tha', seamlessCode: 'tha' },
};

// ==================== REGISTRY FUNCTIONS ====================

/**
 * Register a language plugin
 * @param {BaseLanguage} langInstance
 */
function registerLanguage(langInstance) {
  if (!(langInstance instanceof BaseLanguage)) {
    throw new Error('Language must extend BaseLanguage');
  }
  languageRegistry.set(langInstance.code, langInstance);
  console.log(`[languages] Registered: ${langInstance.code} (${langInstance.nativeName})`);
}

/**
 * Get language instance by code
 * @param {string} code
 * @returns {BaseLanguage|null}
 */
function getLanguage(code) {
  const normalized = code.toLowerCase();
  if (languageRegistry.has(normalized)) {
    return languageRegistry.get(normalized);
  }
  // Auto-create from metadata if not explicitly registered
  if (LANGUAGE_METADATA[normalized]) {
    return createLanguageFromMetadata(normalized);
  }
  return null;
}

/**
 * Create language instance from metadata (fallback)
 */
function createLanguageFromMetadata(code) {
  const meta = LANGUAGE_METADATA[code];
  if (!meta) return null;

  class DynamicLanguage extends BaseLanguage {
    constructor() {
      super({
        code,
        name: meta.name,
        nativeName: meta.nativeName,
        script: meta.script,
        rtl: meta.rtl,
        nllbCode: meta.nllbCode,
        seamlessCode: meta.seamlessCode,
      });
    }

    detect(text) {
      const detector = scriptDetectors.find(d => d.code === code);
      return detector ? detector.detect(text) : false;
    }

    getWords() {
      // Return minimal English fallback
      return require('../malayalam.js').ML; // Will be replaced per language
    }
  }

  const instance = new DynamicLanguage();
  languageRegistry.set(code, instance);
  return instance;
}

/**
 * Detect language from text
 * @param {string} text
 * @returns {string} language code (defaults to 'en')
 */
function detectLanguage(text) {
  if (!text) return 'en';

  // Try registered languages first
  for (const [code, lang] of languageRegistry) {
    if (lang.detect(text)) return code;
  }

  // Fallback to script detectors
  for (const detector of scriptDetectors) {
    if (detector.detect(text)) return detector.code;
  }

  return 'en';
}

/**
 * Get all registered language codes
 * @returns {string[]}
 */
function getAllCodes() {
  return Array.from(languageRegistry.keys()).sort();
}

/**
 * Get language metadata for admin/debug
 * @returns {Object}
 */
function getAllMeta() {
  const meta = {};
  for (const [code, lang] of languageRegistry) {
    meta[code] = lang.getMeta();
  }
  return meta;
}

/**
 * Load all language plugins from registry/
 */
function loadAllLanguages() {
  const registryDir = path.join(__dirname, 'registry');
  if (!fs.existsSync(registryDir)) {
    console.warn('[languages] No registry/ directory found');
    return;
  }

  const files = fs.readdirSync(registryDir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    try {
      const langModule = require(path.join(registryDir, file));
      if (langModule.default && langModule.default.prototype instanceof BaseLanguage) {
        // ES6 class export
        registerLanguage(new langModule.default());
      } else if (typeof langModule === 'function' && langModule.prototype instanceof BaseLanguage) {
        // CommonJS class export
        registerLanguage(new langModule());
      } else if (langModule.code) {
        // Instance export
        registerLanguage(langModule);
      }
    } catch (err) {
      console.error(`[languages] Failed to load ${file}:`, err.message);
    }
  }
}

/**
 * Get NLLB language code for a language
 * @param {string} code
 * @returns {string}
 */
function getNLLBCode(code) {
  const lang = getLanguage(code);
  return lang ? lang.getNLLBCode() : LANGUAGE_METADATA[code]?.nllbCode || code;
}

/**
 * Get SeamlessM4T language code for a language
 * @param {string} code
 * @returns {string}
 */
function getSeamlessCode(code) {
  const lang = getLanguage(code);
  return lang ? lang.getSeamlessCode() : LANGUAGE_METADATA[code]?.seamlessCode || code;
}

/**
 * Check if language is RTL
 * @param {string} code
 * @returns {boolean}
 */
function isRTL(code) {
  const lang = getLanguage(code);
  return lang ? lang.rtl : LANGUAGE_METADATA[code]?.rtl || false;
}

/**
 * Get font family for language
 * @param {string} code
 * @returns {string}
 */
function getFontFamily(code) {
  const lang = getLanguage(code);
  return lang ? lang.fontFamily : 'system-ui, sans-serif';
}

// Initialize by loading all plugins
loadAllLanguages();

// Ensure English is always available
if (!languageRegistry.has('en')) {
  const { BaseLanguage } = require('./base.js');
  class EnglishLang extends BaseLanguage {
    constructor() {
      super({
        code: 'en',
        name: 'English',
        nativeName: 'English',
        script: 'Latn',
        rtl: false,
        nllbCode: 'eng',
        seamlessCode: 'eng',
      });
    }
    detect(text) { return hasLatin(text); }
    getWords() { return require('../malayalam.js').ML; } // fallback
  }
  registerLanguage(new EnglishLang());
}

const { MultilingualProcessor, getMultilingualProcessor, resetMultilingualProcessor } = require('./processor.js');

module.exports = {
  BaseLanguage,
  registerLanguage,
  getLanguage,
  detectLanguage,
  getAllCodes,
  getAllMeta,
  loadAllLanguages,
  getNLLBCode,
  getSeamlessCode,
  isRTL,
  getFontFamily,
  LANGUAGE_METADATA,
  scriptDetectors,
  // Unified processor
  MultilingualProcessor,
  getMultilingualProcessor,
  resetMultilingualProcessor,
};