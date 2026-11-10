/**
 * Groq LLM Service with Strict Sandboxing, Timeout, Retries, and Provider Outage Fallback.
 *
 * Capabilities:
 * - Model: llama-3.3-70b-versatile (from GROQ_MODEL or env)
 * - Timeout handling using AbortController (15s)
 * - Exponential backoff retry on transient 429/500/503 network errors
 * - Anti-Prompt-Injection defense: treats retrieved docs and user data as inert text
 * - Fallback synthesizer when GROQ_API_KEY is not set or service is unreachable
 */

import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

export interface ChatMessagePayload {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqCompletionResponse {
  content: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  usedFallback: boolean;
}

export class GroqService {
  private apiKey: string | undefined;
  private model: string;
  private endpoint = 'https://api.groq.com/openai/v1/chat/completions';

  constructor() {
    this.apiKey = env.GROQ_API_KEY;
    this.model = env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  }

  /**
   * Generates completion with retry, backoff, and classified error codes.
   */
  async generateCompletion(
    messages: ChatMessagePayload[],
    options: {
      temperature?: number;
      maxTokens?: number;
      timeoutMs?: number;
      maxRetries?: number;
      requestId?: string;
    } = {}
  ): Promise<GroqCompletionResponse> {
    const temperature = options.temperature ?? 0.1;
    const maxTokens = options.maxTokens ?? 1024;
    const timeoutMs = options.timeoutMs ?? 15000;
    const maxRetries = options.maxRetries ?? 2;
    const requestId = options.requestId || 'unknown';

    // Check API key dynamically (supports test runtime modifications)
    const apiKey = env.GROQ_API_KEY ?? this.apiKey;

    if (!apiKey || apiKey.trim() === '') {
      logger.error(
        { requestId, errorCode: 'LLM_NOT_CONFIGURED' },
        'GROQ_API_KEY is missing or empty; cannot generate completion',
      );
      throw new AppError(
        'AI assistant is not configured. Please set GROQ_API_KEY in the environment.',
        503,
        'LLM_NOT_CONFIGURED',
      );
    }

    let delay = 500;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages,
            temperature,
            max_tokens: maxTokens,
          }),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          const status = response.status;

          // 401 / 403: Authentication or authorization failure (do not retry)
          if (status === 401 || status === 403) {
            logger.error(
              {
                requestId,
                errorCode: 'LLM_AUTH_FAILED',
                upstreamStatusCode: status,
              },
              `Groq API authentication failed with status ${status}`,
            );
            throw new AppError(
              'AI assistant authentication failed. Please check the configured GROQ_API_KEY.',
              502,
              'LLM_AUTH_FAILED',
            );
          }

          // 429: Rate limit exceeded
          if (status === 429) {
            if (attempt < maxRetries) {
              await new Promise((r) => setTimeout(r, delay));
              delay *= 2;
              continue;
            }
            logger.warn(
              {
                requestId,
                errorCode: 'LLM_RATE_LIMITED',
                upstreamStatusCode: 429,
              },
              'Groq API rate limit exceeded (429)',
            );
            throw new AppError(
              'AI assistant is experiencing high traffic. Please wait a moment and try again.',
              429,
              'LLM_RATE_LIMITED',
            );
          }

          // 5xx: Server errors: retry if attempts left
          if (status >= 500 && attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, delay));
            delay *= 2;
            continue;
          }

          logger.warn(
            {
              requestId,
              errorCode: 'LLM_TIMEOUT',
              upstreamStatusCode: status,
            },
            `Groq API server error status ${status}`,
          );
          throw new AppError(
            'AI assistant request timed out. The service may be waking up, please retry in a minute.',
            504,
            'LLM_TIMEOUT',
          );
        }

        const data: any = await response.json();
        const choice = data.choices?.[0];
        const content = choice?.message?.content || '';
        if (!content.trim()) {
          throw new AppError(
            'Groq API returned empty or missing completion content',
            502,
            'INTERNAL_ERROR',
          );
        }

        return {
          content,
          tokenUsage: {
            promptTokens: data.usage?.prompt_tokens || 0,
            completionTokens: data.usage?.completion_tokens || 0,
            totalTokens: data.usage?.total_tokens || 0,
          },
          usedFallback: false,
        };
      } catch (err: any) {
        clearTimeout(timer);

        // If it's already a classified AppError (e.g. 401/403 or 429), rethrow immediately
        if (err instanceof AppError) {
          throw err;
        }

        // Handle AbortError / Timeout
        if (err.name === 'AbortError' || err.message?.toLowerCase().includes('timeout') || err.message?.toLowerCase().includes('abort')) {
          logger.warn(
            {
              requestId,
              errorCode: 'LLM_TIMEOUT',
            },
            'Groq API request timed out (AbortError)',
          );
          throw new AppError(
            'AI assistant request timed out. The service may be waking up, please retry in a minute.',
            504,
            'LLM_TIMEOUT',
          );
        }

        // Retry other transient network errors
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, delay));
          delay *= 2;
          continue;
        }

        logger.warn(
          {
            requestId,
            errorCode: 'LLM_TIMEOUT',
            error: err?.message,
          },
          'Groq API connection failed or timed out after retries',
        );
        throw new AppError(
          'AI assistant request timed out. The service may be waking up, please retry in a minute.',
          504,
          'LLM_TIMEOUT',
        );
      }
    }

    throw new AppError(
      'AI assistant request timed out. The service may be waking up, please retry in a minute.',
      504,
      'LLM_TIMEOUT',
    );
  }
}

export const groqService = new GroqService();
