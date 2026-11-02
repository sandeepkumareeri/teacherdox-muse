/**
 * malayalam.js — Malayalam bot replies for TeacherDox hackathon
 *
 * Adds 'ml' to the WORDS tables with teachers.language learning.
 * Entries are still written in English; only bot replies are localized.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Malayalam word tables (mirrors WORDS structure in canvas.js/onboard.js)
// ──────────────────────────────────────────────────────────────────────────────

const ML = {
  // Teacher welcome (onboard.js → teacherWelcome)
  teacherWelcome: (schoolName, subject, tdxId, memberInfo) => {
    const lines = [
      `നമസ്കാരം! ${schoolName} - ${subject}`,
      `നിങ്ങളുടെ ടീച്ചർഡോക്സ് ഐഡി: ${tdxId}`,
      memberInfo ? `നിങ്ങൾ ഫൗണ്ടിംഗ് അംഗം #${memberInfo.number} / ${memberInfo.total}` : '',
      'ഒരു പിരിയോഡ് = ഒരു എൻട്രി. ബോർഡിന് ഫോട്ടോ എടുക്കുക, വോയിസ് നോട്ട് അയക്കുക, അല്ലെങ്കിൽ ടൈപ്പ് ചെയ്യുക.',
      'AI അത് വിശകലനം ചെയ്ത് സ്ട്രക്ചേഴ്‌ഡ് എൻട്രിയാക്കും. ആദ്യ എൻട്രിക്ക് "View in diary" ബട്ടൺ, വൈകുന്നേരം "Sign diary".',
      'തെറ്റുകൾ ശരിയാക്കാൻ: "9A homework page 42" പോലെ അയക്കുക. നീക്കം ചെയ്യാൻ: "delete that photo".',
    ].filter(Boolean);
    return lines.join('\n');
  },

  // Period selection (canvas.js → buildTemplateCard)
  periodCard: (periods, live) => {
    const ticks = periods.map((p, i) => `${p.done ? '✅' : '⬜'} Period ${i + 1}: ${p.name}`).join('\n');
    const header = live
      ? 'ഇന്നത്തെ ലോഗ് (ലൈവ്):\n' + ticks + '\n\nഒരു പിരിയോഡ് ടാപ്പ് ചെയ്യുക:'
      : 'ഇന്നത്തെ പിരിയോഡുകൾ:\n' + ticks + '\n\nഒരു പിരിയോഡ് ടാപ്പ് ചെയ്യുക:';
    return header;
  },

  // Commands
  commands: {
    today: 'ഇന്നത്തെ ലോഗ്',
    menu: 'മെനു',
    register: 'രജിസ്റ്റർ',
    help: 'സഹായം',
    sign: 'സൈൻ',
    submit: 'സബ്മിറ്റ്',
    delete: 'ഡിലീറ്റ്',
    invite: 'അമര്‍ത്തുക',
    card: 'കാർഡ്',
    member: 'അംഗത്വം',
    membership: 'അംഗത്വം',
  },

  // Onboarding questions
  onboard: {
    askName: 'നിങ്ങളുടെ പേര് എന്ത്?',
    askSchool: 'നിങ്ങളുടെ സ്കൂളിന്റെ പേര് എഴുതുക (UDISE കോഡ് ആവശ്യമില്ല):',
    askSubject: 'നിങ്ങൾ ഏത് വിഷയം പഠിപ്പിക്കുന്നു?',
    confirm: (name, school, subject) => `നിങ്ങൾ: ${name}\nസ്കൂൾ: ${school}\nവിഷയം: ${subject}\n\nതീർച്ചയായോ? "yes" അയക്കുക.`,
    registered: (tdxId) => `നിങ്ങൾ രജിസ്റ്റർ ചെയ്തിരിക്കുന്നു! നിങ്ങളുടെ ഐഡി: ${tdxId}`,
  },

  // Diary / entry messages (canvas.js)
  diary: {
    firstEntry: (entrySummary) => `ഇന്നത്തെ ആദ്യ എൻട്രി തയ്യാർ:\n${entrySummary}\n\n"View in diary" ബട്ടൺ ടാപ്പ് ചെയ്യുക.`,
    eveningDigest: (entries) => {
      const lines = entries.map(e => `• ${e.class}: ${e.topic} — ${e.summary}${e.guessed ? ' ⚠' : ''}`);
      return `വൈകുന്നേരം കൈമാറ്റം:\n${lines.join('\n')}\n\n"Sign diary" ബട്ടൺ ടാപ്പ് ചെയ്യുക.`;
    },
    signed: 'ദിനം സൈൻ ചെയ്തിരിക്കുന്നു. നന്ദി!',
    autoSigned: 'ദിനം സ്വയമേവ സൈൻ ചെയ്തിരിക്കുന്നു (രാത്രി 8:00).',
    editPrompt: 'എൻട്രി എഡിറ്റ് ചെയ്യുക: "8B homework page 42" പോലെ അയക്കുക.',
    deletePrompt: 'എൻട്രി നീക്കം ചെയ്യുക: "delete 8B" അയക്കുക.',
    correctionApplied: 'തിരുത്തി.',
    deletionApplied: 'നീക്കം ചെയ്തു.',
  },

  // Errors / fallbacks
  errors: {
    unreadable: 'വായിക്കാൻ സാധിച്ചില്ല. ദയവായി വീണ്ടും ശ്രമിക്കുക.',
    irrelevant: 'ഈ സന്ദേശം പ്രായോഗികമല്ല.',
    aiLimit: 'AI ദിനപരിധി കടന്നു. മാനുവൽ എൻട്രി ചെയ്യുക.',
    notEnrolled: 'നിങ്ങൾ ഇന്നത്തെ ലോഗിന് എൻറോൾ ചെയ്തിട്ടില്ല.',
    deleteConfirm: 'നിങ്ങളുടെ അക്കൗണ്ടും എല്ലാ ഡാറ്റയും നീക്കം ചെയ്യുമോ? "DELETE" അയച്ചു സ്ഥിരീകരിക്കുക.',
    accountDeleted: 'നിങ്ങളുടെ അക്കൗണ്ട് നീക്കം ചെയ്തിരിക്കുന്നു. "Hi" അയച്ചാൽ വീണ്ടും തുടങ്ങാം.',
  },

  // Admin / test
  admin: {
    testwa: 'WhatsApp ടെസ്റ്റ്.ok',
    captured: (count) => `ഇന്ന് പിടിച്ചത്: ${count} സന്ദേശങ്ങൾ.`,
    msgusage: 'മെസേജ് ഉപയോക്തൃ വിവരങ്ങൾ...',
    process: (num) => `പ്രോസസ്സ് പ്രിവ്യൂ: ${num}`,
    digest: (num) => `ഡൈജസ്റ്റ് അയച്ചു: ${num}`,
    autosubmit: (num) => `ഓട്ടോ സബ്മിറ്റ്: ${num}`,
  },

  // Buttons / interactive
  buttons: {
    viewDiary: 'ഡയറി കാണുക',
    signDiary: 'ഡയറി സൈൻ ചെയ്യുക',
    logPeriod: 'പിരിയോഡ് ലോഗ് ചെയ്യുക',
    openDiary: 'എന്റെ ഡയറി തുറക്കുക',
    sendInvite: 'അമര്‍ത്ത് ലിങ്ക് അയക്കുക',
    pay: 'പേ ചെയ്യുക',
    plan: 'പ്ലാൻ',
    renew: 'താഴെയാക്കുക',
    makeLink: 'പുതിയ ലിങ്ക് ഉണ്ടാക്കുക',
    remove: 'നീക്കം ചെയ്യുക',
    confirm: 'തീർച്ചയായോ',
    cancel: 'റദ്ദാക്കുക',
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Language detection helper
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Detect if text is primarily Malayalam.
 * @param {string} text
 * @returns {boolean}
 */
