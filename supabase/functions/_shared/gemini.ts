import { ResponseError } from './auth.ts';

const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
const FALLBACK_GEMINI_MODEL = 'gemini-3.6-flash';
const DEFAULT_TIMEOUT_MS = 40_000;
const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

export function getGeminiConfig(): { apiKey: string; model: string } {
  const apiKey = (Deno.env.get('GEMINI_API_KEY') ?? '').trim();
  if (!apiKey) {
    throw new ResponseError(503, 'Gemini API key is not configured on the server.');
  }
  const model = (Deno.env.get('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL).trim();
  if (!model) {
    throw new ResponseError(422, 'Configured GEMINI_MODEL value cannot be empty.');
  }
  return { apiKey, model };
}

function classifyGeminiStatus(status: number, model: string): ResponseError {
  if (status === 401 || status === 403) {
    return new ResponseError(502, 'Gemini API key authentication failed on the backend. Verify GEMINI_API_KEY.');
  }
  if (status === 404) {
    return new ResponseError(422, `Configured Gemini model (${model}) is invalid or unavailable.`);
  }
  if (status === 429) {
    return new ResponseError(429, 'Gemini AI rate limit reached. Please wait a moment and retry.');
  }
  if (status === 503) {
    return new ResponseError(503, 'Gemini is temporarily overloaded. Please wait a moment and retry.');
  }
  if (status === 408 || status === 504) {
    return new ResponseError(504, 'Gemini AI request timed out. Please try again.');
  }
  return new ResponseError(502, 'Gemini AI service returned an error. Please try again.');
}

function extractOutputText(interaction: unknown): string {
  if (!interaction || typeof interaction !== 'object') return '';
  const result = interaction as {
    output_text?: unknown;
    status?: unknown;
    steps?: Array<{ type?: unknown; content?: Array<{ type?: unknown; text?: unknown }> }>;
  };

  if (typeof result.output_text === 'string' && result.output_text.trim()) {
    return result.output_text.trim();
  }

  if (result.status && result.status !== 'completed') return '';
  return (result.steps ?? [])
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('')
    .trim();
}

export async function runGeminiInteraction(params: {
  systemInstruction: string;
  input: unknown;
  responseFormat?: Record<string, unknown>;
  timeoutMs?: number;
  requestId?: string;
  startedAt?: number;
}): Promise<{ outputText: string; model: string }> {
  const { apiKey, model } = getGeminiConfig();
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = params.startedAt ?? performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const logStage = (event: string, fields: Record<string, unknown> = {}) => {
    console.info(JSON.stringify({
      service: 'ai-buddy',
      request_id: params.requestId,
      event,
      elapsed_ms: Math.round(performance.now() - startedAt),
      ...fields,
    }));
  };

  logStage('gemini_request_started', { model, timeout_ms: timeoutMs });

  try {
    let response: Response | undefined;
    let responseModel = model;
    const requestModels = model === FALLBACK_GEMINI_MODEL
      ? [model]
      : [model, model, FALLBACK_GEMINI_MODEL];

    for (let requestIndex = 0; requestIndex < requestModels.length; requestIndex += 1) {
      const requestModel = requestModels[requestIndex];
      const attempt = requestIndex === 1 ? 2 : 1;
      if (requestIndex === 1) {
        logStage('gemini_transient_retry', { model: requestModel, attempt });
        await new Promise((resolve) => setTimeout(resolve, 500));
      } else if (requestIndex === 2) {
        logStage('gemini_model_fallback', { from_model: model, to_model: requestModel });
      }

      const requestBody = JSON.stringify({
        model: requestModel,
        store: false,
        system_instruction: params.systemInstruction,
        input: params.input,
        generation_config: {
          thinking_level: 'low',
          max_output_tokens: 2048,
        },
        ...(params.responseFormat ? { response_format: params.responseFormat } : {}),
      });

      response = await fetch(GEMINI_INTERACTIONS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: requestBody,
        signal: controller.signal,
      });

      logStage('gemini_response_received', { status: response.status, model: requestModel, attempt });
      if (response.ok) {
        responseModel = requestModel;
        break;
      }

      const providerError = await response.json().catch(() => null) as {
        error?: { status?: unknown; code?: unknown };
      } | null;
      const providerStatus = providerError?.error?.status;
      const safeProviderStatus = typeof providerStatus === 'string' &&
        ['UNAVAILABLE', 'RESOURCE_EXHAUSTED', 'INVALID_ARGUMENT', 'PERMISSION_DENIED', 'NOT_FOUND'].includes(providerStatus)
        ? providerStatus
        : undefined;

      // 503 is a temporary overload. Retry the primary once, then make one verified model fallback.
      if (response.status === 503 && requestIndex < requestModels.length - 1 && !controller.signal.aborted) {
        logStage('gemini_temporary_unavailable', {
          status: response.status,
          provider_status: safeProviderStatus,
          model: requestModel,
          attempt,
          next_model: requestModels[requestIndex + 1],
        });
        continue;
      }

      logStage('gemini_response_rejected', {
        status: response.status,
        provider_status: safeProviderStatus,
        model: requestModel,
        attempt,
      });
      throw classifyGeminiStatus(response.status, requestModel);
    }

    if (!response?.ok) throw new ResponseError(502, 'Gemini AI service returned an error. Please try again.');
    const interaction = await response.json().catch(() => null);
    const outputText = extractOutputText(interaction);
    if (!outputText) {
      const status = interaction && typeof interaction === 'object'
        ? (interaction as { status?: unknown }).status
        : undefined;
      logStage('gemini_response_empty', {
        interaction_status: typeof status === 'string' ? status : 'invalid_json',
      });
      throw new ResponseError(502, 'Empty response received from Gemini AI.');
    }

    logStage('gemini_response_parsed', { output_characters: outputText.length });
    return { outputText, model: responseModel };
  } catch (err) {
    if (err instanceof ResponseError) throw err;
    if (controller.signal.aborted) {
      logStage('gemini_request_timeout', { timeout_ms: timeoutMs });
      throw new ResponseError(504, 'Gemini AI request timed out. Please try again.');
    }
    logStage('gemini_transport_error', {
      error_name: err instanceof Error ? err.name : 'UnknownError',
    });
    throw new ResponseError(502, 'Unable to connect to the Gemini AI service. Please try again.');
  } finally {
    clearTimeout(timer);
  }
}
