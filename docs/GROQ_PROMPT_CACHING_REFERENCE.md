# Groq Prompt Caching Reference

Last updated: 2026-04-06

This file consolidates official Groq prompt-caching information into one place for quick implementation and troubleshooting.

## Official Sources

- [Groq Docs - Prompt Caching](https://console.groq.com/docs/prompt-caching)
- [Groq Blog - Introducing Prompt Caching on GroqCloud](https://wow.groq.com/blog/introducing-prompt-caching-on-groqcloud)
- [Groq Blog - GPT-OSS Improvements: Prompt Caching + Lower Pricing](https://wow.groq.com/blog/gpt-oss-improvements-prompt-caching-and-lower-pricing)

## What Prompt Caching Is

Prompt caching reuses compute for repeated prompt prefixes. If two requests start with the same exact token prefix, Groq can serve that prefix from cache.

Key outcomes:

- Lower latency on cache hits
- 50% discount on cached input tokens
- No code changes required to enable
- No extra fee for the feature itself

## How It Works

1. Prefix matching runs against recently processed prompts.
2. If a prefix matches exactly, cached computation is reused.
3. If no match, request runs normally and may become cacheable for later requests.
4. Cache data expires automatically after inactivity.

Important details from docs/blog:

- Exact match is required for the cacheable prefix.
- Matching is only up to the first difference.
- Cache is volatile-memory based and auto-expires (docs mention about a few hours / 2 hours without use).

## Supported Models (as documented)

From Groq docs page:

- `openai/gpt-oss-20b`
- `openai/gpt-oss-120b`
- `openai/gpt-oss-safeguard-20b`

Blog posts also mention rollout starting with `moonshotai/kimi-k2-instruct` and then expanding. Always verify current support on model pages before production assumptions.

## Pricing and Rate-Limit Behavior

- Cached input tokens: 50% discounted compared to uncached input tokens.
- Output tokens: normal model pricing.
- No additional prompt-caching service fee.
- Cached tokens do not count toward rate limits (docs/blog note this behavior).
- For batch requests: caching can function, but discount does not stack with batch discount.

## Prompt Structure Rules (Most Important)

To maximize cache hits:

- Put static content first:
  - system instructions
  - tool definitions and schemas
  - few-shot examples
  - shared context
- Put dynamic content last:
  - user-specific questions
  - timestamps/session IDs
  - request-unique fields

If dynamic content appears early, later static sections cannot be reused as prefix cache.

## What Can Be Cached

As documented, cacheable prefix content can include:

- message arrays (system/user/assistant)
- tool definitions and function schemas
- structured output schemas
- large static context (docs, legal text, etc.)
- image inputs (URLs/base64), if request shape stays consistent

## Requirements and Limitations

- Exact prefix match only
- Minimum cacheable prompt length is model-dependent (docs mention roughly 128-1024 tokens depending on model)
- No manual cache control (no manual clear/refresh APIs)
- Cache hits are best-effort, not guaranteed
- Changes in cached sections invalidate previous cache lineage
- Keep `tool_choice`, tool usage pattern, and image usage consistent to avoid invalidating cache

## Tracking Cache Usage in API Responses

Inspect usage fields in responses:

- `usage.prompt_tokens`
- `usage.prompt_tokens_details.cached_tokens`
- `usage.completion_tokens`
- `usage.total_tokens`

Cache hit rate formula:

`cached_tokens / prompt_tokens * 100`

Example interpretation:

- high `cached_tokens` relative to `prompt_tokens` means good prefix reuse
- `cached_tokens = 0` means no hit (or below minimum cacheable threshold)

## Troubleshooting Checklist

If you expected a cache hit but got miss/low cached tokens:

1. Compare first differing token between requests (usually hidden dynamic fields).
2. Ensure static sections are byte/token-stable across calls.
3. Keep requests within cache lifetime window.
4. Keep tools/tool_choice/image layout consistent.
5. Confirm prompt length crosses model's minimum cacheable threshold.
6. Verify model supports prompt caching.
7. Validate in response usage fields (`cached_tokens`) instead of assuming.

## Privacy / Security Notes

From docs FAQ:

- Cache storage is volatile memory and auto-expires.
- Prompt/response content is not stored in persistent cache storage for prompt-caching function.
- Cache is not manually managed by customers.

## Practical Implementation Pattern

Use a stable "template prefix" and append dynamic tail:

1. System role + fixed policies
2. Fixed tool schema and output schema
3. Optional fixed examples
4. Dynamic user query and session-specific fields at the end

For multi-turn chat:

- Keep the reusable scaffold stable
- Avoid adding random IDs/timestamps near the top of the message list

## Notes for This Repo

For InterviewGuru-like flows, biggest cache wins are typically from:

- stable system prompts (`buildChatSystemPrompt` output if not overly dynamic)
- stable tool definitions (if enabled)
- stable schema/instruction blocks

To improve hit rate:

- isolate truly dynamic fields (resume snippets, jd snippets, user question) to later prompt sections
- avoid injecting changing metadata into top prompt lines
- monitor `cached_tokens` in logs for real verification

## How to Use This in InterviewGuru

### Recommended integration plan

1. Keep your static prompt prefix stable:
   - core interviewer instructions
   - output schema / JSON rules
   - reusable examples
2. Move dynamic fields to the end:
   - live user question
   - short resume/JD snippets (only when needed)
   - per-request variables
3. Prefer cache-supported models for flows where caching matters (verify current model support in Groq docs before switching).
4. Add cache observability in backend logs from Groq response usage:
   - `usage.prompt_tokens`
   - `usage.prompt_tokens_details.cached_tokens`
5. Track a simple metric in logs/dashboard:
   - cache hit rate = `cached_tokens / prompt_tokens`
6. Roll out safely with a feature flag:
   - start with chat mode only
   - compare p50/p95 latency and token cost before and after

### Where to apply first in this repo

- `backend/api/server.ts` chat flow (`/api/analyze` and `/api/analyze/stream`)
- Prompt builders in `shared/prompts` (keep static top section deterministic)
- Optional: any future tool-enabled flows with stable tool schemas

### Practical tips for this codebase

- Keep persona templates deterministic; avoid random/non-deterministic text in top prompt lines.
- Do not inject timestamps or request IDs in system prompt prefixes.
- If resume/JD changes frequently, append them later in prompt or trim to stable sections.
- Measure with real traffic; do not assume cache effectiveness without `cached_tokens`.

## Pros and Cons for This Project

### Pros

- Lower average cost on repeated prompt prefixes (up to 50% discount on cached input tokens).
- Better latency for repeat-style interview questions and multi-turn chats.
- No new API shape required; works with existing Groq calls.
- Strong fit for stable system instructions and repeated schema/tool definitions.

### Cons

- Exact-prefix requirement is strict; small prompt differences can kill cache hits.
- Dynamic-heavy prompts (frequently changing resume/JD/session metadata) reduce benefit.
- Cache lifetime is limited; misses increase if requests are far apart.
- Not all models support prompt caching; model choice constraints may apply.
- Can add implementation effort for prompt refactoring and telemetry to prove real gains.

### Decision guidance

Adopt prompt caching for chat paths where prompt prefixes are mostly stable and repeated. Keep a fallback model/path, measure `cached_tokens`, and only optimize further after seeing real hit rates and latency improvement in production logs.

