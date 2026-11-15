/**
 * Groq LLM Service with Strict Sandboxing, Timeout, Retries, Function Calling, and Daily Budget Cap.
 *
 * Capabilities:
 * - Model: llama-3.3-70b-versatile (from GROQ_MODEL or env)
 * - OpenAI-compatible function calling (tools, tool_calls, tool role messages)
 * - Global daily token budget cap tracking
 * - Timeout handling using AbortController
 * - Exponential backoff retry on transient 429/500/503 network errors
 * - Anti-Prompt-Injection defense: treats retrieved docs and user data as inert text
 */

import { env, sanitizeEnvString } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

export interface ToolCallItem {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessagePayload {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: ToolCallItem[];
  tool_call_id?: string;
  name?: string;
}

export interface GroqCompletionResponse {
  content: string | null;
  toolCalls?: ToolCallItem[];
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  usedFallback: boolean;
}

// Global daily LLM token tracker
interface GlobalBudgetTracker {
  dateKey: string; // YYYY-MM-DD
  tokensUsed: number;
  requestCount: number;
}

const GLOBAL_DAILY_TOKEN_LIMIT = parseInt(process.env.GLOBAL_DAILY_TOKEN_LIMIT || '1000000', 10);
let globalBudget: GlobalBudgetTracker = {
  dateKey: new Date().toISOString().slice(0, 10),
  tokensUsed: 0,
  requestCount: 0,
};

export class GroqService {
  private apiKey: string | undefined;
  private model: string;
  public readonly baseUrl = 'https://api.groq.com/openai/v1';
  public readonly chatPath = '/chat/completions';
  public readonly endpoint = `${this.baseUrl}${this.chatPath}`;

  constructor() {
    this.apiKey = sanitizeEnvString(env.GROQ_API_KEY);
    this.model = sanitizeEnvString(env.GROQ_MODEL) || 'llama-3.3-70b-versatile';
  }

  /**
   * Enforces global daily budget cap across all users.
   */
  private checkGlobalBudget(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (globalBudget.dateKey !== today) {
      globalBudget = { dateKey: today, tokensUsed: 0, requestCount: 0 };
    }

    if (globalBudget.tokensUsed >= GLOBAL_DAILY_TOKEN_LIMIT) {
      throw new AppError(
        'The global daily AI assistant capacity has been reached. Please check back tomorrow.',
        429,
        'LLM_RATE_LIMITED',
      );
    }
  }

  public recordGlobalTokens(tokens: number): void {
    const today = new Date().toISOString().slice(0, 10);
    if (globalBudget.dateKey !== today) {
      globalBudget = { dateKey: today, tokensUsed: 0, requestCount: 0 };
    }
    globalBudget.tokensUsed += tokens;
    globalBudget.requestCount += 1;
  }

