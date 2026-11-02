/**
 * Devanagari Script Utilities
 * Covers: Hindi, Marathi, Nepali, Sanskrit, Konkani, Bodo, Dogri, Maithili, Santali
 * Unicode: U+0900–U+097F
 */

const DEVANAGARI_RANGE = /[ऀ-ॿ]/g;

// Devanagari numerals map
const DEVANAGARI_NUMERALS = {
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
};

const LATIN_NUMERALS = Object.fromEntries(
  Object.entries(DEVANAGARI_NUMERALS).map(([k, v]) => [v, k])
);

/**
 * Detect if text contains Devanagari script
 */
function hasDevanagari(text, threshold = 0.3) {
  if (!text) return false;
  const matches = text.match(DEVANAGARI_RANGE) || [];
  const total = text.replace(/\s/g, '').length;
  return total > 0 && matches.length / total > threshold;
}

/**
 * Normalize Devanagari text:
 * - Convert Devanagari numerals to Latin
 * - Normalize ZWJ/ZWNJ
 * - Remove invisible chars
 */
function normalizeDevanagari(text) {
  if (!text) return '';
  return text
    .replace(/[‌‍]/g, '') // ZWNJ, ZWJ
    .replace(/[​-‏﻿]/g, '') // Invisible chars
    .replace(/[०-९]/g, ch => DEVANAGARI_NUMERALS[ch] || ch);
}

/**
 * Convert Latin numerals to Devanagari
 */
function toDevanagariNumerals(text) {
  if (!text) return '';
  return text.replace(/[0-9]/g, ch => LATIN_NUMERALS[ch] || ch);
}

/**
 * Get script info
 */
function getScriptInfo() {
  return {
    name: 'Devanagari',
    iso15924: 'Deva',
    unicodeRange: 'U+0900–U+097F',
    languages: ['hi', 'mr', 'ne', 'sa', 'kok', 'brx', 'doi', 'mai', 'sat'],
    direction: 'ltr',
    hasCase: false,
    cursive: false,
  };
}

module.exports = {
  DEVANAGARI_RANGE,
  hasDevanagari,
  normalizeDevanagari,
  toDevanagariNumerals,
  getScriptInfo,
  DEVANAGARI_NUMERALS,
  LATIN_NUMERALS,
};