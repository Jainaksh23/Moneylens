import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatPage } from '../pages/ChatPage';
import { chatService } from '../services/chatService';
import { ApiClientError } from '../services/apiClient';

vi.mock('../services/chatService', () => ({
  chatService: {
    getHistory: vi.fn(),
    sendMessage: vi.fn(),
    deleteHistory: vi.fn(),
  },
}));

describe('ChatPage Friendly Error Classification & Diagnostics Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(chatService.getHistory).mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    });
  });

  it('renders waking up message and retry button when error is LLM_TIMEOUT', async () => {
    vi.mocked(chatService.sendMessage).mockRejectedValueOnce(
      new ApiClientError(
        'AI assistant request timed out. The service may be waking up, please retry in a minute.',
        504,
        'LLM_TIMEOUT',
      ),
    );

    render(<ChatPage />);

    // Wait for initial history load
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask about your spending/i)).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/Ask about your spending/i);
    const sendBtn = screen.getByRole('button', { name: /ask/i });

    await user.type(input, 'What is my budget?');
    await user.click(sendBtn);

    await waitFor(() => {
      expect(
        screen.getByText('Assistant is waking up, retry in a minute'),
      ).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();

    // Clicking retry retries the message
    vi.mocked(chatService.sendMessage).mockResolvedValueOnce({
      answer: 'Your budget is 50/30/20.',
      evidence: [],
      toolsUsed: [],
    });

    await user.click(retryBtn);

    await waitFor(() => {
      expect(chatService.sendMessage).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Your budget is 50/30/20.')).toBeInTheDocument();
    });
  });

  it('renders not configured friendly message when error is LLM_NOT_CONFIGURED', async () => {
    vi.mocked(chatService.sendMessage).mockRejectedValueOnce(
      new ApiClientError(
        'AI assistant is not configured.',
        503,
        'LLM_NOT_CONFIGURED',
      ),
    );

    render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask about your spending/i)).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/Ask about your spending/i);
    const sendBtn = screen.getByRole('button', { name: /ask/i });

    await user.type(input, 'Hello assistant');
    await user.click(sendBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Assistant is not configured\. Please add GROQ_API_KEY in deployment settings\./i),
      ).toBeInTheDocument();
    });

    // Should NOT show retry button for unconfigured service
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('renders authentication failure friendly message when error is LLM_AUTH_FAILED', async () => {
    vi.mocked(chatService.sendMessage).mockRejectedValueOnce(
      new ApiClientError(
        'AI assistant authentication failed.',
        502,
        'LLM_AUTH_FAILED',
      ),
    );

    render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask about your spending/i)).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/Ask about your spending/i);
    const sendBtn = screen.getByRole('button', { name: /ask/i });

    await user.type(input, 'Show me stats');
    await user.click(sendBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Assistant authentication failed\. The configured GROQ_API_KEY is invalid or unauthorized\./i),
      ).toBeInTheDocument();
    });
  });

  it('renders rate limited friendly message with retry button when error is LLM_RATE_LIMITED', async () => {
    vi.mocked(chatService.sendMessage).mockRejectedValueOnce(
      new ApiClientError(
        'Rate limit reached',
        429,
        'LLM_RATE_LIMITED',
      ),
    );

    render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask about your spending/i)).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/Ask about your spending/i);
    const sendBtn = screen.getByRole('button', { name: /ask/i });

    await user.type(input, 'Tell me more');
    await user.click(sendBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Assistant is temporarily rate-limited\. Please wait a moment and retry\./i),
      ).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});

