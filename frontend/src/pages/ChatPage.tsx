import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BotMessageSquare,
  Send,
  Sparkles,
  Trash2,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Database,
  BookOpen,
  ArrowRight,
  Info,
} from 'lucide-react';
import { chatService } from '../services/chatService';
import type { ChatHistoryMessage, ChatEvidence } from '../services/chatService';
import { ApiClientError } from '../services/apiClient';

const SUGGESTIONS = [
  'March mein food pe kitna gaya?',
  'Can you explain the 50/30/20 budgeting rule?',
  'How many months of expenses for an emergency fund?',
  'What is an SIP and how does compounding work?',
  'What is the difference between debt snowball and avalanche?',
  'Which penny stock should I buy for guaranteed returns tomorrow?',
];

export function getFriendlyChatError(
  code: string | null,
  fallbackMessage?: string | null,
): { message: string; canRetry: boolean } {
  switch (code) {
    case 'LLM_MODEL_NOT_FOUND':
      return {
        message: 'Assistant model is misconfigured. Please check GROQ_MODEL in deployment settings.',
        canRetry: false,
      };
    case 'LLM_UPSTREAM_ERROR':
      return {
        message: 'Assistant provider encountered an error. Please retry in a moment.',
        canRetry: true,
      };
    case 'LLM_NOT_CONFIGURED':
      return {
        message: 'Assistant is not configured. Please add GROQ_API_KEY in deployment settings.',
        canRetry: false,
      };
    case 'LLM_AUTH_FAILED':
      return {
        message: 'Assistant authentication failed. The configured GROQ_API_KEY is invalid or unauthorized.',
        canRetry: false,
      };
    case 'LLM_RATE_LIMITED':
      return {
        message: 'Assistant is temporarily rate-limited. Please wait a moment and retry.',
        canRetry: true,
      };
    case 'LLM_TIMEOUT':
      return {
        message: 'Assistant is waking up, retry in a minute',
        canRetry: true,
      };
    case 'RAG_UNAVAILABLE':
      return {
        message: 'Knowledge retrieval is currently offline. Answers may be limited to your transaction records.',
        canRetry: true,
      };
    case 'INTERNAL_ERROR':
      return {
        message: 'An internal assistant error occurred. Please retry.',
        canRetry: true,
      };
    case 'NETWORK_ERROR':
      return {
        message: 'Could not connect to server. Please check your internet connection.',
        canRetry: true,
      };
    default:
      return {
        message: fallbackMessage || 'An unexpected error occurred. Please try again.',
        canRetry: true,
      };
  }
}

