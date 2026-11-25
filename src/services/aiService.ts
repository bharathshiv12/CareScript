import { getFirebaseIdToken } from '../lib/firebase';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { MedicationReminder, Prescription } from '../types/carescript';
import { formatTime12h } from '../utils/dateUtils';
import { extractEdgeFunctionError } from './careScriptApi';

export interface AIResponse {
  text: string;
  isDemo: boolean;
  conversationId?: string | null;
}

interface PatientContext {
  patientName: string;
  prescriptions: Prescription[];
  reminders: MedicationReminder[];
  isDemoAccount?: boolean;
  conversationId?: string | null;
}

const MEDICAL_TERM_GLOSSARY: { term: string; keywords: string[]; explanation: string }[] = [
  {
    term: 'Before Food (AC / Ante Cibum)',
    keywords: ['before food', 'ac', 'ante cibum', 'empty stomach'],
    explanation:
      'Taking a medicine "before food" usually means taking it 30 to 60 minutes before a meal so food does not slow down absorption. Always follow your pharmacist’s exact timing note.',
  },
  {
    term: 'After Food (PC / Post Cibum)',
    keywords: ['after food', 'pc', 'post cibum', 'with food'],
    explanation:
      '"After food" means taking your medicine shortly after finishing a meal or snack. This often helps protect the stomach from mild irritation.',
  },
  {
    term: 'OD / BD / TDS / QID (Frequency Abbreviations)',
    keywords: ['od', 'bd', 'bid', 'tds', 'tid', 'qid', 'frequency', 'abbreviation'],
    explanation:
      'Common prescription abbreviations:\n• OD = Once daily\n• BD / BID = Twice daily\n• TDS / TID = Three times daily\n• QID = Four times daily\n• HS = At bedtime\nIf handwriting on a prescription looks unclear, please confirm it with your pharmacist.',
  },
  {
    term: 'mg / mcg / mL (Strength Units)',
    keywords: ['mg', 'mcg', 'ml', 'strength', 'unit'],
    explanation:
      'Strength units show how much active medicine is in each tablet or spoonful: mg = milligrams, mcg = micrograms (1,000 mcg = 1 mg), and mL = milliliters for liquids.',
  },
];

