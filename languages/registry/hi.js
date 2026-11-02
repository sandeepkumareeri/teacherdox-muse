/**
 * Hindi Language Plugin (हिन्दी)
 * Devanagari script
 */

const { BaseLanguage } = require('../base.js');
const { hasDevanagari, normalizeDevanagari, toDevanagariNumerals } = require('../scripts/devanagari.js');

class HindiLanguage extends BaseLanguage {
  constructor() {
    super({
      code: 'hi',
      name: 'Hindi',
      nativeName: 'हिन्दी',
      script: 'Deva',
      rtl: false,
      fontFamily: '"Noto Sans Devanagari", "Lohit Devanagari", sans-serif',
      nllbCode: 'hin',
      seamlessCode: 'hin',
    });
  }

  detect(text) {
    return hasDevanagari(text);
  }

  normalize(text) {
    return normalizeDevanagari(text);
  }

  getWords() {
    return {
      teacherWelcome: (schoolName, subject, tdxId, memberInfo) => {
        const lines = [
          `नमस्ते! ${schoolName} - ${subject}`,
          `आपका टीचरडॉक्स आईडी: ${tdxId}`,
          memberInfo ? `आप फाउंडिंग सदस्य #${memberInfo.number} / ${memberInfo.total} हैं` : '',
          'एक पीरियड = एक एंट्री। बोर्ड का फोटो खींचें, वॉइस नोट भेजें, या टाइप करें।',
          'AI उसे स्ट्रक्चर करेगा। पहली एंट्री के लिए "View in diary", शाम को "Sign diary"।',
          'सुधार के लिए: "9A होमवर्क पेज 42" भेजें। डिलीट के लिए: "delete that photo"।',
        ].filter(Boolean);
        return lines.join('\n');
      },

      periodCard: (periods, live) => {
        const ticks = periods.map((p, i) => `${p.done ? '✅' : '⬜'} पीरियड ${i + 1}: ${p.name}`).join('\n');
        const header = live
          ? `आज का लॉग (लाइव):\n${ticks}\n\nएक पीरियड टैप करें:`
          : `आज के पीरियड:\n${ticks}\n\nएक पीरियड टैप करें:`;
        return header;
      },

      commands: {
        today: 'आज का लॉग',
        menu: 'मेनू',
        register: 'रजिस्टर',
        help: 'सहायता',
        sign: 'साइन',
        submit: 'सबमिट',
        delete: 'डिलीट',
        invite: 'आमंत्रित करें',
        card: 'कार्ड',
        member: 'सदस्यता',
      },

      onboard: {
        askName: 'आपका नाम क्या है?',
        askSchool: 'आपके स्कूल का नाम लिखें (UDISE कोड ज़रूरी नहीं):',
        askSubject: 'आप कौन सा विषय पढ़ाते हैं?',
        confirm: (name, school, subject) => `आप: ${name}\nस्कूल: ${school}\nविषय: ${subject}\n\nपक्का? "yes" भेजें।`,
        registered: (tdxId) => `रजिस्टर हो गया! आपका आईडी: ${tdxId}`,
      },

      diary: {
        firstEntry: (entrySummary) => `आज की पहली एंट्री तैयार:\n${entrySummary}\n\n"View in diary" बटन टैप करें।`,
        eveningDigest: (entries) => {
          const lines = entries.map(e => `• ${e.class}: ${e.topic} — ${e.summary}${e.guessed ? ' ⚠' : ''}`);
          return `शाम का हैंडओवर:\n${lines.join('\n')}\n\n"Sign diary" बटन टैप करें।`;
        },
        signed: 'दिन साइन हो गया। धन्यवाद!',
        autoSigned: 'दिन ऑटो-साइन हो गया (रात ८:००)।',
        editPrompt: 'एंट्री एडिट करें: "८B होमवर्क पेज ४२" जैसे भेजें।',
        deletePrompt: 'एंट्री डिलीट करें: "delete ८B" भेजें।',
        correctionApplied: 'सुधारा गया।',
        deletionApplied: 'डिलीट किया गया।',
      },

      errors: {
        unreadable: 'पढ़ नहीं सका। कृपया फिर कोशिश करें।',
        irrelevant: 'यह संदेश काम का नहीं है।',
        aiLimit: 'AI की दैनिक सीमा पूरी। मैन्युअल एंट्री करें।',
        notEnrolled: 'आप आज के लॉग के लिए एनरोल नहीं हैं।',
        deleteConfirm: 'अकाउंट और सारा डेटा डिलीट करें? पुष्टि के लिए "DELETE" भेजें।',
        accountDeleted: 'अकाउंट डिलीट हो गया। "Hi" भेजकर फिर शुरू करें।',
      },

      admin: {
        testwa: 'व्हाट्सऐप टेस्ट OK',
        captured: (count) => `आज कैप्चर हुआ: ${count} संदेश।`,
        msgusage: 'संदेश उपयोग विवरण...',
        process: (num) => `प्रोसेस प्रिव्यू: ${num}`,
        digest: (num) => `डाइजेस्ट भेजा: ${num}`,
        autosubmit: (num) => `ऑटो-सबमिट: ${num}`,
      },

      buttons: {
        viewDiary: 'डायरी देखें',
        signDiary: 'डायरी साइन करें',
        logPeriod: 'पीरियड लॉग करें',
        openDiary: 'मेरी डायरी खोलें',
        sendInvite: 'आमंत्रण लिंक भेजें',
        pay: 'भुगतान',
        plan: 'प्लान',
        renew: 'नवीनीकरण',
        makeLink: 'नया लिंक बनाएं',
        remove: 'हटाएं',
        confirm: 'पुष्टि',
        cancel: 'रद्द करें',
      },
    };
  }

  getExtractionPrompt(context = {}) {
    const { classInfo, evidence } = context;
    return `हिंदी में स्ट्रक्चर्ड डायरी एंट्री निकालें।
कक्षा: ${classInfo?.grade || ''}${classInfo?.section || ''} ${classInfo?.subject || ''}
पीरियड: ${classInfo?.period || ''}
तारीख: ${classInfo?.date || ''}

सबूत: ${JSON.stringify(evidence, null, 2)}

केवल JSON लौटाएं: topic, summary, method, attendance, homework, carryForward, language।`;
  }
}

module.exports = new HindiLanguage();