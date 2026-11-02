/**
 * Telugu Language Plugin (తెలుగు)
 * Telugu script
 */

const { BaseLanguage } = require('../base.js');
const { hasTelugu, normalizeTelugu } = require('../scripts/telugu.js');

class TeluguLanguage extends BaseLanguage {
  constructor() {
    super({
      code: 'te',
      name: 'Telugu',
      nativeName: 'తెలుగు',
      script: 'Telu',
      rtl: false,
      fontFamily: '"Noto Sans Telugu", "Vemana2000", sans-serif',
      nllbCode: 'tel',
      seamlessCode: 'tel',
    });
  }

  detect(text) {
    return hasTelugu(text);
  }

  normalize(text) {
    return normalizeTelugu(text);
  }

  getWords() {
    return {
      teacherWelcome: (schoolName, subject, tdxId, memberInfo) => {
        const lines = [
          `నమస్కారం! ${schoolName} - ${subject}`,
          `మీ టీచర్డాక్స్ ఐడీ: ${tdxId}`,
          memberInfo ? `మీరు ఫౌండింగ్ సభ్యుడు #${memberInfo.number} / ${memberInfo.total}` : '',
          'ఒక పీరియడ్ = ఒక ఎంట్రీ. బోర్డ్ ఫోటో తీయండి, వాయిస్ నోట్ పంపండి, లేదా టైప్ చేయండి.',
          'AI దానిని స్ట్రక్చర్ చేస్తుంది. మొదటి ఎంట్రీకు "View in diary", సాయంత్రం "Sign diary"।',
          'తిరുത്തాలంటే: "9A హోమ్వర్క్ పేజీ 42"uldig 직접적送. حذف करने के लिए: "delete that photo"।',
        ].filter(Boolean);
        return lines.join('\n');
      },

      periodCard: (periods, live) => {
        const ticks = periods.map((p, i) => `${p.done ? '✅' : '⬜'} పిరియడ్ ${i + 1}: ${p.name}`).join('\n');
        const header = live
          ? `ఈ రోజు లాగ్ (లైవ్):\n${ticks}\n\nఒక పీరియడ్ టాప్ చేయండి:`
          : `ఈ రోజు పీరియడ్లు:\n${ticks}\n\nఒక పీరియడ్ టాప్ చేయండి:`;
        return header;
      },

      commands: {
        today: 'ఈ రోజు లాగ్',
        menu: 'మెనూ',
        register: 'రిజిస్టర్',
        help: 'సహాయం',
        sign: 'సైన్',
        submit: 'సబ్మిట్',
        delete: 'డిలీట్',
        invite: 'ఆహ్వానించండి',
        card: 'కార్డ్',
        member: 'సభ్యత్వం',
      },

      onboard: {
        askName: 'మీ పేరు ఏమిటి?',
        askSchool: 'మీ స్కూల్ పేరు రాయండి (UDISE కోడు అవసరం లేదు):',
        askSubject: 'మీరు ఏ విషయాన్ని బోధిస్తారు?',
        confirm: (name, school, subject) => `మీరు: ${name}\nస్కూల్: ${school}\nవిషయం: ${subject}\n\nఖచ్చితంగా? "yes" పంపండి.`,
        registered: (tdxId) => `రిజిస్టర్ అయ్యింది! మీ ఐడీ: ${tdxId}`,
      },

      diary: {
        firstEntry: (entrySummary) => `ఈ రోజు మొదటి ఎంట్రీ సిద్ధం:\n${entrySummary}\n\n"View in diary" బటన్ టాప్ చేయండి।`,
        eveningDigest: (entries) => {
          const lines = entries.map(e => `• ${e.class}: ${e.topic} — ${e.summary}${e.guessed ? ' ⚠' : ''}`);
          return `సాయంత్రం హ్యాండోవర్:\n${lines.join('\n')}\n\n"Sign diary" బటన్ టాప్ చేయండి।`;
        },
        signed: 'రోజు సైన్ అయ్యింది. ధన్యవాదాలు!',
        autoSigned: 'రోజు ఆటో-సైన్ అయ్యింది (రాత్రి 8:00).',
        editPrompt: 'ఎంట్రీ ఎడిట్ చేయండి: "9B హోమ్వర్క్ పేజీ 42"ủng 보낸 것처럼 보내세요.',
        deletePrompt: 'ఎంట్రీ డిలీట్ చేయండి: "delete 9B" ուղινήండి.',
        correctionApplied: 'తిరుచ్చుకున్నాము.',
        deletionApplied: 'డిలీట్ చేయబడింది.',
      },

      errors: {
        unreadable: 'చదవలేకపోయాను. దయచేసి మళ్లీ ప్రయత్నించండి.',
        irrelevant: 'ఈ సందేశం ఉపయోగకరం కాదు.',
        aiLimit: 'AI రోజு పరిమితి పూర్తైంది. మ্যান్యువల్ ఎంట్రీ చేయండి.',
        notEnrolled: 'మీరు ఈ రోజు లాగ్‌కు ఎన్రోల్ కాకపోయారు.',
        deleteConfirm: 'ఖాతా మరియు తమామ్ డేటా డిలీట్ చేయాలా? ఖచ్చితcheon "DELETE" పంపండి.',
        accountDeleted: 'ఖాతా డిలీట్ చేయబడింది. "Hi" పంపి మళ్లీ ప్రారంభించండి.',
      },

      admin: {
        testwa: 'వత్త్సాప్ టెస్ట్ OK',
        captured: (count) => `ఈ రోజు క్యాప్చర్: ${count} సందేశాలు.`,
        msgusage: 'సందేశვა వాడుక వివరాలు...',
        process: (num) => `ప్రొసెస్ ప్రివ్యూ: ${num}`,
        digest: (num) => `డైజెస్ట్ పంపలissance: ${num}`,
        autosubmit: (num) => `ఆటో-సబ్మిట్: ${num}`,
      },

      buttons: {
        viewDiary: 'డాయరీ చూడండి',
        signDiary: 'డాయరీ సైన్ చేయండి',
        logPeriod: 'పీరియడ్ లాగ్ చేయండి',
        openDiary: 'నా డాయరీ తెరవండి',
        sendInvite: 'ఆహ్వాన లింక్ పంపండి',
        pay: 'చెల్లించండి',
        plan: 'ప్లాన్',
        renew: 'నవీకరించండి',
        makeLink: 'కొత్త లింక్ సృష్టించండి',
        remove: 'తొలగించండి',
        confirm: 'ఖచ్చితreadcrumb',
        cancel: 'రద్దు చేయండి',
      },
    };
  }

  getExtractionPrompt(context = {}) {
    const { classInfo, evidence } = context;
    return `తెలుగులో స్ట్రక్చర్డ్ డైరీ ఎంట్రీ ఎక్స్ట్రాక్ట్ చేయండి.
వర్గం: ${classInfo?.grade || ''}${classInfo?.section || ''} ${classInfo?.subject || ''}
పీరియడ్: ${classInfo?.period || ''}
తేదీ: ${classInfo?.date || ''}

సాక్ష్యం: ${JSON.stringify(evidence, null, 2)}

కేవలం JSON mivel таблиц: topic, summary, method, attendance, homework, carryForward, language.`;
  }
}

module.exports = new TeluguLanguage();