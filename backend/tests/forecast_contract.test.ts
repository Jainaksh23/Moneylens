import fs from 'fs';
import path from 'path';
import {
  sanitizeUrl,
  INTERNAL_KEY_HEADER,
  INTERNAL_KEY_ENV_NAME,
} from '../src/config/env.js';
import {
  buildForecastPayload,
  determineForecastMode,
  DailyCashFlowItem,
  MonthlyCashFlowItem,
} from '../src/services/forecastPayloadBuilder.js';

describe('Cash-Flow Forecast Contract & Configuration Drift Tests', () => {
  // =========================================================================
  // 1. ML_SERVICE_URL Sanitization & Production HTTPS Tests
  // =========================================================================
  describe('ML_SERVICE_URL Sanitization', () => {
    it('should trim surrounding whitespace and quotes', () => {
      expect(sanitizeUrl('   "https://ml.moneylens.com"   ')).toBe('https://ml.moneylens.com');
      expect(sanitizeUrl("  'https://ml.moneylens.com'  ")).toBe('https://ml.moneylens.com');
    });

    it('should strip single and multiple trailing slashes', () => {
      expect(sanitizeUrl('https://ml.moneylens.com/')).toBe('https://ml.moneylens.com');
      expect(sanitizeUrl('https://ml.moneylens.com///')).toBe('https://ml.moneylens.com');
      expect(sanitizeUrl('http://localhost:8000/')).toBe('http://localhost:8000');
    });

    it('should handle null/undefined safely', () => {
      expect(sanitizeUrl(undefined)).toBe('');
      expect(sanitizeUrl(null)).toBe('');
    });
  });

  // =========================================================================
  // 2. Internal Key & Header Consistency Cross-Check
  // =========================================================================
  describe('Internal Key Cross-Service Drift Prevention', () => {
    it('backend defines exact header name and env var name', () => {
      expect(INTERNAL_KEY_HEADER).toBe('X-Internal-Key');
      expect(INTERNAL_KEY_ENV_NAME).toBe('INTERNAL_API_KEY');
    });

    it('ml-service app/config.py defines INTERNAL_API_KEY alias', () => {
      const configPyPath = path.resolve(__dirname, '../../ml-service/app/config.py');
      const content = fs.readFileSync(configPyPath, 'utf-8');
      expect(content).toContain('alias="INTERNAL_API_KEY"');
    });

    it('ml-service app/security.py checks X-Internal-Key header alias', () => {
      const securityPyPath = path.resolve(__dirname, '../../ml-service/app/security.py');
      const content = fs.readFileSync(securityPyPath, 'utf-8');
      expect(content).toContain('alias="X-Internal-Key"');
    });
  });

  // =========================================================================
  // 3. Shared Synthetic Fixtures & Payload Builder Contract Tests
  // =========================================================================
  describe('Shared Synthetic Fixtures Contract', () => {
    // Fixture 1: 20-day series (< 2 months, >= 14 days)
    it('20-day series produces short_history payload with bounded horizon and horizonDays', () => {
      const dailySeries: DailyCashFlowItem[] = Array.from({ length: 20 }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        income: i % 10 === 0 ? 2500 : 0,
        expense: 850 + i * 15,
        net: (i % 10 === 0 ? 2500 : 0) - (850 + i * 15),
      }));

      const mode = determineForecastMode(20, 1);
      expect(mode).toBe('short_history');

      const payload = buildForecastPayload(mode, 3, dailySeries);
      expect(payload.mode).toBe('short_history');
      expect(payload.horizon).toBe(3);
      expect(payload.horizonDays).toBe(90);
      expect(payload.dailySeries).toBeDefined();
      expect(payload.dailySeries!.length).toBe(20);
      expect(payload.series).toBeUndefined();

      // Check fields for each daily point
      for (const pt of payload.dailySeries!) {
        expect(pt).toHaveProperty('date');
        expect(pt).toHaveProperty('income');
        expect(pt).toHaveProperty('expense');
        expect(pt).toHaveProperty('net');
        expect(typeof pt.income).toBe('number');
        expect(typeof pt.expense).toBe('number');
        expect(typeof pt.net).toBe('number');
      }
    });

    // Fixture 2: 29-day series (< 60 days, e.g. user with 29 days of transactions)
    it('29-day series produces short_history payload with valid 3M and 6M horizon mappings', () => {
      const dailySeries: DailyCashFlowItem[] = Array.from({ length: 29 }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        income: i % 7 === 0 ? 3200 : 0,
        expense: 750 + i * 20,
        net: (i % 7 === 0 ? 3200 : 0) - (750 + i * 20),
      }));

      const mode = determineForecastMode(29, 1);
      expect(mode).toBe('short_history');

      // Test 3M horizon mapping: horizon = 3, horizonDays = 90
      const payload3M = buildForecastPayload(mode, 3, dailySeries);
      expect(payload3M.mode).toBe('short_history');
      expect(payload3M.horizon).toBe(3);
      expect(payload3M.horizonDays).toBe(90);
      expect(payload3M.dailySeries).toBeDefined();
      expect(payload3M.dailySeries!.length).toBe(29);
      expect(payload3M.series).toBeUndefined();

      // Test 6M horizon mapping: horizon = 6, horizonDays = 180 (capped at 180)
      const payload6M = buildForecastPayload(mode, 6, dailySeries);
      expect(payload6M.mode).toBe('short_history');
      expect(payload6M.horizon).toBe(6);
      expect(payload6M.horizonDays).toBe(180);
      expect(payload6M.dailySeries!.length).toBe(29);

      // Verify date format and number types
      for (const pt of payload3M.dailySeries!) {
        expect(pt.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(typeof pt.income).toBe('number');
        expect(typeof pt.expense).toBe('number');
        expect(typeof pt.net).toBe('number');
      }
    });

    // Fixture 3: 35-day series (< 60 days)
    it('35-day series produces short_history payload spanning two months', () => {
      const dailySeries: DailyCashFlowItem[] = [
        ...Array.from({ length: 31 }, (_, i) => ({
          date: `2026-01-${String(i + 1).padStart(2, '0')}`,
          income: i in [0, 14] ? 3000 : 0,
          expense: 900 + i * 10,
          net: (i in [0, 14] ? 3000 : 0) - (900 + i * 10),
        })),
        ...Array.from({ length: 4 }, (_, i) => ({
          date: `2026-02-${String(i + 1).padStart(2, '0')}`,
          income: i === 0 ? 3000 : 0,
          expense: 950,
          net: (i === 0 ? 3000 : 0) - 950,
        })),
      ];

      const mode = determineForecastMode(35, 2);
      expect(mode).toBe('short_history');

      const payload = buildForecastPayload(mode, 3, dailySeries);
      expect(payload.mode).toBe('short_history');
      expect(payload.dailySeries!.length).toBe(35);
    });

    // Fixture 3: 3-month series (2-5 months)
    it('3-month series produces monthly_baseline payload with series array', () => {
      const monthlySeries: MonthlyCashFlowItem[] = [
        { month: '2026-01', net: 12500 },
        { month: '2026-02', net: 14200 },
        { month: '2026-03', net: 11800 },
      ];

      const mode = determineForecastMode(90, 3);
      expect(mode).toBe('monthly_baseline');

      const payload = buildForecastPayload(mode, 3, undefined, monthlySeries);
      expect(payload.mode).toBe('monthly_baseline');
      expect(payload.horizon).toBe(3);
      expect(payload.series).toBeDefined();
      expect(payload.series!.length).toBe(3);
      expect(payload.dailySeries).toBeUndefined();

      for (const pt of payload.series!) {
        expect(pt).toHaveProperty('month');
        expect(pt).toHaveProperty('net');
        expect(typeof pt.net).toBe('number');
      }
    });

    // Fixture 4: 8-month series (>= 6 months)
    it('8-month series produces monthly_standard payload', () => {
      const monthlySeries: MonthlyCashFlowItem[] = Array.from({ length: 8 }, (_, i) => ({
        month: `2025-${String(i + 1).padStart(2, '0')}`,
        net: 15000 + i * 400,
      }));

      const mode = determineForecastMode(240, 8);
      expect(mode).toBe('monthly_standard');

      const payload = buildForecastPayload(mode, 3, undefined, monthlySeries);
      expect(payload.mode).toBe('monthly_standard');
      expect(payload.horizon).toBe(3);
      expect(payload.series!.length).toBe(8);
      expect(payload.dailySeries).toBeUndefined();
    });

    // Horizon and horizonDays boundary clamping
    it('clamps horizon between 1 and 12 and horizonDays <= 180', () => {
      // Horizon > 12 clamped to 12
      const payloadHigh = buildForecastPayload('short_history', 15, []);
      expect(payloadHigh.horizon).toBe(12);
      expect(payloadHigh.horizonDays).toBe(180); // Capped at 180 (le=180 in Pydantic schema)

      // Horizon < 1 clamped to 1
      const payloadLow = buildForecastPayload('short_history', 0, []);
      expect(payloadLow.horizon).toBe(1);
      expect(payloadLow.horizonDays).toBe(30);
    });
  });
});
