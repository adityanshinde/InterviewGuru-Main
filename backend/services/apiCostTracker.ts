import { getPool, isDBConnected } from './database';
import {
	PLAN_LIMITS,
	GROQ_PRICING,
	PlanTier,
	estimateTranscriptionCost,
	estimateLLMCost,
} from '../../shared/constants/planLimits';

export interface ApiUsageRecord {
	userId: string;
	requestType: 'transcription' | 'llm_8b' | 'llm_70b' | 'tts';
	inputTokens?: number;
	outputTokens?: number;
	audioMinutes?: number;
	costUSD: number;
	model: string;
	sessionId?: string;
}

interface UserSpending {
	currentMonthSpendUSD: number;
	maxSpendUSD: number;
	remainingBudgetUSD: number;
	percentUsed: number;
}

const inMemorySpending = new Map<string, number>();

function getCurrentMonth(): string {
	return new Date().toISOString().slice(0, 7);
}

/**
 * Get user's current API spending for the billing month
 */
export async function getUserSpending(userId: string, plan: PlanTier): Promise<UserSpending> {
	const maxSpend = PLAN_LIMITS[plan].maxApiSpendUSD;
	let currentSpend = 0;

	if (isDBConnected()) {
		const pool = getPool()!;
		const month = getCurrentMonth();

		const { rows } = await pool.query(
			`SELECT COALESCE(SUM(cost_usd), 0)::numeric as total_spend
			 FROM ig_api_usage
			 WHERE clerk_user_id = $1 AND billing_month = $2`,
			[userId, month]
		);

		currentSpend = parseFloat(rows[0]?.total_spend || '0');
	} else {
		currentSpend = inMemorySpending.get(userId) || 0;
	}

	return {
		currentMonthSpendUSD: Math.round(currentSpend * 10000) / 10000,
		maxSpendUSD: maxSpend,
		remainingBudgetUSD: Math.max(0, Math.round((maxSpend - currentSpend) * 10000) / 10000),
		percentUsed: maxSpend > 0 ? Math.round((currentSpend / maxSpend) * 100) : 0,
	};
}

/**
 * Check if user has remaining API budget before making a request
 */
export async function checkApiBudget(
	userId: string,
	plan: PlanTier,
	estimatedCostUSD: number
): Promise<{ allowed: boolean; remainingBudget: number; message?: string }> {
	const spending = await getUserSpending(userId, plan);

	if (spending.remainingBudgetUSD < estimatedCostUSD) {
		return {
			allowed: false,
			remainingBudget: spending.remainingBudgetUSD,
			message: `API spending limit reached. You've used $${spending.currentMonthSpendUSD.toFixed(4)} of your $${spending.maxSpendUSD.toFixed(2)} monthly limit. Upgrade your plan for more usage.`,
		};
	}

	if (spending.percentUsed >= 90) {
		console.log(`[ApiCost] User ${userId} at ${spending.percentUsed}% of API budget`);
	}

	return {
		allowed: true,
		remainingBudget: spending.remainingBudgetUSD,
	};
}

/**
 * Record API usage and cost
 */
