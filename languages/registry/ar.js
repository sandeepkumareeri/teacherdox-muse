/**
 * Arabic Language Plugin (العربية)
 * Arabic script, RTL
 */

const { BaseLanguage } = require('../base.js');
const { hasArabic, normalizeArabic } = require('../scripts/arabic.js');

class ArabicLanguage extends BaseLanguage {
  constructor() {
    super({
      code: 'ar',
      name: 'Arabic',
      nativeName: 'العربية',
      script: 'Arab',
      rtl: true,
      fontFamily: '"Noto Sans Arabic", "Amiri", "Scheherazade", sans-serif',
      nllbCode: 'ara',
      seamlessCode: 'ara',
    });
  }

  detect(text) {
    return hasArabic(text);
  }

  normalize(text) {
    return normalizeArabic(text);
  }

  getWords() {
    return {
      teacherWelcome: (schoolName, subject, tdxId, memberInfo) => {
        const lines = [
          `أهلاً بك! ${schoolName} - ${subject}`,
          `معرف TeacherDox الخاص بك: ${tdxId}`,
          memberInfo ? `أنت عضو مؤسس #${memberInfo.number} / ${memberInfo.total}` : '',
          'حصة واحدة = إدخال واحد. التقط صورة للسبورة، أرسل ملاحظة صوتية، أو اكتب.',
          'الذكاء الاصطناعي ينشئها. الإدخال الأول يحصل على "View in diary"، المساءً "Sign diary".',
          'للتصحيح: أرسل "9A الواجب الصفحة 42". للحذف: "delete that photo".',
        ].filter(Boolean);
        return lines.join('\n');
      },

      periodCard: (periods, live) => {
        const ticks = periods.map((p, i) => `${p.done ? '✅' : '⬜'} الحصة ${i + 1}: ${p.name}`).join('\n');
        const header = live
          ? `سجل اليوم (مباشر):\n${ticks}\n\nاضغط على حصة:`
          : `حصص اليوم:\n${ticks}\n\nاضغط على حصة:`;
        return header;
      },

      commands: {
        today: 'سجل اليوم',
        menu: 'القائمة',
        register: 'تسجيل',
        help: 'مساعدة',
        sign: 'توقيع',
        submit: 'إرسال',
        delete: 'حذف',
        invite: 'دعوة',
        card: 'بطاقة',
        member: 'العضوية',
      },

      onboard: {
        askName: 'ما اسمك؟',
        askSchool: 'اكتب اسم مدرستك (لا حاجة لكود UDISE):',
        askSubject: 'ما المادة التي تدرسها؟',
        confirm: (name, school, subject) => `أنت: ${name}\nالمدرسة: ${school}\nالمادة: ${subject}\n\nتأكيد؟ أرسل "yes".`,
        registered: (tdxId) => `تم التسجيل! معرفك: ${tdxId}`,
      },

      diary: {
        firstEntry: (entrySummary) => `إدخال اليوم الأول جاهز:\n${entrySummary}\n\nاضغط "View in diary".`,
        eveningDigest: (entries) => {
          const lines = entries.map(e => `• ${e.class}: ${e.topic} — ${e.summary}${e.guessed ? ' ⚠' : ''}`);
          return `التسليم المسائي:\n${lines.join('\n')}\n\nاضغط "Sign diary".`;
        },
        signed: 'تم توقيع اليوم. شكراً!',
        autoSigned: 'تم التوقيع التلقائي (8:00 مساءً).',
        editPrompt: 'عدّل الإدخال: أرسل مثل "9A الواجب الصفحة 42".',
        deletePrompt: 'احذف الإدخال: أرسل "delete 9A".',
        correctionApplied: 'تم التصحيح.',
        deletionApplied: 'تم الحذف.',
      },

      errors: {
        unreadable: 'تعذر القراءة. يرجى المحاولة مرة أخرى.',
        irrelevant: 'هذه الرسالة غير قابلة للتنفيذ.',
        aiLimit: 'تم تجاوز الحد اليومي للذكاء الاصطناعي. أدخل يدوياً.',
        notEnrolled: 'أنت غير مسجل في سجل اليوم.',
        deleteConfirm: 'حذف حسابك وجميع البيانات؟ أرسل "DELETE" للتأكيد.',
        accountDeleted: 'تم حذف الحساب. أرسل "Hi" للبدء من جديد.',
      },

      admin: {
        testwa: 'اختبار WhatsApp OK',
        captured: (count) => `تم التقاط اليوم: ${count} رسائل.`,
        msgusage: 'تفاصيل استخدام الرسائل...',
        process: (num) => `معاينة المعالجة: ${num}`,
        digest: (num) => `تم إرسال الملخص: ${num}`,
        autosubmit: (num) => `الإرسال التلقائي: ${num}`,
      },

      buttons: {
        viewDiary: 'عرض الدفتر',
        signDiary: 'توقيع الدفتر',
        logPeriod: 'تسجيل الحصة',
        openDiary: 'فتح دفتری',
        sendInvite: 'إرسال رابط الدعوة',
        pay: 'دفع',
        plan: 'الخطة',
        renew: 'تجديد',
        makeLink: 'إنشاء رابط جديد',
        remove: 'إزالة',
        confirm: 'تأكيد',
        cancel: 'إلغاء',
      },
    };
  }

  getExtractionPrompt(context = {}) {
    const { classInfo, evidence } = context;
    return `استخرج إدخال دفتر يوميات منظم بالعربية.
الصف: ${classInfo?.grade || ''}${classInfo?.section || ''} ${classInfo?.subject || ''}
الحصة: ${classInfo?.period || ''}
التاريخ: ${classInfo?.date || ''}

الأدلة: ${JSON.stringify(evidence, null, 2)}

أرجع JSON فقط بالحقول: topic, summary, method, attendance, homework, carryForward, language.`;
  }
}

module.exports = new ArabicLanguage();