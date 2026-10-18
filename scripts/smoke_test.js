#!/usr/bin/env node

/**
 * ==============================================================================
 * MoneyLens Automated End-to-End Container Smoke Test
 * ==============================================================================
 * Verifies the containerized system end-to-end:
 * 1. Health & Database Readiness Probe
 * 2. User Registration & Cookie-based Authentication
 * 3. Authenticated Profile Retrieval (/me)
 * 4. Sample CSV Upload & ML Categorization Preview (/transactions/import)
 * 5. Import Confirmation (/transactions/import/confirm)
 * 6. Dashboard Metrics & Analytics Summary (/analytics/summary)
 * 7. Clean-up Account & Data Deletion
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');

// ANSI formatting helpers
const green = (t) => `\x1b[32m${t}\x1b[0m`;
const red = (t) => `\x1b[31m${t}\x1b[0m`;
const cyan = (t) => `\x1b[36m${t}\x1b[0m`;
const yellow = (t) => `\x1b[33m${t}\x1b[0m`;
const bold = (t) => `\x1b[1m${t}\x1b[0m`;

const CSV_PATH = path.resolve(__dirname, '..', 'docs', 'sample_transactions.csv');

// Parse target URL from CLI argument or environment variable
let targetUrl = process.env.TARGET_URL || process.argv[2];

async function checkUrl(url) {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function discoverApiUrl() {
  if (targetUrl) {
    targetUrl = targetUrl.replace(/\/+$/, '');
    if (!targetUrl.endsWith('/api/v1')) {
      targetUrl = `${targetUrl}/api/v1`;
    }
    return targetUrl;
  }

  // Probe default endpoints: Frontend Nginx proxy (5173) or Backend directly (5000)
  const candidates = [
    'http://localhost:5173/api/v1',
    'http://127.0.0.1:5173/api/v1',
    'http://localhost:5000/api/v1',
    'http://127.0.0.1:5000/api/v1',
  ];

  process.stdout.write(cyan('🔍 Auto-discovering reachable MoneyLens API endpoint...\n'));

  for (const cand of candidates) {
    if (await checkUrl(cand)) {
      console.log(`   ${green('✔')} Found healthy service at ${bold(cand)}`);
      return cand;
    }
  }

  // If not immediately available, retry connecting to default frontend proxy
  console.log(yellow('   Waiting for services to become ready (retrying up to 25s)...'));
  const waitTarget = 'http://localhost:5173/api/v1';
  const startTime = Date.now();
  while (Date.now() - startTime < 25000) {
    if (await checkUrl(waitTarget)) {
      console.log(`   ${green('✔')} Connected to ${bold(waitTarget)}`);
      return waitTarget;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Fallback to localhost:5000 backend directly
  return 'http://localhost:5000/api/v1';
}

function parseCookie(setCookieHeader) {
  if (!setCookieHeader) return null;
  // Handle array of cookies or single string
  const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  const match = cookieStr.match(/moneylens_token=([^;]+)/);
  return match ? `moneylens_token=${match[1]}` : null;
}

async function runSmokeTest() {
  console.log(bold('\n============================================================'));
  console.log(bold('        MoneyLens End-to-End Container Smoke Test           '));
  console.log(bold('============================================================\n'));

  const baseUrl = await discoverApiUrl();
  console.log(`Target API URL: ${cyan(baseUrl)}\n`);

  let authCookie = null;
  const testId = Date.now();
  const testEmail = `smoketest_${testId}@moneylens.internal`;
  const testPassword = 'SmokeTestPass123!';
  const testName = `Smoke Tester ${testId}`;

  try {
    // -------------------------------------------------------------
    // Step 1: Health & Database Readiness Probe
    // -------------------------------------------------------------
    process.stdout.write(cyan('[1/7] Probing Health & Database Readiness... '));
    const healthRes = await fetch(`${baseUrl}/health/ready`);
    if (!healthRes.ok) {
      throw new Error(`Readiness probe failed with status ${healthRes.status}: ${await healthRes.text()}`);
    }
    const healthJson = await healthRes.json();
    if (healthJson.status !== 'ok' || healthJson.checks?.database !== 'connected') {
      throw new Error(`Service not ready: ${JSON.stringify(healthJson)}`);
    }
    console.log(green('PASS') + ` (Database: ${healthJson.checks.database})`);

    // -------------------------------------------------------------
    // Step 2: User Registration
    // -------------------------------------------------------------
    process.stdout.write(cyan(`[2/7] Registering Test User (${testEmail})... `));
    const registerRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'moneylens',
      },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: testName,
      }),
    });

    if (!registerRes.ok) {
      throw new Error(`Registration failed (${registerRes.status}): ${await registerRes.text()}`);
    }

    const regCookieHeader = registerRes.headers.get('set-cookie');
    authCookie = parseCookie(regCookieHeader);
    if (!authCookie) {
      throw new Error('No moneylens_token cookie returned upon registration');
    }
    console.log(green('PASS') + ' (Cookie issued)');

    // -------------------------------------------------------------
    // Step 3: Authenticated Profile Verification
    // -------------------------------------------------------------
    process.stdout.write(cyan('[3/7] Verifying Authenticated Session (/me)... '));
    const meRes = await fetch(`${baseUrl}/me`, {
      headers: {
        Cookie: authCookie,
      },
    });

    if (!meRes.ok) {
      throw new Error(`Profile fetch failed (${meRes.status}): ${await meRes.text()}`);
    }
    const meJson = await meRes.json();
    if (meJson.user?.email !== testEmail) {
      throw new Error(`Returned email ${meJson.user?.email} does not match ${testEmail}`);
    }
    console.log(green('PASS') + ` (User: ${meJson.user.name})`);

    // -------------------------------------------------------------
    // Step 4: Sample CSV Upload & ML Categorization Preview
    // -------------------------------------------------------------
    process.stdout.write(cyan('[4/7] Uploading Sample CSV & Generating ML Preview... '));
    if (!fs.existsSync(CSV_PATH)) {
      throw new Error(`Sample CSV file not found at ${CSV_PATH}`);
    }

    const csvContent = fs.readFileSync(CSV_PATH);
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const formData = new FormData();
    formData.append('file', blob, 'sample_transactions.csv');

    const uploadRes = await fetch(`${baseUrl}/transactions/import`, {
      method: 'POST',
      headers: {
        Cookie: authCookie,
        'X-Requested-With': 'moneylens',
      },
      body: formData,
    });

    if (!uploadRes.ok) {
      throw new Error(`CSV Upload preview failed (${uploadRes.status}): ${await uploadRes.text()}`);
    }

    const uploadJson = await uploadRes.json();
    const importJobId = uploadJson.importJobId;
    const previewCount = uploadJson.counts?.accepted ?? uploadJson.previewCount ?? 0;

    if (!importJobId || previewCount === 0) {
      throw new Error(`Invalid preview response: ${JSON.stringify(uploadJson)}`);
    }
    console.log(green('PASS') + ` (Job: ${importJobId.substring(0, 8)}..., Accepted: ${previewCount})`);

    // -------------------------------------------------------------
    // Step 5: Confirm Transaction Import
    // -------------------------------------------------------------
    process.stdout.write(cyan('[5/7] Confirming Transaction Batch Import... '));
    const confirmRes = await fetch(`${baseUrl}/transactions/import/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
        'X-Requested-With': 'moneylens',
      },
      body: JSON.stringify({
        importJobId,
        includeDuplicates: false,
      }),
    });

    if (!confirmRes.ok) {
      throw new Error(`Confirm import failed (${confirmRes.status}): ${await confirmRes.text()}`);
    }

    const confirmJson = await confirmRes.json();
    const importedCount = confirmJson.importedCount || 0;
    if (importedCount === 0) {
      throw new Error(`No transactions were imported: ${JSON.stringify(confirmJson)}`);
    }
    console.log(green('PASS') + ` (Successfully imported: ${importedCount} records)`);

    // -------------------------------------------------------------
    // Step 6: Dashboard Analytics Verification
    // -------------------------------------------------------------
    process.stdout.write(cyan('[6/7] Querying Dashboard Analytics Summary... '));
    const analyticsRes = await fetch(`${baseUrl}/analytics/summary`, {
      headers: {
        Cookie: authCookie,
      },
    });

    if (!analyticsRes.ok) {
      throw new Error(`Analytics fetch failed (${analyticsRes.status}): ${await analyticsRes.text()}`);
    }

    const analyticsJson = await analyticsRes.json();
    const totalIncome = analyticsJson.income ?? analyticsJson.totalIncome ?? 0;
    const totalExpenses = analyticsJson.expense ?? analyticsJson.totalExpenses ?? 0;
    const categoryTotals = analyticsJson.categoryTotals || analyticsJson.categoryBreakdown || [];

    if (totalIncome <= 0 || totalExpenses <= 0) {
      throw new Error(`Expected non-zero dashboard metrics. Received: Income=${totalIncome}, Expenses=${totalExpenses}`);
    }

    console.log(
      green('PASS') +
        ` (Income: ₹${totalIncome.toLocaleString('en-IN')}, Expenses: ₹${totalExpenses.toLocaleString('en-IN')}, Categories: ${categoryTotals.length})`,
    );

    // -------------------------------------------------------------
    // Step 7: Clean-up Test Data
    // -------------------------------------------------------------
    process.stdout.write(cyan('[7/7] Cleaning up Test User & Transactions... '));
    const cleanupRes = await fetch(`${baseUrl}/me`, {
      method: 'DELETE',
      headers: {
        Cookie: authCookie,
        'X-Requested-With': 'moneylens',
      },
    });

    if (!cleanupRes.ok) {
      console.log(yellow(`WARN (Cleanup returned ${cleanupRes.status})`));
    } else {
      console.log(green('PASS') + ' (All test data purged)');
    }

    console.log(bold('\n============================================================'));
    console.log(green(bold('✔ ALL SMOKE TEST ASSERTIONS PASSED SUCCESSFULLY!')));
    console.log(bold('============================================================\n'));
    process.exit(0);
  } catch (err) {
    console.log(red('FAIL'));
    console.error(bold('\n❌ Smoke Test Error:'), err.message || err);

    // Attempt best-effort cleanup on failure if cookie exists
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
    console.log(red(bold('✖ SMOKE TEST FAILED')));
    console.log(bold('============================================================\n'));
    process.exit(1);
  }
}

runSmokeTest();
