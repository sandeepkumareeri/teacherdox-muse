/**
 * Latin Script Utilities
 * Covers: English, most European languages, Indonesian, Vietnamese, Swahili, etc.
 * Unicode: Basic Latin U+0000–U+007F, Latin-1 Supplement U+0080–U+00FF, Latin Extended-A U+0100–U+017F
 */

const LATIN_RANGE = /[A-Za-zÀ-ÿĀ-ž]/g;

function hasLatin(text, threshold = 0.3) {
  if (!text) return false;
  const matches = text.match(LATIN_RANGE) || [];
  const total = text.replace(/\s/g, '').length;
  return total > 0 && matches.length / total > threshold;
}

function normalizeLatin(text) {
  if (!text) return '';
  return text
    .normalize('NFC')
    .replace(/[‌‍]/g, '')
    .replace(/[​-‏﻿]/g, '');
}

function getScriptInfo() {
  return {
    name: 'Latin',
    iso15924: 'Latn',
    unicodeRange: 'U+0000–U+007F, U+0080–U+00FF, U+0100–U+017F, U+1E00–U+1EFF',
    languages: ['en', 'id', 'vi', 'sw', 'ms', 'tl', 'pt', 'es', 'fr', 'de', 'it', 'pl', 'tr', 'nl', 'ro', 'hu', 'cs', 'sk', 'hr', 'sl', 'et', 'lv', 'lt', 'sq', 'mt'],
    direction: 'ltr',
    hasCase: true,
    cursive: false,
  };
}

module.exports = {
  LATIN_RANGE,
  hasLatin,
  normalizeLatin,
  getScriptInfo,
};