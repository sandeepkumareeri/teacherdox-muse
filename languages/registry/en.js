/**
 * English Language Plugin
 * Reference implementation
 */

const { BaseLanguage } = require('../base.js');
const { hasLatin, normalizeLatin } = require('../scripts/latin.js');

class EnglishLanguage extends BaseLanguage {
  constructor() {
    super({
      code: 'en',
      name: 'English',
      nativeName: 'English',
      script: 'Latn',
      rtl: false,
      fontFamily: 'system-ui, sans-serif',
      nllbCode: 'eng',
      seamlessCode: 'eng',
    });
  }

  detect(text) {
    return hasLatin(text);
  }

  normalize(text) {
    return normalizeLatin(text);
  }

  getWords() {
    return {
      teacherWelcome: (schoolName, subject, tdxId, memberInfo) => {
        const lines = [
          `Welcome! ${schoolName} - ${subject}`,
          `Your TeacherDox ID: ${tdxId}`,
          memberInfo ? `You are founding member #${memberInfo.number} / ${memberInfo.total}` : '',
          'One period = one entry. Snap the board, send a voice note, or type.',
          'AI structures it. First entry gets "View in diary", evening gets "Sign diary".',
          'Fix errors like: "9A homework page 42". Delete: "delete that photo".',
        ].filter(Boolean);
        return lines.join('\n');
      },

      periodCard: (periods, live) => {
        const ticks = periods.map((p, i) => `${p.done ? '✅' : '⬜'} Period ${i + 1}: ${p.name}`).join('\n');
        const header = live
          ? `Today's Log (Live):\n${ticks}\n\nTap a period:`
          : `Today's Periods:\n${ticks}\n\nTap a period:`;
        return header;
      },

      commands: {
        today: "Today's Log",
        menu: 'Menu',
        register: 'Register',
        help: 'Help',
        sign: 'Sign',
        submit: 'Submit',
        delete: 'Delete',
        invite: 'Invite',
        card: 'Card',
        member: 'Membership',
      },

      onboard: {
        askName: "What's your name?",
        askSchool: "Your school's name (UDISE code not needed):",
        askSubject: "What subject do you teach?",
        confirm: (name, school, subject) => `You: ${name}\nSchool: ${school}\nSubject: ${subject}\n\nConfirm? Send "yes".`,
        registered: (tdxId) => `Registered! Your ID: ${tdxId}`,
      },

      diary: {
        firstEntry: (entrySummary) => `Today's first entry ready:\n${entrySummary}\n\nTap "View in diary".`,
        eveningDigest: (entries) => {
          const lines = entries.map(e => `• ${e.class}: ${e.topic} — ${e.summary}${e.guessed ? ' ⚠' : ''}`);
          return `Evening Handover:\n${lines.join('\n')}\n\nTap "Sign diary".`;
        },
        signed: 'Day signed. Thank you!',
        autoSigned: 'Day auto-signed (8:00 PM).',
        editPrompt: 'Edit entry: send like "8B homework page 42".',
        deletePrompt: 'Delete entry: send "delete 8B".',
        correctionApplied: 'Corrected.',
        deletionApplied: 'Deleted.',
      },

      errors: {
        unreadable: "Couldn't read that. Please try again.",
        irrelevant: 'This message isn\'t actionable.',
        aiLimit: 'AI daily limit reached. Enter manually.',
        notEnrolled: "You're not enrolled for today's log.",
        deleteConfirm: 'Delete your account and all data? Send "DELETE" to confirm.',
        accountDeleted: 'Account deleted. Send "Hi" to restart.',
      },

      admin: {
        testwa: 'WhatsApp test OK',
        captured: (count) => `Captured today: ${count} messages.`,
        msgusage: 'Message usage details...',
        process: (num) => `Process preview: ${num}`,
        digest: (num) => `Digest sent: ${num}`,
        autosubmit: (num) => `Auto-submit: ${num}`,
      },

      buttons: {
        viewDiary: 'View Diary',
        signDiary: 'Sign Diary',
        logPeriod: 'Log Period',
        openDiary: 'Open My Diary',
        sendInvite: 'Send Invite Link',
        pay: 'Pay',
        plan: 'Plan',
        renew: 'Renew',
        makeLink: 'Create New Link',
        remove: 'Remove',
        confirm: 'Confirm',
        cancel: 'Cancel',
      },
    };
  }

  getExtractionPrompt(context = {}) {
    const { classInfo, evidence } = context;
    return `Extract structured diary entry in English.
Class: ${classInfo?.grade || ''}${classInfo?.section || ''} ${classInfo?.subject || ''}
Period: ${classInfo?.period || ''}
Date: ${classInfo?.date || ''}

Evidence: ${JSON.stringify(evidence, null, 2)}

Return JSON only with fields: topic, summary, method, attendance, homework, carryForward, language.`;
  }
}

module.exports = new EnglishLanguage();