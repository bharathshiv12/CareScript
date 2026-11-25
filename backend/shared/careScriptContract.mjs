export const CARESCRIPT_CONTRACT = {
  authProvider: 'supabase',
  prescriptionUpload: {
    bucketName: 'prescriptions',
    maxBytes: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.pdf'],
  },
  ai: {
    defaultGeminiModel: 'gemini-3.8-flash',
    maxPromptLength: 2000,
    requestTimeoutMs: 25_000,
  },
  doses: {
    missedGraceMinutes: 30,
  },
};
