import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export interface StaticQuestionAnswer {
  type: 'concept' | 'coding' | 'system_design' | 'behavioral';
  difficulty: 'easy' | 'medium' | 'hard';
  spoken: string;
  bullets: string[];
  sections: Array<{ title: string; content: string; points: string[] }>;
  code?: string;
  codeLanguage?: string;
}

export interface StaticQuestionEntry {
  id: string;
  category: string;
  question: string;
  variants: string[];
  answer: StaticQuestionAnswer;
}

export interface VectorCacheItem {
  id: string;
  question: string;
  category?: string;
  embeddingModel: string;
  embedding: number[];
  variants: string[];
  variantEmbeddings: number[][];
  answer: StaticQuestionAnswer;
  source?: string;
}

/** DSA file first so richer answers win when question text overlaps. */
const STATIC_DATA_FILES = [
  'questions_dsa.json',
  'commonInterviewQuestions.json',
] as const;

function resolveRepoRoot(fromDir: string): string {
  return path.join(fromDir, '..', '..');
}

/** Load and dedupe static Q&A JSON files from shared/data. */
export function loadStaticQuestions(repoRoot: string): StaticQuestionEntry[] {
  const dataDir = path.join(repoRoot, 'shared', 'data');
  const byId = new Map<string, StaticQuestionEntry>();

  for (const file of STATIC_DATA_FILES) {
    const filePath = path.join(dataDir, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`[Cache] Static questions file missing: ${file}`);
      continue;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (!Array.isArray(raw)) continue;
      for (const entry of raw) {
        if (!entry?.id || !entry?.question || !entry?.answer) continue;
        if (!byId.has(entry.id)) {
          byId.set(entry.id, entry as StaticQuestionEntry);
        }
      }
    } catch (err) {
      console.warn(`[Cache] Failed to parse ${file}:`, err);
    }
  }

  return Array.from(byId.values());
}

/**
 * Embed static questions and merge into the in-memory vector cache.
 * Skips entries already present (by id or normalized question text).
 */
export async function primeStaticQuestionsIntoCache(
  vectorCache: VectorCacheItem[],
  getEmbedding: (text: string) => Promise<number[]>,
  options?: { cacheFile?: string; repoRoot?: string; fromDir?: string }
): Promise<number> {
  const fromDir = options?.fromDir ?? path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = options?.repoRoot ?? resolveRepoRoot(fromDir);
  const staticQuestions = loadStaticQuestions(repoRoot);

  if (staticQuestions.length === 0) return 0;

  const existingIds = new Set(
    vectorCache.map((item) => item.id).filter((id): id is string => Boolean(id))
  );
  const existingQuestions = new Set(
    vectorCache
      .map((item) => item.question?.trim().toLowerCase())
      .filter((q): q is string => Boolean(q))
  );

  let added = 0;

  for (const entry of staticQuestions) {
    if (existingIds.has(entry.id)) continue;
    const normalizedQ = entry.question.trim().toLowerCase();
    if (existingQuestions.has(normalizedQ)) continue;

    const variants = Array.isArray(entry.variants)
      ? entry.variants.filter((v) => typeof v === 'string' && v.trim().length > 5)
      : [];

    const variantEmbeddings: number[][] = [];
    for (const variant of variants) {
      variantEmbeddings.push(await getEmbedding(variant));
    }

    const embedding = await getEmbedding(entry.question);

    vectorCache.push({
      id: entry.id,
      question: entry.question,
      category: entry.category,
      embeddingModel: 'all-MiniLM-L6-v2',
      embedding,
      variants,
      variantEmbeddings,
      answer: entry.answer,
      source: 'static',
    });

    existingIds.add(entry.id);
    existingQuestions.add(normalizedQ);
    added++;

    if (added % 25 === 0) {
      console.log(`[Cache] Static priming progress: ${added}/${staticQuestions.length}`);
    }
  }

  if (added > 0 && options?.cacheFile) {
    fs.writeFileSync(options.cacheFile, JSON.stringify(vectorCache));
  }

  return added;
}
