import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';
import { requireAuthenticatedUser, ResponseError } from '../_shared/auth.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getGeminiConfig, runGeminiInteraction } from '../_shared/gemini.ts';

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

    getGeminiConfig();

    const body = await req.json().catch(() => null);
    rxId = typeof body?.prescriptionId === 'string' ? body.prescriptionId : null;
    if (!rxId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rxId)) {
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

    const allowedMimeTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']);
    if (!allowedMimeTypes.has(rx.file_type)) {
      throw new ResponseError(415, 'This prescription file type is not supported for extraction.');
    }

    const { error: processingError } = await supabase
      .from('prescriptions')
      .update({ status: 'processing' })
      .eq('id', rx.id);
    if (processingError) throw new ResponseError(500, 'Unable to start prescription extraction. Please retry.');

    const { error: extractionStartError } = await supabase.from('prescription_extractions').upsert(
      {
        prescription_id: rx.id,
        extraction_provider: 'gemini',
        extraction_status: 'processing',
      },
      { onConflict: 'prescription_id' }
    );
    if (extractionStartError) throw new ResponseError(500, 'Unable to start prescription extraction. Please retry.');

    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from('prescriptions')
      .download(rx.storage_path);

    if (dlErr || !fileBlob) {
      throw new ResponseError(404, 'Could not retrieve private prescription file for extraction.');
    }
    if (fileBlob.size <= 0 || fileBlob.size > 10 * 1024 * 1024) {
      throw new ResponseError(413, 'Prescription file must be no larger than 10 MB.');
    }

    const bytes = new Uint8Array(await fileBlob.arrayBuffer());
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
    if (
      (rx.file_type === 'application/pdf' && !isPdf) ||
      (rx.file_type === 'image/png' && !isPng) ||
      ((rx.file_type === 'image/jpeg' || rx.file_type === 'image/jpg') && !isJpeg)
    ) {
      throw new ResponseError(415, 'Prescription file contents do not match the recorded file type.');
    }
    const base64Data = encodeBase64(bytes);
    const isPdfFile = rx.file_type === 'application/pdf';

    const { outputText, model } = await runGeminiInteraction({
      systemInstruction: EXTRACTION_SYSTEM_INSTRUCTION,
      input: [
        {
          type: 'text',
          text: 'Transcribe only clearly legible prescription details into the JSON schema. Flag anything unreadable as unclear or needs_verification without guessing.',
        },
        {
          type: isPdfFile ? 'document' : 'image',
          data: base64Data,
          mime_type: rx.file_type === 'image/jpg' ? 'image/jpeg' : rx.file_type,
        },
      ],
      responseFormat: {
        type: 'text',
        mime_type: 'application/json',
        schema: EXTRACTION_SCHEMA,
      },
      timeoutMs: 30_000,
    });

    const parsed = JSON.parse(outputText) as {
      doctor_name?: string;
      prescription_date?: string;
      medicines?: Array<Record<string, string>>;
    };
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.medicines) || parsed.medicines.length > 100) {
      throw new ResponseError(502, 'Gemini returned an invalid prescription extraction. Please retry or enter details manually.');
    }

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

    const { error: extractionSaveError } = await supabase
      .from('prescription_extractions')
      .upsert(
        {
          prescription_id: rx.id,
          extracted_data: normalizedMedicines,
          extraction_provider: model,
          extraction_status: 'review_required',
        },
        { onConflict: 'prescription_id' }
      );
    if (extractionSaveError) throw new ResponseError(500, 'Unable to save prescription extraction. Please retry.');

    const { error: prescriptionSaveError } = await supabase
      .from('prescriptions')
      .update({
        status: 'review_required',
        doctor_name: parsed.doctor_name?.trim() || null,
      })
      .eq('id', rx.id);
    if (prescriptionSaveError) throw new ResponseError(500, 'Unable to save prescription review status. Please retry.');

    return jsonResponse({
      prescriptionId: rx.id,
      status: 'review_required',
      doctorName: parsed.doctor_name ?? '',
      prescriptionDate: parsed.prescription_date ?? '',
      medicines: normalizedMedicines,
      model,
    });
  } catch (err) {
    // Preserve uploaded storage file and leave record reviewable/retryable
    if (scopedSupabase && rxId) {
      await scopedSupabase.from('prescriptions').update({ status: 'review_required' }).eq('id', rxId);
      await scopedSupabase
        .from('prescription_extractions')
        .update({ extraction_status: 'failed' })
        .eq('prescription_id', rxId);
    }

    if (err instanceof ResponseError) {
      return jsonResponse({ error: err.message }, err.status);
    }
    console.error('extract-prescription error:', JSON.stringify({
      error_name: err instanceof Error ? err.name : 'UnknownError',
      status: err instanceof ResponseError ? err.status : 500,
    }));
    return jsonResponse({ error: 'Prescription extraction failed. You can retry extraction or enter details manually.' }, 500);
  }
});
