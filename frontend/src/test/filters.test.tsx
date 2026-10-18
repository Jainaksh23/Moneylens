import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from '../pages/DashboardPage';
import { TransactionsPage } from '../pages/TransactionsPage';
import { analyticsService } from '../services/analyticsService';
import { transactionService } from '../services/transactionService';

vi.mock('../services/analyticsService', () => ({
  analyticsService: {
    getSummary: vi.fn(),
  },
}));

vi.mock('../services/remindersService', () => ({
  remindersService: {
    listReminders: vi.fn().mockResolvedValue({ reminders: [] }),
    detectReminders: vi.fn().mockResolvedValue({ reminders: [] }),
    updateReminder: vi.fn(),
  },
}));

vi.mock('../services/insightsService', () => ({
  insightsService: {
    listAnomalies: vi.fn().mockResolvedValue({ anomalies: [] }),
    listRecommendations: vi.fn().mockResolvedValue({ recommendations: [] }),
  },
}));

vi.mock('../services/transactionService', () => ({
  transactionService: {
    getTransactions: vi.fn(),
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
  },
}));

describe('Filters & Interaction Test Suites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Dashboard Date Presets Filter', () => {
    it('switches between presets (30d, 3m, 6m, ytd, all) and fetches new summary', async () => {
      (analyticsService.getSummary as any).mockResolvedValue({
        income: 50000,
        expense: 20000,
        net: 30000,
        savingsRate: 60,
        transactionCount: 10,
        categoryTotals: [],
        monthlyTrend: [],
      });

      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>,
      );

      // Initially loads with 'all'
      await waitFor(() => {
        expect(analyticsService.getSummary).toHaveBeenCalledWith(undefined, undefined);
      });

      // Click '30 Days'
      const btn30d = screen.getByRole('button', { name: '30 Days' });
      await user.click(btn30d);

      await waitFor(() => {
        expect(analyticsService.getSummary).toHaveBeenCalledTimes(2);
      });

      // Click 'YTD'
      const btnYtd = screen.getByRole('button', { name: 'YTD' });
      await user.click(btnYtd);

      await waitFor(() => {
        expect(analyticsService.getSummary).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('Transactions Page Ledger Filters', () => {
    it('filters by direction (income / expense) and searches query string', async () => {
      (transactionService.getTransactions as any).mockResolvedValue({
        items: [
          {
            id: 'tx1',
            date: '2026-03-10',
            amount: 2500,
            currency: 'INR',
            direction: 'expense',
            merchant: 'Swiggy',
            description: 'Lunch Order',
            category: 'Food',
            categorySource: 'model',
            source: 'manual',
            isDuplicate: false,
            needsReview: false,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 15,
        totalPages: 1,
      });

      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <TransactionsPage />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(transactionService.getTransactions).toHaveBeenCalled();
        expect(screen.getByText('Lunch Order')).toBeInTheDocument();
      });

      // Click Income filter
      const incomeFilterBtn = screen.getByRole('button', { name: 'income' });
      await user.click(incomeFilterBtn);

      await waitFor(() => {
        expect(transactionService.getTransactions).toHaveBeenCalledWith(
          expect.objectContaining({
            direction: 'income',
          }),
        );
      });

      // Type search query
      const searchInput = screen.getByLabelText(/search transactions/i);
      await user.type(searchInput, 'Swiggy{Enter}');

      await waitFor(() => {
        expect(transactionService.getTransactions).toHaveBeenCalledWith(
          expect.objectContaining({
            q: 'Swiggy',
          }),
        );
      });
    });
  });
});
