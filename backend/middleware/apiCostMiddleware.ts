import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../../shared/types';
import { checkApiBudget, estimateRequestCost } from '../services/apiCostTracker';

export type RequestType = 'transcription' | 'llm_chat' | 'llm_voice';

interface ApiCostMiddlewareOptions {
	requestType: RequestType;
	getAudioMinutes?: (req: Request) => number;
	getEstimatedTokens?: (req: Request) => number;
}

/**
 * Middleware to check API spending limits before processing expensive requests
 */
export function apiCostGuard(options: ApiCostMiddlewareOptions) {
	return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		const authReq = req as AuthRequest;

		if (!authReq.user) {
			res.status(401).json({ error: 'Authentication required' });
			return;
		}

		const { userId, plan } = authReq.user;

		try {
			const audioMinutes = options.getAudioMinutes?.(req);
			const estimatedTokens = options.getEstimatedTokens?.(req);

			const estimatedCost = estimateRequestCost(options.requestType, {
				audioMinutes,
				estimatedTokens,
			});

			const budgetCheck = await checkApiBudget(userId, plan, estimatedCost);

			if (!budgetCheck.allowed) {
				res.status(402).json({
					error: 'API spending limit exceeded',
					code: 'api_budget_exceeded',
					message: budgetCheck.message,
					remainingBudgetUSD: budgetCheck.remainingBudget,
					estimatedCostUSD: estimatedCost,
				});
				return;
			}

			(req as any).estimatedCost = estimatedCost;
			(req as any).remainingBudget = budgetCheck.remainingBudget;

			next();
		} catch (error) {
			console.error('[ApiCostMiddleware] Error checking budget:', error);
			next();
		}
	};
}

/**
 * Pre-configured middleware for transcription requests
 */
export const transcriptionCostGuard = apiCostGuard({
	requestType: 'transcription',
	getAudioMinutes: (req) => {
		const duration = req.body?.audioChunkDuration;
		return duration ? Math.ceil(duration / 60) : 1;
	},
});

/**
 * Pre-configured middleware for chat/analyze requests
 */
export const llmCostGuard = apiCostGuard({
	requestType: 'llm_chat',
	getEstimatedTokens: (req) => {
		const transcript = req.body?.transcript || '';
		return Math.ceil(transcript.length / 4) + 500;
	},
});

/**
 * Pre-configured middleware for voice analysis requests
 */
export const voiceLlmCostGuard = apiCostGuard({
	requestType: 'llm_voice',
	getEstimatedTokens: (req) => {
		const transcript = req.body?.transcript || '';
		return Math.ceil(transcript.length / 4) + 200;
	},
});