export async function recordApiUsage(record: ApiUsageRecord): Promise<void> {
	const { userId, requestType, inputTokens, outputTokens, audioMinutes, costUSD, model, sessionId } = record;

	if (isDBConnected()) {
		const pool = getPool()!;
		const month = getCurrentMonth();

		await pool.query(
			`INSERT INTO ig_api_usage (
				clerk_user_id, billing_month, request_type, model,
				input_tokens, output_tokens, audio_minutes, cost_usd, session_id
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			[
				userId,
				month,
				requestType,
				model,
				inputTokens || 0,
				outputTokens || 0,
				audioMinutes || 0,
				costUSD,
				sessionId || null,
			]
		);

		await pool.query(
			`UPDATE ig_users SET
				api_spend_usd = COALESCE(api_spend_usd, 0) + $2,
				updated_at = NOW()
			 WHERE clerk_user_id = $1`,
			[userId, costUSD]
		);
	} else {
		const current = inMemorySpending.get(userId) || 0;
		inMemorySpending.set(userId, current + costUSD);
	}

	console.log(`[ApiCost] User ${userId}: +$${costUSD.toFixed(6)} (${requestType}, ${model})`);
}

/**
 * Calculate and record transcription cost
 */
export async function trackTranscriptionCost(
	userId: string,
	audioMinutes: number,
	model: string = 'whisper-large-v3-turbo',
	sessionId?: string
): Promise<number> {
	const costUSD = estimateTranscriptionCost(audioMinutes);

	await recordApiUsage({
		userId,
		requestType: 'transcription',
		audioMinutes,
		costUSD,
		model,
		sessionId,
	});

	return costUSD;
}

/**
 * Calculate and record LLM completion cost
 */
export async function trackLLMCost(
	userId: string,
	model: string,
	inputTokens: number,
	outputTokens: number,
	sessionId?: string
): Promise<number> {
	const modelType = model.includes('70b') ? 'llama33_70b' : 'llama31_8b';
	const costUSD = estimateLLMCost(modelType, inputTokens, outputTokens);

	await recordApiUsage({
		userId,
		requestType: modelType === 'llama33_70b' ? 'llm_70b' : 'llm_8b',
		inputTokens,
		outputTokens,
		costUSD,
		model,
		sessionId,
	});

	return costUSD;
}

/**
 * Estimate cost for an upcoming request (for pre-check)
 */
export function estimateRequestCost(
	requestType: 'transcription' | 'llm_chat' | 'llm_voice',
	params: { audioMinutes?: number; estimatedTokens?: number }
): number {
	switch (requestType) {
		case 'transcription':
			return estimateTranscriptionCost(params.audioMinutes || 1);
		case 'llm_chat':
			return estimateLLMCost('llama31_8b', params.estimatedTokens || 500, params.estimatedTokens || 300);
		case 'llm_voice':
			return estimateLLMCost('llama31_8b', params.estimatedTokens || 200, params.estimatedTokens || 150);
		default:
			return 0.001;
	}
}

/**
 * Get user's API usage breakdown for the current month
 */
export async function getApiUsageBreakdown(userId: string): Promise<{
	transcription: { count: number; costUSD: number; minutes: number };
	llm: { count: number; costUSD: number; tokens: number };
	total: { costUSD: number; requests: number };
}> {
	if (!isDBConnected()) {
		return {
			transcription: { count: 0, costUSD: 0, minutes: 0 },
			llm: { count: 0, costUSD: 0, tokens: 0 },
			total: { costUSD: inMemorySpending.get(userId) || 0, requests: 0 },
		};
	}

	const pool = getPool()!;
	const month = getCurrentMonth();

	const { rows } = await pool.query(
		`SELECT 
			request_type,
			COUNT(*)::int as count,
			COALESCE(SUM(cost_usd), 0)::numeric as cost,
			COALESCE(SUM(audio_minutes), 0)::numeric as minutes,
			COALESCE(SUM(input_tokens + output_tokens), 0)::bigint as tokens
		 FROM ig_api_usage
		 WHERE clerk_user_id = $1 AND billing_month = $2
		 GROUP BY request_type`,
		[userId, month]
	);

	const breakdown = {
		transcription: { count: 0, costUSD: 0, minutes: 0 },
		llm: { count: 0, costUSD: 0, tokens: 0 },
		total: { costUSD: 0, requests: 0 },
	};

	for (const row of rows) {
		if (row.request_type === 'transcription') {
			breakdown.transcription = {
				count: row.count,
				costUSD: parseFloat(row.cost),
				minutes: parseFloat(row.minutes),
			};
		} else if (row.request_type.startsWith('llm')) {
			breakdown.llm.count += row.count;
			breakdown.llm.costUSD += parseFloat(row.cost);
			breakdown.llm.tokens += parseInt(row.tokens);
		}
		breakdown.total.costUSD += parseFloat(row.cost);
		breakdown.total.requests += row.count;
	}

	return breakdown;
}

/**
 * Reset monthly spending (called at billing cycle reset)
 */
export async function resetMonthlySpending(userId: string): Promise<void> {
	if (isDBConnected()) {
		const pool = getPool()!;
		await pool.query(
			`UPDATE ig_users SET api_spend_usd = 0, updated_at = NOW() WHERE clerk_user_id = $1`,
			[userId]
		);
	} else {
		inMemorySpending.set(userId, 0);
	}
}
