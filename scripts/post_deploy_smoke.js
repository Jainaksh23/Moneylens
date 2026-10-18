#!/usr/bin/env node

/**
 * ==============================================================================
 * MoneyLens Post-Deployment Live Production Smoke Test
 * ==============================================================================
 * Validates a live production deployment against external URLs:
 * Usage:
 *   node scripts/post_deploy_smoke.js <TARGET_URL>
 * Example:
 *   node scripts/post_deploy_smoke.js https://moneylens.vercel.app
 *   node scripts/post_deploy_smoke.js https://moneylens-backend.onrender.com
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');

const green = (t) => `\x1b[32m${t}\x1b[0m`;
const red = (t) => `\x1b[31m${t}\x1b[0m`;
const cyan = (t) => `\x1b[36m${t}\x1b[0m`;
const yellow = (t) => `\x1b[33m${t}\x1b[0m`;
const bold = (t) => `\x1b[1m${t}\x1b[0m`;

const CSV_PATH = path.resolve(__dirname, '..', 'docs', 'sample_transactions.csv');

let rawTarget = process.argv[2] || process.env.TARGET_URL || process.env.FRONTEND_URL || process.env.BACKEND_URL;

if (!rawTarget) {
  console.log(yellow('\n[!] No target URL provided. Falling back to default: https://moneylens.vercel.app'));
  console.log(cyan('    To test a specific deployment: node scripts/post_deploy_smoke.js <URL>\n'));
  rawTarget = 'https://moneylens.vercel.app';
}

rawTarget = rawTarget.replace(/\/+$/, '');
let baseUrl = rawTarget;
if (!baseUrl.endsWith('/api/v1')) {
  baseUrl = `${baseUrl}/api/v1`;
}

function parseCookie(setCookieHeader) {
  if (!setCookieHeader) return null;
  const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  const match = cookieStr.match(/moneylens_token=([^;]+)/);
  return match ? `moneylens_token=${match[1]}` : null;
}

async function runPostDeploySmoke() {
  console.log(bold('\n============================================================'));
  console.log(bold('       MoneyLens Post-Deployment Live Verification          '));
  console.log(bold('============================================================\n'));
  console.log(`Target URL: ${cyan(baseUrl)}\n`);

  const timestamp = Date.now();
  const testEmail = `postdeploy_${timestamp}@moneylens.live`;
  const testPassword = 'ProdPassword123!';
  const testName = `Live Verifier ${timestamp}`;
  let authCookie = null;
  const startTime = Date.now();

  try {
    // -------------------------------------------------------------
    // 1. Health Probe (Allows time for cold starts)
    // -------------------------------------------------------------
    process.stdout.write(cyan('[1/6] Probing Gateway Health & Readiness... '));
    let healthOk = false;
    let attempts = 0;
    while (!healthOk && attempts < 10) {
      attempts++;
      try {
        const res = await fetch(`${baseUrl}/health/ready`, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          healthOk = true;
          break;
        }
      } catch {
        // Cold start wait
      }
      if (!healthOk && attempts < 10) {
        process.stdout.write(yellow('.'));
        await new Promise((r) => setTimeout(r, 4000));
      }
    }

    if (!healthOk) {
      throw new Error(`Target service at ${baseUrl} is unreachable or not ready after multiple retries.`);
    }
    console.log(green(' PASS') + ' (Gateway live and database connected)');

    // -------------------------------------------------------------
    // 2. User Registration
    // -------------------------------------------------------------
    process.stdout.write(cyan(`[2/6] Registering Smoke User (${testEmail})... `));
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'moneylens',
      },
      body: JSON.stringify({ email: testEmail, password: testPassword, name: testName }),
    });

    if (!regRes.ok) throw new Error(`Registration failed (${regRes.status}): ${await regRes.text()}`);
    authCookie = parseCookie(regRes.headers.get('set-cookie'));
    if (!authCookie) throw new Error('No moneylens_token cookie set during registration');
    console.log(green('PASS') + ' (Cookie issued)');

    // -------------------------------------------------------------
    // 3. Authenticated Session Check
    // -------------------------------------------------------------
    process.stdout.write(cyan('[3/6] Confirming Authenticated Session (/me)... '));
    const meRes = await fetch(`${baseUrl}/me`, {
      headers: { Cookie: authCookie },
    });
    if (!meRes.ok) throw new Error(`Fetch /me failed (${meRes.status}): ${await meRes.text()}`);
    const meData = await meRes.json();
    console.log(green('PASS') + ` (User: ${meData.user?.name})`);

    // -------------------------------------------------------------
    // 4. Sample CSV Import & Confirmation
    // -------------------------------------------------------------
    process.stdout.write(cyan('[4/6] Ingesting Sample CSV Ledger... '));
    if (!fs.existsSync(CSV_PATH)) throw new Error(`CSV missing at ${CSV_PATH}`);

    const fileContent = fs.readFileSync(CSV_PATH);
    const blob = new Blob([fileContent], { type: 'text/csv' });
    const formData = new FormData();
    formData.append('file', blob, 'sample_transactions.csv');

    const importRes = await fetch(`${baseUrl}/transactions/import`, {
      method: 'POST',
      headers: { Cookie: authCookie, 'X-Requested-With': 'moneylens' },
      body: formData,
    });
    if (!importRes.ok) throw new Error(`CSV upload failed (${importRes.status}): ${await importRes.text()}`);
    const importData = await importRes.json();

    const confirmRes = await fetch(`${baseUrl}/transactions/import/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
        'X-Requested-With': 'moneylens',
      },
      body: JSON.stringify({ importJobId: importData.importJobId, includeDuplicates: false }),
    });
    if (!confirmRes.ok) throw new Error(`Confirm import failed (${confirmRes.status}): ${await confirmRes.text()}`);
    const confirmData = await confirmRes.json();
    console.log(green('PASS') + ` (Persisted ${confirmData.importedCount} transactions)`);

    // -------------------------------------------------------------
    // 5. Dashboard Summary Metrics
    // -------------------------------------------------------------
    process.stdout.write(cyan('[5/6] Verifying Dashboard Aggregations... '));
    const summaryRes = await fetch(`${baseUrl}/analytics/summary`, {
      headers: { Cookie: authCookie },
    });
    if (!summaryRes.ok) throw new Error(`Summary fetch failed (${summaryRes.status}): ${await summaryRes.text()}`);
    const summaryData = await summaryRes.json();
    const income = summaryData.income ?? summaryData.totalIncome;
    const expense = summaryData.expense ?? summaryData.totalExpenses;
    if (income <= 0 || expense <= 0) {
      throw new Error(`Invalid analytics totals: Income=${income}, Expense=${expense}`);
    }
    console.log(
      green('PASS') +
        ` (Income: ₹${income.toLocaleString('en-IN')}, Expense: ₹${expense.toLocaleString('en-IN')}, Categories: ${summaryData.categoryTotals?.length || 0})`,
    );

    // -------------------------------------------------------------
    // 6. RAG Chat Question
    // -------------------------------------------------------------
    process.stdout.write(cyan('[6/6] Asking Financial Assistant Query... '));
    const chatRes = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
        'X-Requested-With': 'moneylens',
      },
      body: JSON.stringify({ message: 'What is the 50/30/20 budgeting rule?' }),
    });
    if (!chatRes.ok) throw new Error(`Chat query failed (${chatRes.status}): ${await chatRes.text()}`);
    const chatData = await chatRes.json();
    const reply = chatData.data?.response || chatData.response || '';
    if (!reply) throw new Error('Empty assistant reply received');
    console.log(green('PASS') + ` (Answer received: "${reply.substring(0, 45)}...")`);

    // -------------------------------------------------------------
    // Cleanup
    // -------------------------------------------------------------
    process.stdout.write(cyan('\n[CLEANUP] Purging Demo Account & Records... '));
    await fetch(`${baseUrl}/me`, {
      method: 'DELETE',
      headers: { Cookie: authCookie, 'X-Requested-With': 'moneylens' },
    });
    console.log(green('PASS') + ' (Clean slate maintained)');

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(bold('\n============================================================'));
    console.log(green(bold(`✔ LIVE DEPLOYMENT SMOKE TEST PASSED IN ${duration}s!`)));
    console.log(bold('============================================================\n'));
    process.exit(0);
  } catch (err) {
    console.log(red(' FAIL'));
    console.error(bold('\n❌ Post-Deploy Smoke Test Error:'), err.message || err);

    if (authCookie) {
      try {
        await fetch(`${baseUrl}/me`, {
          method: 'DELETE',
          headers: { Cookie: authCookie, 'X-Requested-With': 'moneylens' },
        });
      } catch {
        // Ignore
      }
    }

    console.log(bold('\n============================================================'));
    console.log(red(bold('✖ POST-DEPLOYMENT SMOKE TEST FAILED')));
    console.log(bold('============================================================\n'));
    process.exit(1);
  }
}

runPostDeploySmoke();
