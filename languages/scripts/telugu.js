/**
 * Telugu Script Utilities
 * Unicode: U+0C00–U+0C7F
 */

const TELUGU_RANGE = /[ఀ-౿]/g;

const TELUGU_NUMERALS = {
  '౦': '0', '౧': '1', '౨': '2', '౩': '3', '౪': '4',
  '౫': '5', '౬': '6', '౭': '7', '౮': '8', '౯': '9',
};

const LATIN_NUMERALS = Object.fromEntries(
  Object.entries(TELUGU_NUMERALS).map(([k, v]) => [v, k])
);

function hasTelugu(text, threshold = 0.3) {
  if (!text) return false;
  const matches = text.match(TELUGU_RANGE) || [];
  const total = text.replace(/\s/g, '').length;
  return total > 0 && matches.length / total > threshold;
}

function normalizeTelugu(text) {
  if (!text) return '';
  return text
    .replace(/[‌‍]/g, '')
    .replace(/[​-‏﻿]/g, '')
    .replace(/[౦-౯]/g, ch => TELUGU_NUMERALS[ch] || ch);
}

function toTeluguNumerals(text) {
  if (!text) return '';
  return text.replace(/[0-9]/g, ch => LATIN_NUMERALS[ch] || ch);
}

function getScriptInfo() {
  return {
    name: 'Telugu',
    iso15924: 'Telu',
    unicodeRange: 'U+0C00–U+0C7F',
    languages: ['te'],
    direction: 'ltr',
    hasCase: false,
    cursive: true,
  };
}

module.exports = {
  TELUGU_RANGE,
  hasTelugu,
  normalizeTelugu,
  toTeluguNumerals,
  getScriptInfo,
  TELUGU_NUMERALS,
  LATIN_NUMERALS,
};