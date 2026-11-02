/**
 * eval/run.js — Evaluation harness for TeacherDox Meta Hackathon
 *
 * Compares Meta vs Gemini on:
 * - Field accuracy (topic, summary, method, attendance, homework, carryForward)
 * - Latency (ms per call)
 * - Cost (estimated)
 *
 * Uses 30-50 real (consented/demo) photos and voice notes.
 * Outputs a comparison table for demo and README.
 */

const fs = require('fs');
const path = require('path');
const { generate: museGenerate } = require('../muse.js');
const { detectAndCrop } = require('../boardcrop.js');
const { transcribeAudio } = require('../muse.js');

// ──────────────────────────────────────────────────────────────────────────────
// Test data structure
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} TestCase
 * @property {string} id - Unique identifier
 * @property {string} type - 'photo' | 'voice' | 'photo+voice'
 * @property {string} language - 'en' | 'ml' | 'te' | 'hi'
 * @property {string} base64Image - Base64 encoded image (for photo tests)
 * @property {string} imageMimeType - 'image/jpeg' | 'image/png'
 * @property {string} base64Audio - Base64 encoded audio (for voice tests)
 * @property {string} audioMimeType - 'audio/ogg' | 'audio/opus'
 * @property {Object} expected - Expected structured entry fields
 * @property {string} expected.topic
 * @property {string} expected.summary
 * @property {string} expected.method
 * @property {string} expected.attendance
 * @property {string} expected.homework
 * @property {string} expected.carryForward
 */

// Sample test cases (replace with real consented data)
const TEST_CASES = [
  {
    id: 'tc-001',
    type: 'photo',
    language: 'en',
    base64Image: '', // Fill with real base64
    imageMimeType: 'image/jpeg',
    expected: {
      topic: 'Photosynthesis',
      summary: 'Explained light-dependent reactions',
      method: 'Lecture + diagram',
      attendance: '42/45',
      homework: 'Questions 1-5 page 120',
      carryForward: 'Calvin cycle tomorrow',
    },
  },
  {
    id: 'tc-002',
    type: 'voice',
    language: 'ml',
    base64Audio: '', // Fill with real base64
    audioMimeType: 'audio/ogg',
    expected: {
      topic: 'കേരള ചരിത്രം',
      summary: 'സംസ്ഥാന രൂപീകരണവും ആദ്യ മന്ത്രിസഭയും',
      method: 'ചർച്ച + നോട്ട്',
      attendance: '38/40',
      homework: 'പേജ് 45 ചോദ്യങ്ങൾ',
      carryForward: 'ഭരണഘടനchaffിന്റെ ഭാഗങ്ങൾ',
    },
  },
  // Add 30-50 real test cases here
];

// ──────────────────────────────────────────────────────────────────────────────
// Evaluation metrics
// ──────────────────────────────────────────────────────────────────────────────

const FIELDS = ['topic', 'summary', 'method', 'attendance', 'homework', 'carryForward'];

/**
 * Compute field-level accuracy between predicted and expected.
 * @param {Object} predicted
 * @param {Object} expected
 * @returns {Object} { fieldScores, overallAccuracy }
 */
function computeAccuracy(predicted, expected) {
  const fieldScores = {};
  let correct = 0;
  let total = 0;

  for (const field of FIELDS) {
    const pred = (predicted[field] || '').toLowerCase().trim();
    const exp = (expected[field] || '').toLowerCase().trim();

    if (!exp) {
      fieldScores[field] = { predicted: pred, expected: exp, score: null, skipped: true };
      continue;
    }

    total++;
    // Simple exact match for now; could use fuzzy matching
    const match = pred === exp;
    if (match) correct++;

    fieldScores[field] = {
      predicted: pred,
      expected: exp,
      score: match ? 1 : 0,
    };
  }

  return {
    fieldScores,
    overallAccuracy: total > 0 ? correct / total : 0,
    correct,
    total,
  };
}

/**
 * Run a single test case through both backends.
 * @param {TestCase} testCase
 * @returns {Promise<Object>}
 */