export const ChatPage: React.FC = () => {
  const [messages, setMessages] = useState<ChatHistoryMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadHistory = useCallback(async () => {
    setIsHistoryLoading(true);
    setError(null);
    try {
      const res = await chatService.getHistory(1, 50);
      setMessages(res.data);
    } catch {
      // Failed to load history, initialize empty
      setMessages([]);
    } finally {
      setIsHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async (messageToSend?: string) => {
    const text = (messageToSend || inputText).trim();
    if (!text || isLoading) return;

    setInputText('');
    setError(null);
    setErrorCode(null);
    setLastFailedMessage(null);

    // Optimistically append user message
    const tempUserMsg: ChatHistoryMessage = {
      _id: `temp_user_${Date.now()}`,
      role: 'user',
      content: text,
      evidence: [],
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg]);
    setIsLoading(true);

    try {
      const response = await chatService.sendMessage(text);

      const assistantMsg: ChatHistoryMessage = {
        _id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: response.answer,
        evidence: response.evidence || [],
        limitations: response.limitations,
        disclaimer: response.disclaimer,
        toolsUsed: response.toolsUsed,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const code = err instanceof ApiClientError ? err.code : (err?.code || null);
      setErrorCode(code);
      setError(err?.message || 'Failed to send message. Please check connection and try again.');
      setLastFailedMessage(text);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    if (lastFailedMessage) {
      handleSend(lastFailedMessage);
    }
  };

  const handleDeleteHistory = async () => {
    if (!window.confirm('Are you sure you want to delete all chat history? This cannot be undone.')) {
      return;
    }
    setIsDeleting(true);
    try {
      await chatService.deleteHistory();
      setMessages([]);
    } catch (err: any) {
      alert(`Could not delete history: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6.5rem)] space-y-4">
      {/* Top Header & Disclaimers */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-800/80 gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold tracking-tight text-white">AI Financial Assistant</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
              RAG & Aggregates
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Grounded in approved MoneyLens knowledge documents & authenticated financial metrics. Zero hallucinations.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-gray-900/60 border border-gray-800 text-[11px] text-gray-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>Read-Only Chat</span>
          </div>

          {messages.length > 0 && (
            <button
              onClick={handleDeleteHistory}
              disabled={isDeleting}
              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-gray-800 bg-gray-900/40 text-xs text-gray-400 hover:text-rose-400 hover:border-rose-900/40 transition-colors disabled:opacity-50"
              title="Delete all chat history"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Clear History</span>
            </button>
          )}
        </div>
      </div>

      {/* Safety Notice Banner */}
      <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 px-3 py-2 text-[11px] text-amber-300 flex items-start space-x-2">
        <ShieldAlert className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <span className="font-semibold text-amber-200">Educational Notice:</span> All insights are educational decision support. Under SEBI rules, this assistant does not provide certified stock recommendations, speculative tips, or individualized tax advice.
        </p>
      </div>

      {/* Chat Thread Container */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-gray-800 bg-[#0a0e17]/80 p-4 space-y-4">
        {isHistoryLoading ? (
          <div className="flex h-full items-center justify-center space-x-2 text-xs text-gray-500">
            <RefreshCw className="h-4 w-4 animate-spin text-emerald-400" />
            <span>Loading conversation history...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center max-w-lg mx-auto py-8">
            <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4">
              <BotMessageSquare className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-white">Ask Anything About Your Finances</h3>
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
              Ask questions about your transactions, spending habits, active savings goals, or explore core personal finance principles.
            </p>

            {/* Quick Starter Suggestions */}
            <div className="mt-6 w-full space-y-2">
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider text-left pl-1">
                Suggested Prompts
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                {SUGGESTIONS.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(item)}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-gray-800/80 bg-gray-900/40 hover:bg-gray-800/60 hover:border-emerald-500/30 text-xs text-gray-300 transition-colors group"
                  >
                    <span className="truncate pr-2">{item}</span>
                    <ArrowRight className="h-3 w-3 text-gray-500 group-hover:text-emerald-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={msg._id || index}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-none shadow-md shadow-emerald-950/30'
                    : 'bg-[#111726] border border-gray-800 text-gray-200 rounded-bl-none'
                }`}
              >
                {/* Assistant header avatar */}
                {msg.role === 'assistant' && (
                  <div className="flex items-center space-x-2 pb-2 mb-2 border-b border-gray-800/80 text-xs text-emerald-400">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="font-semibold">MoneyLens Intelligence</span>
                  </div>
                )}

                <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>

                {/* Evidence & Citations Section */}
                {msg.role === 'assistant' && msg.evidence && msg.evidence.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-800/80 space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 flex items-center space-x-1">
                      <Database className="h-3 w-3 text-emerald-400" />
                      <span>Grounded Evidence Sources:</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {msg.evidence.map((ev: ChatEvidence, evIdx: number) => (
                        <div
                          key={evIdx}
                          className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-mono border ${
                            ev.type === 'user_data'
                              ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40'
                              : 'bg-indigo-950/40 text-indigo-300 border-indigo-800/40'
                          }`}
                          title={ev.details ? JSON.stringify(ev.details) : undefined}
                        >
                          {ev.type === 'user_data' ? (
                            <Database className="h-2.5 w-2.5 text-emerald-400" />
                          ) : (
                            <BookOpen className="h-2.5 w-2.5 text-indigo-400" />
                          )}
                          <span className="truncate max-w-[200px]">{ev.source}</span>
                          {ev.period && (
                            <span className="text-[9px] text-gray-400">({ev.period})</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Limitations Badge */}
                {msg.role === 'assistant' && msg.limitations && (
                  <div className="mt-2.5 flex items-start space-x-1.5 rounded bg-amber-950/20 border border-amber-900/30 px-2 py-1 text-[11px] text-amber-300/90">
                    <AlertTriangle className="h-3 w-3 text-amber-400 flex-shrink-0 mt-0.5" />
                    <span>{msg.limitations}</span>
                  </div>
                )}

                {/* Statutory Disclaimer */}
                {msg.role === 'assistant' && msg.disclaimer && (
                  <p className="mt-2 text-[10px] text-gray-400 italic">
                    {msg.disclaimer}
                  </p>
                )}
              </div>

              <span className="text-[10px] text-gray-400 mt-1 px-1">
                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))
        )}

        {/* Loading Spinner Indicator */}
        {isLoading && (
          <div className="flex items-start space-x-3">
            <div className="h-8 w-8 rounded-full bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center text-emerald-400 flex-shrink-0">
              <BotMessageSquare className="h-4 w-4" />
            </div>
            <div className="rounded-2xl rounded-bl-none bg-[#111726] border border-gray-800 px-4 py-3 text-xs text-gray-400 flex items-center space-x-2">
              <div className="flex space-x-1">
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span>Searching knowledge base and computing financial metrics...</span>
            </div>
          </div>
        )}

        {/* Error / Retry Banner */}
        {error && (() => {
          const friendly = getFriendlyChatError(errorCode, error);
          return (
            <div
              role="alert"
              className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 text-xs text-rose-300 flex items-center justify-between"
            >
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-4 w-4 text-rose-400 flex-shrink-0" />
                <span>{friendly.message}</span>
              </div>
              {lastFailedMessage && friendly.canRetry && (
                <button
                  type="button"
                  onClick={handleRetry}
                  className="inline-flex items-center space-x-1 rounded bg-rose-900/60 hover:bg-rose-800 px-2.5 py-1 text-[11px] font-medium text-white transition-colors ml-2 flex-shrink-0"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Retry</span>
                </button>
              )}
            </div>
          );
        })()}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form & Rate Limit Indicator */}
      <div className="space-y-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="relative flex items-center"
        >
          <input
            id="chat-input"
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isLoading}
            placeholder="Ask about your spending, goals, or financial concepts (e.g., 'March mein food pe kitna gaya?')..."
            className="w-full rounded-xl border border-gray-800 bg-gray-900/80 px-4 py-3 pr-24 text-sm text-gray-100 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 transition-colors"
          />

          <button
            id="chat-send-button"
            type="submit"
            disabled={isLoading || !inputText.trim()}
            className="absolute right-2 inline-flex items-center space-x-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <span>Ask</span>
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>

        <div className="flex items-center justify-between px-1 text-[10px] text-gray-400">
          <div className="flex items-center space-x-1">
            <Info className="h-3 w-3 text-gray-400" />
            <span>Strict zero-leakage sandbox. User data is never stored in vector embeddings.</span>
          </div>
          <span>Quota: 30 queries / hour</span>
        </div>
      </div>
    </div>
  );
};
