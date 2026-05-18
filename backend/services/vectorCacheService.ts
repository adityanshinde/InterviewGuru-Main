import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { primeStaticQuestionsIntoCache, loadStaticQuestions } from './staticQuestionCache';

const serviceDir =
  typeof import.meta.url === 'string' && import.meta.url.startsWith('file:')
    ? path.dirname(fileURLToPath(import.meta.url))
    : typeof __dirname !== 'undefined'
      ? __dirname
      : path.join(process.cwd(), 'backend', 'services');
const REPO_ROOT = path.join(serviceDir, '..', '..');

let vectorCache: any[] = [];
const CACHE_FILE = path.join(os.tmpdir(), 'interviewguru_cache.json');
let extractor: unknown = null;
let staticPrimePromise: Promise<number> | null = null;

function truthyEnv(v: string | undefined): boolean {
  const t = v?.trim().toLowerCase();
  return t === 'true' || t === '1' || t === 'yes';
}

export function vectorCacheLookupEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return true;
  return truthyEnv(process.env.ANALYZE_VECTOR_CACHE);
}

export function loadVectorCacheFromDisk(): void {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      vectorCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      console.log(`[Cache] Loaded ${vectorCache.length} cached answers from disk.`);
    }
  } catch {
    console.log('[Cache] No cache found or malformed.');
    vectorCache = [];
  }
}

export function getVectorCache(): any[] {
  return vectorCache;
}

export function setVectorCache(entries: any[]): void {
  vectorCache = entries;
  fs.writeFileSync(CACHE_FILE, JSON.stringify(vectorCache));
}

export function pushVectorCacheEntry(entry: unknown): void {
  vectorCache.push(entry);
}

export function clearVectorCache(): void {
  vectorCache = [];
}

export async function createEmbedding(text: string): Promise<number[]> {
  if (!extractor) {
    const { pipeline, env } = await import('@xenova/transformers');
    (env as { allowLocalModels: boolean }).allowLocalModels = false;
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const output = await (extractor as (t: string, o: object) => Promise<{ data: Float32Array | number[] }>)(
    text,
    { pooling: 'mean', normalize: true }
  );
  return Array.from(output.data as ArrayLike<number>) as number[];
}

function cosineSimilarity(a: number[], b: number[]) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export type VectorCacheHit = {
  question: string;
  answer: Record<string, unknown>;
  score: number;
};

/**
 * Semantic cache lookup. Returns null on miss or when cache is disabled/empty.
 */
/** Load commonInterviewQuestions.json + questions_dsa.json into vector cache (background). */
export function startStaticQuestionPriming(): Promise<number> {
  if (!staticPrimePromise) {
    const staticCount = loadStaticQuestions(REPO_ROOT).length;
    console.log(`[Cache] Static question bank: ${staticCount} entries to prime`);
    staticPrimePromise = primeStaticQuestionsIntoCache(vectorCache, createEmbedding, {
      cacheFile: CACHE_FILE,
      repoRoot: REPO_ROOT,
    })
      .then((added) => {
        if (added > 0) {
          console.log(`[Cache] Primed ${added} static interview questions (total cache: ${vectorCache.length})`);
        }
        return added;
      })
      .catch((err) => {
        console.error('[Cache] Static question priming failed:', err);
        return 0;
      });
  }
  return staticPrimePromise;
}

export async function lookupVectorCache(
  transcript: string,
  _mode: 'voice' | 'chat' = 'voice'
): Promise<VectorCacheHit | null> {
  if (!vectorCacheLookupEnabled()) {
    return null;
  }

  // Non-blocking: priming continues in background; partial cache still helps.
  void startStaticQuestionPriming();

  if (vectorCache.length === 0) {
    return null;
  }

  const emb = await createEmbedding(transcript);
  const topMatches: { item: (typeof vectorCache)[0]; score: number }[] = [];

  for (const item of vectorCache) {
    if (item.embeddingModel && item.embeddingModel !== 'all-MiniLM-L6-v2') continue;

    let maxScore = cosineSimilarity(emb, item.embedding);

    if (item.variantEmbeddings && Array.isArray(item.variantEmbeddings)) {
      for (const varEmb of item.variantEmbeddings) {
        const varScore = cosineSimilarity(emb, varEmb);
        if (varScore > maxScore) maxScore = varScore;
      }
    }

    topMatches.push({ item, score: maxScore });
  }

  topMatches.sort((a, b) => b.score - a.score);
  const best = topMatches[0];
  if (!best || best.score <= 0.82) return null;

  console.log(`[Cache HIT] Score: ${best.score.toFixed(2)} | Q: ${String(best.item.question).substring(0, 40)}`);
  return {
    question: best.item.question,
    answer: best.item.answer,
    score: best.score,
  };
}

loadVectorCacheFromDisk();
void startStaticQuestionPriming();