function buildSafeDemoReply(prompt: string, context: PatientContext): string {
  const lower = prompt.toLowerCase();

  if (
    lower.includes('diagnos') ||
    lower.includes('what disease') ||
    lower.includes('do i have') ||
    lower.includes('prescribe') ||
    lower.includes('change my dose') ||
    lower.includes('double my dose') ||
    lower.includes('stop taking')
  ) {
    return (
      "I cannot diagnose medical conditions, prescribe medicines, or recommend changing your prescribed dose.\n\n" +
      'For any questions about symptoms, diagnosis, or adjusting your dosage, please speak directly with your doctor or pharmacist.'
    );
  }

  if (lower.includes('prescription') || lower.includes('explain my')) {
    const verified = context.prescriptions.filter((p) => p.reviewStatus === 'verified');
    if (verified.length === 0) {
      return (
        'You do not have any verified prescriptions saved yet. You can upload and review a prescription in the **Scan Prescription** tab.\n\n' +
        'For safety, I only summarize prescription details after you have reviewed and confirmed them.'
      );
    }
    const latest = verified[0];
    const medLines = latest.medicines
      .map(
        (m, idx) =>
          `${idx + 1}. **${m.name}** (${m.strength}) — ${m.dosage}, ${m.frequency} (${m.foodInstruction.replace('_', ' ')})`
      )
      .join('\n');
    return (
      `Here is a plain-language summary of your verified prescription (**${latest.title}**${latest.isDemoSample ? ' — Sample Demo Data' : ''}):\n\n` +
      `${medLines}\n\n` +
      'If any instruction feels unfamiliar, please confirm it with your doctor or pharmacist.'
    );
  }

  if (lower.includes('when') || lower.includes('schedule') || lower.includes('time') || lower.includes('take my medicine')) {
    const active = context.reminders.filter((r) => r.active);
    if (active.length === 0) {
      return 'You have no active medication reminders set up yet. You can add reminders from the **Reminders** tab or after verifying a prescription.';
    }
    const lines = active
      .map(
        (r) =>
          `• **${r.medicineName} (${r.strength})**: ${r.scheduledTimes.map(formatTime12h).join(', ')} — ${r.foodInstruction.replace('_', ' ')}`
      )
      .join('\n');
    return (
      `Based on your saved reminders, here is your current schedule:\n\n${lines}\n\n` +
      'Tip: Never take a double dose to make up for a missed dose unless your doctor or pharmacist tells you to.'
    );
  }

  for (const entry of MEDICAL_TERM_GLOSSARY) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return `**${entry.term}**\n\n${entry.explanation}`;
    }
  }
  if (lower.includes('medical term') || lower.includes('term')) {
    return (
      'I can explain common prescription terms in simple words! Try asking me about:\n' +
      '• **OD / BD / TDS** (how many times a day)\n' +
      '• **Before Food (AC)** vs **After Food (PC)**\n' +
      '• **mg / mcg / mL** (medicine strength)\n\n' +
      'Which term from your prescription would you like explained?'
    );
  }

  if (lower.includes('general health') || lower.includes('tip') || lower.includes('water') || lower.includes('sleep')) {
    return (
      'Here are a few everyday habits that support safe medication routines:\n\n' +
      '• Keep a written or digital list of all medicines and supplements you take.\n' +
      '• Store tablets in a cool, dry place away from direct sunlight.\n' +
      '• Use consistent daily anchors (like breakfast or bedtime) to remember doses.\n' +
      '• Always check expiry dates and ask your pharmacist before splitting or crushing tablets.'
    );
  }

  return (
    `Hi ${context.patientName || 'there'}! I'm running in **Demo Companion Mode**.\n\n` +
    'I can help summarize your **verified prescriptions**, read back your **scheduled reminder times**, or explain common prescription terms like **BD**, **TDS**, **AC (Before Food)**, and **mg**.\n\n' +
    'Remember: always consult your doctor or pharmacist for personal medical advice.'
  );
}

/**
 * Calls the secure Supabase Edge Function (`ai-buddy`) backed by Gemini (`gemini-3.8-flash`)
 * when authenticated with Firebase + Supabase.
 * Only uses clearly identified Demo Mode when explicitly running in Sample Demo Patient mode.
 */
export async function sendAiBuddyMessage(
  prompt: string,
  context: PatientContext
): Promise<AIResponse> {
  if (!context.isDemoAccount && isSupabaseConfigured && supabase) {
    const token = await getFirebaseIdToken(false);
    if (!token) {
      throw new Error('Your session expired. Please sign in again to use CareScript AI Buddy.');
    }

    const { data, error } = await supabase.functions.invoke('ai-buddy', {
      body: {
        prompt,
        conversationId: context.conversationId ?? null,
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (error) {
      const friendly = await extractEdgeFunctionError(
        error,
        data,
        'CareScript AI Buddy could not reach the server. Please try again.'
      );
      console.error('[CareScript] ai-buddy invocation error:', error.message);
      throw new Error(friendly);
    }

    const payload = data as { reply?: string; error?: string; conversationId?: string | null } | null;
    if (payload?.error) {
      throw new Error(payload.error);
    }
    if (!payload?.reply) {
      throw new Error('Empty response received from CareScript AI Buddy.');
    }

    return {
      text: payload.reply,
      isDemo: false,
      conversationId: payload.conversationId ?? context.conversationId,
    };
  }

  // Sample Demo Patient Mode (explicitly flagged as Demo Response)
  await new Promise((resolve) => setTimeout(resolve, 350));
  return {
    text: buildSafeDemoReply(prompt, context),
    isDemo: true,
  };
}
