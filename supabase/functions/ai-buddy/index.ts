import { requireAuthenticatedUser, ResponseError } from '../_shared/auth.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getGeminiConfig, runGeminiInteraction } from '../_shared/gemini.ts';

const SYSTEM_INSTRUCTION = `You are CareScript AI Buddy, a friendly, patient-centric educational medication companion.

STRICT MEDICAL SAFETY RULES:
1. You must NEVER diagnose diseases or interpret symptoms as a medical diagnosis.
2. You must NEVER prescribe medications, suggest starting or stopping a medicine, or recommend changing a prescribed dosage.
3. You must NEVER invent prescription instructions, strengths, dosages, or frequencies.
4. Only reference verified/confirmed prescription and medication details provided in the patient's verified context below. If details are missing or unclear, tell the user to check with their doctor or pharmacist.
5. If the user describes severe or emergency symptoms (e.g., chest pain, trouble breathing, severe allergic reaction, overdose, suicidal thoughts), instruct them to seek immediate emergency medical help right away.
6. Explain common medical terms (like OD, BD, TDS, AC/before food, PC/after food, mg/mcg) and general medication safety habits in simple, calm, easy-to-read language suitable for elderly patients.
7. Always remind users to consult a licensed doctor or pharmacist for personal medical advice.`;

function asksAboutPersonalMedication(prompt: string): boolean {
  return /\b(?:my (?:medicine|medicines|medication|medications|prescription|prescriptions|dose|dosage|schedule|medicine list)|am i taking|what am i taking|what (?:medicine|medication|drug|drugs) am i (?:taking|on)|prescribed to me|when (?:should|do) i take (?:my|the))\b/i.test(prompt);
}

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  const logStage = (event: string, fields: Record<string, unknown> = {}) => {
    console.info(JSON.stringify({
      service: 'ai-buddy',
      request_id: requestId,
      event,
      elapsed_ms: Math.round(performance.now() - startedAt),
      ...fields,
    }));
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let stage = 'request_received';
  logStage(stage, { method: req.method });
  try {
    stage = 'authentication_started';
    const { supabase, userId } = await requireAuthenticatedUser(req);
    stage = 'authentication_verified';
    logStage(stage);

    stage = 'configuration_validated';
    getGeminiConfig();

    stage = 'request_validated';
    const body = await req.json().catch(() => null);
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    const requestedConversationId = typeof body?.conversationId === 'string' ? body.conversationId : null;

    if (!prompt || prompt.length > 2000) {
      return jsonResponse({ error: 'Prompt must be between 1 and 2000 characters.' }, 400);
    }
    logStage(stage, { prompt_characters: prompt.length });

    // Fetch user-scoped health records only when the question explicitly asks about personal medication.
    // Generic questions such as "Hi" never transmit profile or health data to Gemini.
    const needsPersonalContext = asksAboutPersonalMedication(prompt);
    let contextInput = 'No patient-specific context was requested for this general question.';
    if (needsPersonalContext) {
      stage = 'user_context_load_started';
      const [profileRes, rxRes, medsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('prescriptions')
          .select('id, prescription_name, doctor_name, prescription_date, prescription_extractions(corrected_data)')
          .eq('user_id', userId)
          .eq('status', 'confirmed')
          .is('deleted_at', null)
          .order('upload_date', { ascending: false })
          .limit(5),
        supabase
          .from('medications')
          .select('medicine_name, strength, dosage, food_instruction, additional_notes, medication_schedules(frequency, scheduled_times, start_date, end_date)')
          .eq('user_id', userId)
          .eq('active', true)
          .limit(20),
      ]);

      if (profileRes.error || rxRes.error || medsRes.error) {
        logStage('user_context_query_failed', {
          profile_status: profileRes.error ? 'error' : 'ok',
          prescription_status: rxRes.error ? 'error' : 'ok',
          medication_status: medsRes.error ? 'error' : 'ok',
        });
        throw new ResponseError(500, 'Unable to load your verified health context. Please retry.');
      }
      logStage('user_context_loaded', {
        confirmed_prescription_count: rxRes.data?.length ?? 0,
        active_medication_count: medsRes.data?.length ?? 0,
      });
      contextInput = JSON.stringify({
        patientFirstName: (profileRes.data?.full_name || 'Patient').split(' ')[0],
        confirmedPrescriptions: rxRes.data ?? [],
        activeMedications: medsRes.data ?? [],
      });
    } else {
      logStage('user_context_skipped', { reason: 'general_question' });
    }

    stage = 'gemini_request_started';
    const { outputText: reply, model } = await runGeminiInteraction({
      systemInstruction: SYSTEM_INSTRUCTION,
      input:
        `${needsPersonalContext ? 'Verified Patient Context (JSON — only confirmed items):' : ''}\n` +
        `${contextInput}\n\n` +
        `Patient Question: ${prompt}`,
      requestId,
      startedAt,
      timeoutMs: 40_000,
    });

    // Validate ownership if conversationId was provided, otherwise create a new conversation
    stage = 'conversation_persistence_started';
    let activeConversationId: string | null = null;
    if (requestedConversationId) {
      const { data: existingConv, error: existingConvError } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', requestedConversationId)
        .eq('user_id', userId)
        .maybeSingle();
      if (existingConvError) {
        logStage('conversation_lookup_failed', { database_code: existingConvError.code });
        throw new ResponseError(500, 'Unable to save this chat. Please retry.');
      }
      activeConversationId = existingConv?.id ?? null;
    }

    if (!activeConversationId) {
      const { data: conv, error: conversationError } = await supabase
        .from('conversations')
        .insert({ user_id: userId })
        .select('id')
        .single();
      if (conversationError) {
        logStage('conversation_create_failed', { database_code: conversationError.code });
        throw new ResponseError(500, 'Unable to save this chat. Please retry.');
      }
      activeConversationId = conv?.id ?? null;
    }

    if (!activeConversationId) {
      throw new ResponseError(500, 'Unable to save this chat. Please retry.');
    }

    {
      const { error: msgErr } = await supabase.from('chat_messages').insert([
        { conversation_id: activeConversationId, role: 'user', content: prompt, is_demo: false },
        { conversation_id: activeConversationId, role: 'assistant', content: reply, is_demo: false },
      ]);
      if (msgErr) {
        logStage('chat_message_insert_failed', { database_code: msgErr.code });
        throw new ResponseError(500, 'Unable to save this chat. Please retry.');
      }
    }
    logStage('chat_messages_persisted');

    stage = 'response_returned';
    logStage(stage, { status: 200, model, response_characters: reply.length });
    return jsonResponse({
      reply,
      conversationId: activeConversationId,
      model,
    });
  } catch (err) {
    const status = err instanceof ResponseError ? err.status : 500;
    logStage('request_failed', {
      stage,
      status,
      error_name: err instanceof Error ? err.name : 'UnknownError',
    });
    if (err instanceof ResponseError) {
      return jsonResponse({ error: err.message }, err.status);
    }
    // Avoid logging raw exceptions; upstream errors may contain prompt or credential data.
    return jsonResponse({ error: 'Unable to complete AI request right now. Please try again.' }, 500);
  }
});