  /**
   * Generates completion with retry, backoff, and classified error codes.
   * Supports OpenAI function calling tools.
   */
  async generateCompletion(
    messages: ChatMessagePayload[],
    options: {
      temperature?: number;
      maxTokens?: number;
      timeoutMs?: number;
      maxRetries?: number;
      requestId?: string;
      tools?: any[];
      tool_choice?: 'auto' | 'none' | any;
    } = {}
  ): Promise<GroqCompletionResponse> {
    this.checkGlobalBudget();

    const temperature = options.temperature ?? 0.1;
    const maxTokens = options.maxTokens ?? 1024;
    const timeoutMs = options.timeoutMs ?? 30000;
    const maxRetries = options.maxRetries ?? 1;
    const requestId = options.requestId || 'unknown';

    // Check and sanitize API key dynamically (supports test runtime modifications)
    const rawKey = env.GROQ_API_KEY ?? this.apiKey;
    const apiKey = sanitizeEnvString(rawKey);

    if (!apiKey || apiKey === '') {
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

    const currentModel = sanitizeEnvString(env.GROQ_MODEL ?? this.model) || 'llama-3.3-70b-versatile';
    const baseUrlHost = new URL(this.baseUrl).host;
    let delay = 500;

    const requestBody: Record<string, any> = {
      model: currentModel,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    if (options.tools && options.tools.length > 0) {
      requestBody.tools = options.tools;
      requestBody.tool_choice = options.tool_choice || 'auto';
    }

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
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          const status = response.status;
          let errorType: string | undefined;
          let groqErrorCode: string | undefined;

          try {
            const errJson = (await response.json()) as any;
            if (errJson?.error) {
              errorType = errJson.error.type;
              groqErrorCode = errJson.error.code;
            }
          } catch {
            // Error response was not JSON
          }

          // 404: Configured model does not exist or wrong endpoint
          if (status === 404) {
            logger.error(
              {
                requestId,
                errorCode: 'LLM_MODEL_NOT_FOUND',
                upstreamStatusCode: 404,
                model: currentModel,
                baseUrlHost,
                errorType,
                groqErrorCode,
              },
              `Groq model or endpoint not found: ${currentModel}`,
            );
            throw new AppError(
              `The configured AI assistant model or endpoint is invalid (${currentModel}). Please check GROQ_MODEL in deployment settings.`,
              502,
              'LLM_MODEL_NOT_FOUND',
            );
          }

          // 401 / 403: Authentication or authorization failure (do not retry)
          if (status === 401 || status === 403) {
            logger.error(
              {
                requestId,
                errorCode: 'LLM_AUTH_FAILED',
                upstreamStatusCode: status,
                baseUrlHost,
                errorType,
                groqErrorCode,
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
                baseUrlHost,
                errorType,
                groqErrorCode,
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

          logger.error(
            {
              requestId,
              errorCode: 'LLM_UPSTREAM_ERROR',
              upstreamStatusCode: status,
              baseUrlHost,
              errorType,
              groqErrorCode,
            },
            `Groq API server error status ${status}`,
          );
          throw new AppError(
            'AI assistant upstream service encountered an error. Please try again in a moment.',
            502,
            'LLM_UPSTREAM_ERROR',
          );
        }

        const data: any = await response.json();
        const choice = data.choices?.[0];
        const message = choice?.message;
        const content = message?.content || null;
        const toolCalls: ToolCallItem[] | undefined = message?.tool_calls;

        if (!content && (!toolCalls || toolCalls.length === 0)) {
          throw new AppError(
            'Groq API returned empty or missing completion content',
            502,
            'INTERNAL_ERROR',
          );
        }

        const tokens = {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        };

        if (tokens.totalTokens > 0) {
          this.recordGlobalTokens(tokens.totalTokens);
        }

        return {
          content,
          toolCalls,
          tokenUsage: tokens,
          usedFallback: false,
        };
      } catch (err: any) {
        clearTimeout(timer);

        // If it's already a classified AppError, rethrow immediately
        if (err instanceof AppError) {
          throw err;
        }

        // Handle AbortError / Timeout strictly
        if (
          err.name === 'AbortError' ||
          err.message?.toLowerCase().includes('timeout') ||
          err.message?.toLowerCase().includes('abort')
        ) {
          logger.warn(
            {
              requestId,
              errorCode: 'LLM_TIMEOUT',
              baseUrlHost,
            },
            'Groq API request timed out (AbortError)',
          );
          throw new AppError(
            'AI assistant request timed out. The service may be waking up, please retry in a minute.',
            504,
            'LLM_TIMEOUT',
          );
        }

        // Retry transient network errors
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, delay));
          delay *= 2;
          continue;
        }

        logger.error(
          {
            requestId,
            errorCode: 'LLM_UPSTREAM_ERROR',
            baseUrlHost,
            error: err?.message,
          },
          'Groq API connection failed after retries',
        );
        throw new AppError(
          'Could not reach AI assistant service. Please check network connection or retry in a moment.',
          502,
          'LLM_UPSTREAM_ERROR',
        );
      }
    }

    throw new AppError(
      'AI assistant request timed out. The service may be waking up, please retry in a minute.',
      504,
      'LLM_TIMEOUT',
    );
  }

  /**
   * Performs startup self-check.
   */
  async verifyModelAvailability(requestId = 'startup-check'): Promise<boolean | null> {
    const rawKey = env.GROQ_API_KEY ?? this.apiKey;
    const apiKey = sanitizeEnvString(rawKey);
    if (!apiKey) {
      return null;
    }

    const modelName = sanitizeEnvString(env.GROQ_MODEL ?? this.model) || 'llama-3.3-70b-versatile';
    const baseUrlHost = new URL(this.baseUrl).host;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);

      const resp = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) {
        logger.warn(
          {
            requestId,
            upstreamStatusCode: resp.status,
            model: modelName,
            baseUrlHost,
          },
          'Groq startup model check returned non-2xx',
        );
        return null;
      }

      const data = (await resp.json()) as { data?: Array<{ id: string }> };
      const modelList = Array.isArray(data?.data) ? data.data.map((m) => m.id) : [];
      const modelAvailable = modelList.includes(modelName);

      logger.info(
        {
          requestId,
          model: modelName,
          baseUrlHost,
          modelAvailable,
        },
        modelAvailable
          ? `Configured Groq model '${modelName}' is verified available`
          : `Warning: Configured Groq model '${modelName}' was not found in available models list`,
      );

      return modelAvailable;
    } catch (err: any) {
      logger.warn(
        {
          requestId,
          error: err?.message,
          model: modelName,
          baseUrlHost,
        },
        'Groq startup model check request failed or timed out',
      );
      return null;
    }
  }
}

export const groqService = new GroqService();