function isMalayalam(text) {
  if (!text) return false;
  // Malayalam Unicode range: U+0D00–U+0D7F
  const mlChars = text.match(/[ഀ-ൿ]/g) || [];
  const totalChars = text.replace(/\s/g, '').length;
  return totalChars > 0 && mlChars.length / totalChars > 0.3;
}

/**
 * Get the appropriate word table for a language.
 * @param {'en'|'te'|'hi'|'ml'} lang
 * @returns {Object}
 */
function getWords(lang) {
  switch (lang) {
    case 'ml': return ML;
    case 'te': return require('./words-te.js'); // if exists
    case 'hi': return require('./words-hi.js'); // if exists
    default: return require('./words-en.js'); // fallback to English
  }
}

/**
 * Learn language from user's messages (like canvas.js does).
 * Updates teachers.language in DB.
 * @param {string} userMessage
 * @returns {'en'|'te'|'hi'|'ml'}
 */
function detectLanguage(userMessage) {
  if (isMalayalam(userMessage)) return 'ml';
  // Telugu range: U+0C00–U+0C7F
  if ((userMessage.match(/[ఀ-౿]/g) || []).length > 0) return 'te';
  // Devanagari range: U+0900–U+097F
  if ((userMessage.match(/[ऀ-ॿ]/g) || []).length > 0) return 'hi';
  return 'en';
}

// ──────────────────────────────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────────────────────────────

module.exports = {
  ML,
  isMalayalam,
  getWords,
  detectLanguage,
};