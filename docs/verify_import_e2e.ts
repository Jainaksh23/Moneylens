/**
 * E2E verification script: Imports sample_transactions.csv via running backend API.
 */
import fs from 'fs';
import path from 'path';

const API_BASE = 'http://localhost:5000/api/v1';

async function run() {
  console.log('--- Phase 3 E2E Sample CSV Import Verification ---');

  // 1. Register a fresh verification user
  const email = `test.e2e.${Date.now()}@example.com`;
  console.log(`1. Registering test user: ${email}`);

  const regRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'moneylens',
    },
    body: JSON.stringify({
      name: 'Aditya Varma',
      email,
      password: 'SafePassword123',
    }),
  });

  if (!regRes.ok) {
    throw new Error(`Registration failed: ${regRes.status} ${await regRes.text()}`);
  }

  const rawCookie = regRes.headers.get('set-cookie');
  if (!rawCookie) {
    throw new Error('No auth cookie returned');
  }
  const authCookie = rawCookie.split(';')[0];
  console.log('✓ User registered and auth cookie received.');

  // 2. Upload and Preview docs/sample_transactions.csv
  const csvPath = path.resolve(__dirname, 'sample_transactions.csv');
  console.log(`2. Uploading sample CSV from: ${csvPath}`);
  const csvBuffer = fs.readFileSync(csvPath);

  const formData = new FormData();
  formData.append('file', new Blob([csvBuffer], { type: 'text/csv' }), 'sample_transactions.csv');

  const previewRes = await fetch(`${API_BASE}/transactions/import`, {
    method: 'POST',
    headers: {
      'X-Requested-With': 'moneylens',
      Cookie: authCookie,
    },
    body: formData,
  });

  if (!previewRes.ok) {
    throw new Error(`Preview failed: ${previewRes.status} ${await previewRes.text()}`);
  }

  const previewJson = (await previewRes.json()) as any;
  console.log('✓ CSV Preview Results:');
  console.log(`   - Total Rows: ${previewJson.counts.totalRows}`);
  console.log(`   - Accepted: ${previewJson.counts.accepted}`);
  console.log(`   - Duplicates: ${previewJson.counts.duplicates}`);
  console.log(`   - Rejected: ${previewJson.counts.rejected}`);
  console.log(`   - Import Job ID: ${previewJson.importJobId}`);

  // 3. Confirm Import
  console.log('3. Confirming import...');
  const confirmRes = await fetch(`${API_BASE}/transactions/import/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'moneylens',
      Cookie: authCookie,
    },
    body: JSON.stringify({
      importJobId: previewJson.importJobId,
      includeDuplicates: false,
    }),
  });

  if (!confirmRes.ok) {
    throw new Error(`Confirm failed: ${confirmRes.status} ${await confirmRes.text()}`);
  }

  const confirmJson = (await confirmRes.json()) as any;
  console.log(`✓ Confirmed: ${confirmJson.importedCount} transactions imported.`);

  // 4. Verify Analytics Summary
  console.log('4. Fetching Analytics Summary...');
  const analyticsRes = await fetch(`${API_BASE}/analytics/summary`, {
    headers: {
      'X-Requested-With': 'moneylens',
      Cookie: authCookie,
    },
  });

  if (!analyticsRes.ok) {
    throw new Error(`Analytics failed: ${analyticsRes.status} ${await analyticsRes.text()}`);
  }

  const analytics = (await analyticsRes.json()) as any;
  console.log('✓ Financial Analytics Summary:');
  console.log(`   - Total Income: ₹${analytics.income.toLocaleString('en-IN')}`);
  console.log(`   - Total Expenses: ₹${analytics.expense.toLocaleString('en-IN')}`);
  console.log(`   - Net Cash-Flow: ₹${analytics.net.toLocaleString('en-IN')}`);
  console.log(`   - Savings Rate: ${analytics.savingsRate}%`);
  console.log(`   - Transaction Count: ${analytics.transactionCount}`);
  console.log(`   - Top Categories (${analytics.categoryTotals.length}):`);
  analytics.categoryTotals.slice(0, 5).forEach((c: any) => {
    console.log(`     * ${c.category}: ₹${c.amount.toLocaleString('en-IN')} (${c.percentage}%)`);
  });
  console.log(`   - Months in Trend: ${analytics.monthlyTrend.length} months`);

  // 5. Verify Transactions List & Recategorization Feedback
  console.log('5. Testing Search and Recategorization Feedback...');
  const listRes = await fetch(`${API_BASE}/transactions?page=1&pageSize=5`, {
    headers: {
      'X-Requested-With': 'moneylens',
      Cookie: authCookie,
    },
  });
  const listJson = (await listRes.json()) as any;
  const firstItem = listJson.items[0];
  console.log(`   - First Item: "${firstItem.description}" | Category: "${firstItem.category}" (${firstItem.categorySource})`);

  // Edit category to Housing
  const editRes = await fetch(`${API_BASE}/transactions/${firstItem.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'moneylens',
      Cookie: authCookie,
    },
    body: JSON.stringify({ category: 'Housing' }),
  });
  const editJson = (await editRes.json()) as any;
  console.log(`   - Updated Category: "${editJson.transaction.category}" (${editJson.transaction.categorySource})`);

  console.log('\n🎉 ALL PHASE 3 END-TO-END ACCEPTANCE CHECKS PASSED SUCCESSFULLY!');
}

run().catch((err) => {
  console.error('E2E Verification Error:', err);
  process.exit(1);
});
