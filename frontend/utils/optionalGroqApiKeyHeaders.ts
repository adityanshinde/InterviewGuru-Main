function truthyVite(v: string | boolean | undefined): boolean {
  if (typeof v === 'boolean') return v;
  const t = v?.trim?.().toLowerCase();
  return t === 'true' || t === '1' || t === 'yes';
}

/** In dev, always allow sending the user key when set. In prod, only when VITE_BYOK is enabled (BYOK launch). */
function shouldSendClientGroqKey(): boolean {
  if (!import.meta.env.PROD) return true;
  return truthyVite(import.meta.env.VITE_BYOK);
}

/**
 * Sends `x-api-key` from localStorage (`groq_api_key`) when allowed.
 * Production requires `VITE_BYOK=true` at build time so keys are not sent unless you ship a BYOK product.
 */
export function optionalGroqApiKeyHeaders(): Record<string, string> {
  if (!shouldSendClientGroqKey()) return {};
  try {
    const k = localStorage.getItem('groq_api_key')?.trim();
    return k ? { 'x-api-key': k } : {};
  } catch {
    return {};
  }
}
