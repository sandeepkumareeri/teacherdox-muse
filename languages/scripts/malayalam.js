/**
 * Malayalam Script Utilities
 * Unicode: U+0D00–U+0D7F
 */

const MALAYALAM_RANGE = /[ഀ-ൿ]/g;

const MALAYALAM_NUMERALS = {
  '൦': '0', '൧': '1', '൨': '2', '൩': '3', '൪': '4',
  '൫': '5', '൬': '6', '൭': '7', '൮': '8', '൯': '9',
};

const LATIN_NUMERALS = Object.fromEntries(
  Object.entries(MALAYALAM_NUMERALS).map(([k, v]) => [v, k])
);

function hasMalayalam(text, threshold = 0.3) {
  if (!text) return false;
  const matches = text.match(MALAYALAM_RANGE) || [];
  const total = text.replace(/\s/g, '').length;
  return total > 0 && matches.length / total > threshold;
}

function normalizeMalayalam(text) {
  if (!text) return '';
  return text
    .replace(/[‌‍]/g, '')
    .replace(/[​-‏﻿]/g, '')
    .replace(/[൦-൯]/g, ch => MALAYALAM_NUMERALS[ch] || ch);
}

function toMalayalamNumerals(text) {
  if (!text) return '';
  return text.replace(/[0-9]/g, ch => LATIN_NUMERALS[ch] || ch);
}

function getScriptInfo() {
  return {
    name: 'Malayalam',
    iso15924: 'Mlym',
    unicodeRange: 'U+0D00–U+0D7F',
    languages: ['ml'],
    direction: 'ltr',
    hasCase: false,
    cursive: true,
  };
}

module.exports = {
  MALAYALAM_RANGE,
  hasMalayalam,
  normalizeMalayalam,
  toMalayalamNumerals,
  getScriptInfo,
  MALAYALAM_NUMERALS,
  LATIN_NUMERALS,
};