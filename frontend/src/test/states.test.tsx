import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { ServiceUnavailableBanner } from '../components/ui/ServiceUnavailableBanner';

describe('Shared UI States: Skeleton, Empty, Error, and Service Unavailable', () => {
  describe('Skeleton Component', () => {
    it('renders with accessible role="status" and sr-only loading text', () => {
      render(<Skeleton variant="card" count={2} />);
      const statusElement = screen.getByRole('status');
      expect(statusElement).toBeInTheDocument();
      expect(screen.getByText('Loading content, please wait...')).toBeInTheDocument();
    });
  });

  describe('EmptyState Component', () => {
    it('renders title, description and optional action button', () => {
      render(
        <EmptyState
          title="No Transactions Found"
          description="You have not uploaded any bank statements yet."
          action={<button>Upload Now</button>}
        />,
      );

      expect(screen.getByRole('region', { name: 'No Transactions Found' })).toBeInTheDocument();
      expect(screen.getByText('No Transactions Found')).toBeInTheDocument();
      expect(
        screen.getByText('You have not uploaded any bank statements yet.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Upload Now' })).toBeInTheDocument();
    });
  });

  describe('ErrorState Component with Retry', () => {
    it('renders error alert with title and message', () => {
      render(
        <ErrorState
          title="Connection Failure"
          message="Could not reach backend analytics server."
        />,
      );

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(screen.getByText('Connection Failure')).toBeInTheDocument();
      expect(screen.getByText('Could not reach backend analytics server.')).toBeInTheDocument();
    });

    it('triggers onRetry callback when Retry button is clicked', async () => {
      const handleRetry = vi.fn();
      const user = userEvent.setup();

      render(
        <ErrorState
          title="Server Down"
          message="Try again shortly."
          onRetry={handleRetry}
        />,
      );

      const retryBtn = screen.getByRole('button', { name: /retry connection/i });
      await user.click(retryBtn);

      expect(handleRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('ServiceUnavailableBanner Component', () => {
    it('renders degraded service notice and fallback active badge', () => {
      render(
        <ServiceUnavailableBanner
          serviceName="ML Categorization"
          message="Operating on regex rules while model restarts."
        />,
      );

      expect(screen.getByText('ML Categorization Offline (Degraded Service)')).toBeInTheDocument();
      expect(screen.getByText('Fallback Active')).toBeInTheDocument();
      expect(
        screen.getByText('Operating on regex rules while model restarts.'),
      ).toBeInTheDocument();
    });

    it('triggers onRetry when Check Service button is clicked', async () => {
      const handleRetry = vi.fn();
      const user = userEvent.setup();

      render(
        <ServiceUnavailableBanner
          serviceName="RAG Service"
          onRetry={handleRetry}
        />,
      );

      const checkBtn = screen.getByRole('button', { name: /check service/i });
      await user.click(checkBtn);

      expect(handleRetry).toHaveBeenCalledTimes(1);
    });
  });
});
