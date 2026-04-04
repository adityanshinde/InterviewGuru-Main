/**
 * Production builds use server-side GROQ_API_KEY only; never send a user key from the browser.
 * Dev builds may send `x-api-key` from localStorage when set.
 */
export function optionalGroqApiKeyHeaders(): Record<string, string> {
  if (import.meta.env.PROD) return {};
  try {
    const k = localStorage.getItem('groq_api_key')?.trim();
    return k ? { 'x-api-key': k } : {};
  } catch {
    return {};
  }
}
