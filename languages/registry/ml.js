/**
 * Malayalam Language Plugin (മലയാളം)
 * Malayalam script
 */

const { BaseLanguage } = require('../base.js');
const { hasMalayalam, normalizeMalayalam } = require('../scripts/malayalam.js');
const { ML } = require('../../malayalam.js');

class MalayalamLanguage extends BaseLanguage {
  constructor() {
    super({
      code: 'ml',
      name: 'Malayalam',
      nativeName: 'മലയാളം',
      script: 'Mlym',
      rtl: false,
      fontFamily: '"Noto Sans Malayalam", "Rachana", sans-serif',
      nllbCode: 'mal',
      seamlessCode: 'mal',
    });
  }

  detect(text) {
    return hasMalayalam(text);
  }

  normalize(text) {
    return normalizeMalayalam(text);
  }

  getWords() {
    return ML;
  }

  getExtractionPrompt(context = {}) {
    const { classInfo, evidence } = context;
    return `മലയാളത്തിൽ സ്ട്രക്ചേർഡ് ഡയറി എൻട്രി എക്‌സ്ട്രാക്ട് ചെയ്യുക।
ക്ലാസ്: ${classInfo?.grade || ''}${classInfo?.section || ''} ${classInfo?.subject || ''}
പിരിയോഡ്: ${classInfo?.period || ''}
തീയതി: ${classInfo?.date || ''}

തെളിവ്: ${JSON.stringify(evidence, null, 2)}

മാത്രം JSON തിരികെ നൽകുക: topic, summary, method, attendance, homework, carryForward, language।`;
  }
}

module.exports = new MalayalamLanguage();