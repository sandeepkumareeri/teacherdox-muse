/**
 * Arabic Script Utilities
 * Covers: Arabic, Urdu, Persian, Kashmiri, Sindhi, Pashto, etc.
 * Unicode: U+0600–U+06FF, U+0750–U+077F, U+08A0–U+08FF, U+FB50–U+FDFF, U+FE70–U+FEFF
 */

const ARABIC_RANGE = /[؀-ۿݐ-ݿࢠ-ࢿﭐ-﷿ﹰ-﻿]/g;

const ARABIC_NUMERALS = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

const EXTENDED_ARABIC_NUMERALS = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

const ALL_ARABIC_NUMERALS = { ...ARABIC_NUMERALS, ...EXTENDED_ARABIC_NUMERALS };
const LATIN_NUMERALS = Object.fromEntries(
  Object.entries(ALL_ARABIC_NUMERALS).map(([k, v]) => [v, k])
);

function hasArabic(text, threshold = 0.3) {
  if (!text) return false;
  const matches = text.match(ARABIC_RANGE) || [];
  const total = text.replace(/\s/g, '').length;
  return total > 0 && matches.length / total > threshold;
}

function normalizeArabic(text) {
  if (!text) return '';
  return text
    .replace(/[‌‍]/g, '')
    .replace(/[​-‏﻿]/g, '')
    .replace(/[؀-ۿݐ-ݿࢠ-ࢿﭐ-﷿ﹰ-﻿]/g, ch => ALL_ARABIC_NUMERALS[ch] || ch)
    // Normalize alef variants
    .replace(/[أإآ]/g, 'ا')
    // Normalize teh marbuta
    .replace(/ة/g, 'ه')
    // Normalize alef maksura
    .replace(/ى/g, 'ي');
}

function toArabicNumerals(text, extended = false) {
  if (!text) return '';
  const map = extended ? EXTENDED_ARABIC_NUMERALS : ARABIC_NUMERALS;
  return text.replace(/[0-9]/g, ch => map[ch] || ch);
}

function getScriptInfo() {
  return {
    name: 'Arabic',
    iso15924: 'Arab',
    unicodeRange: 'U+0600–U+06FF, U+0750–U+077F, U+08A0–U+08FF, U+FB50–U+FDFF, U+FE70–U+FEFF',
    languages: ['ar', 'ur', 'fa', 'ks', 'sd', 'ps', 'ku', 'ug'],
    direction: 'rtl',
    hasCase: false,
    cursive: true,
    shapingRequired: true,
  };
}

module.exports = {
  ARABIC_RANGE,
  hasArabic,
  normalizeArabic,
  toArabicNumerals,
  getScriptInfo,
  ARABIC_NUMERALS,
  EXTENDED_ARABIC_NUMERALS,
  LATIN_NUMERALS,
};