async function runTestCase(testCase) {
  const results = {
    testCaseId: testCase.id,
    type: testCase.type,
    language: testCase.language,
    gemini: null,
    meta: null,
    comparison: null,
  };

  // Build Gemini-style request body
  const buildBody = (text, imageData, audioData) => {
    const parts = [];
    if (text) parts.push({ text });
    if (imageData) parts.push({ inlineData: { mimeType: testCase.imageMimeType, data: imageData } });
    // Audio would be transcribed first, then text added
    return {
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
    };
  };

  // Test Gemini
  console.log(`[eval] Running ${testCase.id} on Gemini...`);
  const geminiStart = Date.now();
  try {
    const body = buildBody(
      `Language: ${testCase.language}. Extract structured diary entry: topic, summary, method, attendance, homework, carryForward. Return JSON only.`,
      testCase.base64Image,
      null
    );
    const geminiResult = await museGenerate(body, { user: 'eval' });
    results.gemini = {
      latency: Date.now() - geminiStart,
      backend: geminiResult.backend,
      model: geminiResult.modelName,
      output: geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || '',
      accuracy: null,
    };
  } catch (err) {
    results.gemini = { error: err.message, latency: Date.now() - geminiStart };
  }

  // Test Meta (if available)
  console.log(`[eval] Running ${testCase.id} on Meta...`);
  const metaStart = Date.now();
  try {
    // Temporarily force Meta backend
    const originalBackend = process.env.AI_BACKEND;
    process.env.AI_BACKEND = 'meta';
    process.env.META_AI_PHONES = 'eval';

    const body = buildBody(
      `Language: ${testCase.language}. Extract structured diary entry: topic, summary, method, attendance, homework, carryForward. Return JSON only.`,
      testCase.base64Image,
      null
    );
    const metaResult = await museGenerate(body, { user: 'eval' });
    results.meta = {
      latency: Date.now() - metaStart,
      backend: metaResult.backend,
      model: metaResult.modelName,
      output: metaResult.candidates?.[0]?.content?.parts?.[0]?.text || '',
      accuracy: null,
      fallback: metaResult.fallback || null,
    };

    process.env.AI_BACKEND = originalBackend;
  } catch (err) {
    results.meta = { error: err.message, latency: Date.now() - metaStart };
    process.env.AI_BACKEND = originalBackend;
  }

  // Parse outputs and compute accuracy
  for (const backend of ['gemini', 'meta']) {
    if (results[backend] && results[backend].output) {
      try {
        const parsed = JSON.parse(results[backend].output);
        results[backend].parsed = parsed;
        results[backend].accuracy = computeAccuracy(parsed, testCase.expected);
      } catch {
        results[backend].accuracy = { overallAccuracy: 0, parseError: true };
      }
    }
  }

  // Comparison
  if (results.gemini?.accuracy && results.meta?.accuracy) {
    results.comparison = {
      accuracyDiff: results.meta.accuracy.overallAccuracy - results.gemini.accuracy.overallAccuracy,
      latencyDiff: results.meta.latency - results.gemini.latency,
      geminiBetter: results.gemini.accuracy.overallAccuracy > results.meta.accuracy.overallAccuracy,
      metaBetter: results.meta.accuracy.overallAccuracy > results.gemini.accuracy.overallAccuracy,
    };
  }

  return results;
}

/**
 * Run all test cases and generate report.
 */
async function runEvaluation() {
  console.log('[eval] Starting evaluation harness...');
  console.log(`[eval] Test cases: ${TEST_CASES.length}`);

  const allResults = [];
  for (const testCase of TEST_CASES) {
    if (!testCase.base64Image && !testCase.base64Audio) {
      console.log(`[eval] Skipping ${testCase.id} - no test data`);
      continue;
    }
    const result = await runTestCase(testCase);
    allResults.push(result);
  }

  // Generate summary table
  const summary = generateSummaryTable(allResults);

  // Save results
  const outputDir = path.join(__dirname, 'results');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(
    path.join(outputDir, `eval-${timestamp}.json`),
    JSON.stringify({ results: allResults, summary }, null, 2)
  );

  // Print table to console
  console.log('\n' + summary);
  console.log(`\n[eval] Results saved to ${outputDir}/eval-${timestamp}.json`);

  return { results: allResults, summary };
}

/**
 * Generate markdown summary table.
 */
function generateSummaryTable(results) {
  const lines = [];
  lines.push('## Evaluation Results: Meta vs Gemini');
  lines.push('');
  lines.push('| Test Case | Type | Lang | Gemini Acc | Meta Acc | Δ Acc | Gemini Lat | Meta Lat | Δ Lat |');
  lines.push('|-----------|------|------|------------|----------|-------|------------|----------|-------|');

  let geminiTotalAcc = 0, metaTotalAcc = 0, geminiTotalLat = 0, metaTotalLat = 0;
  let validCount = 0;

  for (const r of results) {
    if (!r.gemini?.accuracy || !r.meta?.accuracy) continue;

    const gAcc = (r.gemini.accuracy.overallAccuracy * 100).toFixed(1);
    const mAcc = (r.meta.accuracy.overallAccuracy * 100).toFixed(1);
    const dAcc = (r.comparison?.accuracyDiff * 100).toFixed(1);
    const gLat = r.gemini.latency;
    const mLat = r.meta.latency;
    const dLat = r.comparison?.latencyDiff || 0;

    geminiTotalAcc += r.gemini.accuracy.overallAccuracy;
    metaTotalAcc += r.meta.accuracy.overallAccuracy;
    geminiTotalLat += gLat;
    metaTotalLat += mLat;
    validCount++;

    lines.push(`| ${r.testCaseId} | ${r.type} | ${r.language} | ${gAcc}% | ${mAcc}% | ${dAcc > 0 ? '+' : ''}${dAcc}% | ${gLat}ms | ${mLat}ms | ${dLat > 0 ? '+' : ''}${dLat}ms |`);
  }

  if (validCount > 0) {
    lines.push('|-----------|------|------|------------|----------|-------|------------|----------|-------|');
    lines.push(`| **Average** | | | **${(geminiTotalAcc/validCount*100).toFixed(1)}%** | **${(metaTotalAcc/validCount*100).toFixed(1)}%** | **${((metaTotalAcc-geminiTotalAcc)/validCount*100).toFixed(1)}%** | **${Math.round(geminiTotalLat/validCount)}ms** | **${Math.round(metaTotalLat/validCount)}ms** | **${Math.round((metaTotalLat-geminiTotalLat)/validCount)}ms** |`);
  }

  return lines.join('\n');
}

// ──────────────────────────────────────────────────────────────────────────────
// CLI
// ──────────────────────────────────────────────────────────────────────────────

if (require.main === module) {
  runEvaluation().catch(err => {
    console.error('[eval] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runEvaluation, computeAccuracy, TEST_CASES };