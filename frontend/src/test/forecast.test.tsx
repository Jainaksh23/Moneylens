import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ForecastPage } from '../pages/ForecastPage';
import { forecastService } from '../services/forecastService';

vi.mock('../services/forecastService', () => ({
  forecastService: {
    getForecast: vi.fn(),
  },
}));

describe('ForecastPage Component State & Error Classification Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders waking up message and retry button when status is ml_unavailable', async () => {
    vi.mocked(forecastService.getForecast).mockResolvedValueOnce({
      available: false,
      status: 'ml_unavailable',
      reason: 'Forecast service is waking up, please retry in a minute',
      retryable: true,
      monthlyTrend: [],
    });

    render(
      <MemoryRouter>
        <ForecastPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText('Forecast service is waking up, please retry in a minute'),
      ).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /retry now/i })).toBeInTheDocument();

    // Clicking retry triggers a reload
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /retry now/i }));
    expect(forecastService.getForecast).toHaveBeenCalledTimes(2);
  });

  it('renders generation failed message when status is generation_failed', async () => {
    vi.mocked(forecastService.getForecast).mockResolvedValueOnce({
      available: false,
      status: 'generation_failed',
      reason: 'Could not generate forecast',
      retryable: false,
      monthlyTrend: [],
    });

    render(
      <MemoryRouter>
        <ForecastPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Could not generate forecast')).toBeInTheDocument();
    });
  });

  it('renders insufficient data guidance and link when history is under 14 days', async () => {
    vi.mocked(forecastService.getForecast).mockResolvedValueOnce({
      available: false,
      status: 'insufficient_data',
      reason: 'Need at least 14 days of transaction history (currently have 5 days).',
      dataCoverage: {
        firstDate: '2026-01-01',
        lastDate: '2026-01-05',
        days: 5,
        minDaysRequired: 14,
      },
      monthlyTrend: [],
    });

    render(
      <MemoryRouter>
        <ForecastPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText('Need at least 14 days of transaction history (currently have 5 days).'),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText(/You currently have 5 of 14 minimum required days/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /import bank statement/i })).toBeInTheDocument();
  });

  it('renders low confidence banner and assumptions in short-history mode', async () => {
    vi.mocked(forecastService.getForecast).mockResolvedValueOnce({
      available: true,
      status: 'ok',
      forecast: {
        mode: 'short_history',
        confidence: 'low',
        modelUsed: 'short_history_run_rate',
        modelVersion: '1.0.0',
        horizon: 3,
        dataCoverage: {
          firstDate: '2026-01-01',
          lastDate: '2026-01-25',
          days: 25,
        },
        values: [
          { month: '2026-02', value: 12000, lower: 9000, upper: 15000 },
          { month: '2026-03', value: 12000, lower: 8000, upper: 16000 },
          { month: '2026-04', value: 12000, lower: 7000, upper: 17000 },
        ],
        runRateDaily: {
          avgDailyIncome: 1500,
          avgDailyExpense: 1100,
          avgDailyNet: 400,
        },
        assumptions: [
          'Assumes spending continues at observed daily run-rate.',
          'One-off large items are not treated specially.',
        ],
        limitations: [
          'Based on only 25 days of data; seasonal cycles cannot be inferred.',
        ],
        warnings: [],
        evaluation: 'No backtest metric available for short-history mode.',
      },
      monthlyTrend: [{ month: '2026-01', income: 37500, expense: 27500, net: 10000, savingsRate: 26.7 }],
    });

    render(
      <MemoryRouter>
        <ForecastPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText('Low confidence: based on only 25 days of data'),
      ).toBeInTheDocument();
    });

    expect(screen.getByText('Assumes spending continues at observed daily run-rate.')).toBeInTheDocument();
    expect(
      screen.getByText('Based on only 25 days of data; seasonal cycles cannot be inferred.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No backtest metric available for short-history mode.'),
    ).toBeInTheDocument();
    expect(screen.getByText('LOW')).toBeInTheDocument();
  });
});

