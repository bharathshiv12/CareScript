import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';
import { GoogleGenAI } from 'npm:@google/genai@^2.29.1';
import { requireAuthenticatedUser, ResponseError } from '../_shared/auth.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash';

const EXTRACTION_SYSTEM_INSTRUCTION = `You are a medical prescription transcription assistant.
STRICT MEDICAL SAFETY RULES:
1. NEVER guess a medicine name, strength, dosage, frequency, timing, duration, or food instruction.
2. NEVER invent or infer missing prescription information.
3. If any field is illegible, smudged, cut off, or ambiguous, set its field_status to "unclear" or "needs_verification" and set its text value to "" (empty string) or clearly indicate ambiguity — NEVER fabricate plausible values.
4. Only transcribe what is clearly legible on the uploaded document.
5. Output strictly valid JSON conforming to the provided schema.`;

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    doctor_name: { type: 'string', description: 'Doctor or clinic name if legible, else empty string.' },
    prescription_date: { type: 'string', description: 'Date printed on prescription if legible, else empty string.' },
    medicines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          name_status: { type: 'string', enum: ['readable', 'unclear', 'missing', 'needs_verification'] },
          strength: { type: 'string' },
          strength_status: { type: 'string', enum: ['readable', 'unclear', 'missing', 'needs_verification'] },
          dosage: { type: 'string' },
          dosage_status: { type: 'string', enum: ['readable', 'unclear', 'missing', 'needs_verification'] },
          frequency: { type: 'string' },
          frequency_status: { type: 'string', enum: ['readable', 'unclear', 'missing', 'needs_verification'] },
          timing: { type: 'string', description: 'Comma-separated 24h HH:mm times ONLY if explicitly indicated, else empty string.' },
          duration: { type: 'string' },
          food_instruction: {
            type: 'string',
            enum: ['before_food', 'after_food', 'with_food', 'no_instruction', 'unclear'],
          },
          notes: { type: 'string' },
        },
        required: [
          'name',
          'name_status',
          'strength',
          'strength_status',
          'dosage',
          'dosage_status',
          'frequency',
          'frequency_status',
          'timing',
          'duration',
          'food_instruction',
          'notes',
        ],
      },
    },
  },
  required: ['doctor_name', 'prescription_date', 'medicines'],
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let rxId: string | null = null;
  let scopedSupabase: Awaited<ReturnType<typeof requireAuthenticatedUser>>['supabase'] | null = null;

  try {
    const { supabase } = await requireAuthenticatedUser(req);
    scopedSupabase = supabase;

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return jsonResponse({ error: 'Prescription extraction AI service is not configured.' }, 503);
    }

    const body = await req.json().catch(() => null);
    rxId = typeof body?.prescriptionId === 'string' ? body.prescriptionId : null;
    if (!rxId) {
      return jsonResponse({ error: 'prescriptionId is required.' }, 400);
    }

    // Fetch prescription under RLS (automatically enforces ownership)
    const { data: rx, error: rxErr } = await supabase
      .from('prescriptions')
      .select('id, storage_path, file_type, status, deleted_at')
      .eq('id', rxId)
      .is('deleted_at', null)
      .maybeSingle();

    if (rxErr || !rx) {
      return jsonResponse({ error: 'Prescription not found or access denied.' }, 404);
    }

    await supabase.from('prescriptions').update({ status: 'processing' }).eq('id', rx.id);
    await supabase.from('prescription_extractions').upsert(
      {
        prescription_id: rx.id,
        extraction_provider: GEMINI_MODEL,
        extraction_status: 'processing',
      },
      { onConflict: 'prescription_id' }
    );

    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from('prescriptions')
      .download(rx.storage_path);

    if (dlErr || !fileBlob) {
      throw new Error('Could not retrieve private prescription file for extraction');
    }

    const bytes = new Uint8Array(await fileBlob.arrayBuffer());
    const base64Data = encodeBase64(bytes);
    const isPdf = rx.file_type === 'application/pdf';

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const interaction = await ai.interactions.create({
      model: GEMINI_MODEL,
      store: false,
      system_instruction: EXTRACTION_SYSTEM_INSTRUCTION,
      input: [
        {
          type: 'text',
          text: 'Transcribe only clearly legible prescription details into the JSON schema. Flag anything unreadable as unclear or needs_verification without guessing.',
        },
        {
          type: isPdf ? 'document' : 'image',
          data: base64Data,
          mime_type: rx.file_type === 'image/jpg' ? 'image/jpeg' : rx.file_type,
        },
      ],
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: EXTRACTION_SCHEMA,
      },
    });

    const rawText = interaction.output_text;
    if (!rawText) {
      throw new Error('Extraction model returned empty output');
    }

    const parsed = JSON.parse(rawText) as {
      doctor_name?: string;
      prescription_date?: string;
      medicines?: Array<Record<string, string>>;
    };

    const normalizedMedicines = (Array.isArray(parsed.medicines) ? parsed.medicines : []).map((m, idx) => {
      const unclearFields: string[] = [];
      if (m.name_status !== 'readable' || !m.name?.trim()) unclearFields.push('name');
      if (m.strength_status !== 'readable' || !m.strength?.trim()) unclearFields.push('strength');
      if (m.dosage_status !== 'readable' || !m.dosage?.trim()) unclearFields.push('dosage');
      if (m.frequency_status !== 'readable' || !m.frequency?.trim()) unclearFields.push('frequency');
      if (m.food_instruction === 'unclear') unclearFields.push('foodInstruction');

      return {
        id: `ext-${idx + 1}-${Date.now()}`,
        name: m.name ?? '',
        strength: m.strength ?? '',
        dosage: m.dosage ?? '',
        frequency: m.frequency ?? '',
        timing: m.timing ?? '',
        duration: m.duration ?? '',
        foodInstruction: m.food_instruction ?? 'unclear',
        unclearFields,
        notes: m.notes ?? '',
      };
    });

    await supabase
      .from('prescription_extractions')
      .upsert(
        {
          prescription_id: rx.id,
          extracted_data: normalizedMedicines,
          extraction_provider: GEMINI_MODEL,
          extraction_status: 'review_required',
        },
        { onConflict: 'prescription_id' }
      );

    await supabase
      .from('prescriptions')
      .update({
        status: 'review_required',
        doctor_name: parsed.doctor_name?.trim() || null,
      })
      .eq('id', rx.id);

    return jsonResponse({
      prescriptionId: rx.id,
      status: 'review_required',
      doctorName: parsed.doctor_name ?? '',
      prescriptionDate: parsed.prescription_date ?? '',
      medicines: normalizedMedicines,
    });
  } catch (err) {
    if (err instanceof ResponseError) {
      return jsonResponse({ error: err.message }, err.status);
    }
    if (scopedSupabase && rxId) {
      await scopedSupabase.from('prescriptions').update({ status: 'failed' }).eq('id', rxId);
      await scopedSupabase
        .from('prescription_extractions')
        .update({ extraction_status: 'failed' })
        .eq('prescription_id', rxId);
    }
    console.error('extract-prescription error:', err instanceof Error ? err.message : 'Unknown error');
    return jsonResponse({ error: 'Prescription extraction failed. Please review and enter details manually.' }, 500);
  }
});
