/**
 * gemini.js — Stub for standalone testing of teacherdox-muse modules
 *
 * In production, this is provided by the private TeacherDox repo.
 * This stub provides the same interface for testing/hackathon demo.
 */

// In-memory counters (per IST day)
let geminiCallsToday = 0;
let geminiCallsByUser = new Map();
let lastGeminiDayKey = null;

const GEMINI_DAILY_LIMIT = parseInt(process.env.GEMINI_DAILY_LIMIT || '500', 10);
const GEMINI_DAILY_LIMIT_PER_USER = parseInt(process.env.GEMINI_DAILY_LIMIT_PER_USER || '40', 10);

function getTodayKey() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, '0')}-${String(ist.getDate()).padStart(2, '0')}`;
}

function resetIfNewDay() {
  const today = getTodayKey();
  if (today !== lastGeminiDayKey) {
    geminiCallsToday = 0;
    geminiCallsByUser.clear();
    lastGeminiDayKey = today;
  }
}

function checkLimits(user) {
  resetIfNewDay();
  if (geminiCallsToday >= GEMINI_DAILY_LIMIT) {
    return { allowed: false, code: 'GEMINI_DAILY_LIMIT', message: `Gemini daily limit (${GEMINI_DAILY_LIMIT}) reached` };
  }
  if (user) {
    const userCalls = geminiCallsByUser.get(user) || 0;
    if (userCalls >= GEMINI_DAILY_LIMIT_PER_USER) {
      return { allowed: false, code: 'GEMINI_DAILY_LIMIT_PER_USER', message: `Gemini per-user daily limit (${GEMINI_DAILY_LIMIT_PER_USER}) reached for ${user}` };
    }
  }
  return { allowed: true };
}

function recordCall(user) {
  geminiCallsToday++;
  if (user) {
    geminiCallsByUser.set(user, (geminiCallsByUser.get(user) || 0) + 1);
  }
}

/**
 * Mock Gemini generate function for testing.
 * Returns a structured response matching the expected format.
 */
async function generate(body, opts = {}) {
  const { timeout = 60000, user } = opts;

  const limitCheck = checkLimits(user);
  if (!limitCheck.allowed) {
    throw new Error(limitCheck.message);
  }

  recordCall(user);

  // Simulate API latency
  await new Promise(r => setTimeout(r, 100 + Math.random() * 200));

  // Extract text from the request for basic response
  const contents = body.contents || [];
  const userText = contents
    .filter(c => c.role === 'user')
    .flatMap(c => c.parts || [])
    .filter(p => p.text)
    .map(p => p.text)
    .join(' ');

  // Generate a mock structured response based on the prompt
  let mockResponse = {
    topic: 'Sample Topic',
    summary: 'Sample summary of the lesson',
    method: 'Lecture',
    attendance: '40/45',
    homework: 'Questions 1-5',
    carryForward: 'Continue next class',
    language: 'en',
  };

  // If the prompt mentions specific fields, try to extract them
  if (userText.includes('Photosynthesis')) {
    mockResponse = {
      topic: 'Photosynthesis',
      summary: 'Explained light-dependent reactions with diagram on board. Students identified chlorophyll role.',
      method: 'Lecture + diagram + Q&A',
      attendance: '42/45',
      homework: 'Questions 1-5 page 120',
      carryForward: 'Calvin cycle tomorrow',
      language: 'en',
    };
  } else if (userText.includes('കേരള ചരിത്രം') || userText.includes('Kerala History')) {
    mockResponse = {
      topic: 'കേരള ചരിത്രം',
      summary: 'സംസ്ഥാന രൂപീകരണവും ആദ്യ മന്ത്രിസഭയും',
      method: 'ചർച്ച + നോട്ട്',
      attendance: '38/40',
      homework: 'പേജ് 45 ചോദ്യങ്ങൾ',
      carryForward: 'ഭരണഘടനയുടെ ഭാഗങ്ങൾ',
      language: 'ml',
    };
  }

  return {
    candidates: [{
      content: {
        parts: [{ text: JSON.stringify(mockResponse) }],
        role: 'model',
      },
    }],
    model: 'gemini-2.5-flash',
    usageMetadata: {
      promptTokenCount: 100,
      candidatesTokenCount: 200,
      totalTokenCount: 300,
    },
  };
}

module.exports = {
  generate,
  checkLimits,
  getTodayKey,
  _config: () => ({
    GEMINI_DAILY_LIMIT,
    GEMINI_DAILY_LIMIT_PER_USER,
    geminiCallsToday,
    geminiCallsByUser: Object.fromEntries(geminiCallsByUser),
  }),
};