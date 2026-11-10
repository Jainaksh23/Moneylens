import mongoose from 'mongoose';
import { parseCsvStatement } from '../src/utils/csvStatementParser.js';
import { importService } from '../src/services/importService.js';
import { Transaction } from '../src/models/Transaction.js';
import { computeFingerprint } from '../src/utils/transactionUtils.js';

describe('Robust Bank Statement CSV Parser (Synthetic Fixtures)', () => {
  it('should parse PNB ONE style statement with preamble, split debit/credit, and footer lines', () => {
    const pnbCsv = [
      'PUNJAB NATIONAL BANK',
      'Branch: CONNAUGHT PLACE NEW DELHI',
      'Account Statement for Period: 01/01/2026 to 31/01/2026',
      'Account Number: XXXXXXXXXXXX1234',
      'Opening Balance: 25,000.00',
      '',
      'Txn Date,Value Date,Description,Ref No,Debit,Credit,Balance',
      '01/01/2026,01/01/2026,UPI/1111/ZEPTO GROCERY,REF001,450.00,,24550.00',
      '05/01/2026,05/01/2026,SALARY CREDIT FROM ACME CORP,REF002,,75000.00,99550.00',
      '10/01/2026,10/01/2026,ELECTRICITY BILL BESCOM,REF003,1850.50,,97699.50',
      '15/01/2026,15/01/2026,ATM CASH WITHDRAWAL,REF004,2000.00,,95699.50',
      '',
      'Total Debits: 4,300.50,Total Credits: 75,000.00',
      'Closing Balance: 95,699.50',
      'Generated on 01/02/2026 10:15:00 by PNB ONE NetBanking',
      '*** END OF STATEMENT ***',
    ].join('\n');

    const result = parseCsvStatement(Buffer.from(pnbCsv, 'utf-8'));

    expect(result.detectedHeader.layout).toBe('split_debit_credit');
    expect(result.detectedHeader.headerLineNumber).toBe(7);
    expect(result.errors).toHaveLength(0);
    expect(result.transactions).toHaveLength(4);

    // Row 1: Zepto Debit (expense)
    const t0 = result.transactions[0]!;
    expect(t0.rowNumber).toBe(8);
    expect(t0.direction).toBe('expense');
    expect(t0.amount).toBe(450.0);
    expect(t0.description).toContain('ZEPTO GROCERY');

    // Row 2: Salary Credit (income)
    const t1 = result.transactions[1]!;
    expect(t1.rowNumber).toBe(9);
    expect(t1.direction).toBe('income');
    expect(t1.amount).toBe(75000.0);
    expect(t1.description).toContain('SALARY CREDIT');

    // Row 3: BESCOM Debit (expense)
    const t2 = result.transactions[2]!;
    expect(t2.rowNumber).toBe(10);
    expect(t2.direction).toBe('expense');
    expect(t2.amount).toBe(1850.5);

    // Row 4: ATM Cash (expense)
    const t3 = result.transactions[3]!;
    expect(t3.rowNumber).toBe(11);
    expect(t3.direction).toBe('expense');
    expect(t3.amount).toBe(2000.0);
  });

  it('should parse SBI / HDFC style statement with DD-Mon-YYYY dates and Indian thousands separators', () => {
    const sbiCsv = [
      'State Bank of India',
      'Account Name: SYNTHETIC TEST USER',
      'Txn Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance',
      '01-Jan-2026,01-Jan-2026,SWIGGY BANGALORE,UPI-12345,350.00,,123456.00',
      '15-Jan-2026,15-Jan-2026,DIVIDEND RECEIVED,NEFT-9988,,"1,25,000.00",248456.00',
      '20-Jan-2026,20-Jan-2026,AMAZON INDIA,CARD-4411,"4,999.00",,243457.00',
      'Statement Summary: Total debits and credits calculated',
      'End of statement',
    ].join('\n');

    const result = parseCsvStatement(Buffer.from(sbiCsv, 'utf-8'));

    expect(result.detectedHeader.layout).toBe('split_debit_credit');
    expect(result.detectedHeader.headerLineNumber).toBe(3);
    expect(result.transactions).toHaveLength(3);
    expect(result.errors).toHaveLength(0);

    expect(result.transactions[0]!.amount).toBe(350.0);
    expect(result.transactions[0]!.direction).toBe('expense');

    // 1,25,000.00 Indian numbering
    expect(result.transactions[1]!.amount).toBe(125000.0);
    expect(result.transactions[1]!.direction).toBe('income');

    expect(result.transactions[2]!.amount).toBe(4999.0);
    expect(result.transactions[2]!.direction).toBe('expense');
  });

  it('should parse single amount column with separate Type / Dr-Cr column', () => {
    const csv = [
      'Date,Particulars,Amount,Type',
      '10/02/2026,Cafe Coffee Day,250.00,Debit',
      '11/02/2026,Freelance Payment,15000.00,Credit',
      '12/02/2026,Uber Ride,320.50,Dr',
      '13/02/2026,Friend Return,1000.00,Cr',
    ].join('\n');

    const result = parseCsvStatement(Buffer.from(csv, 'utf-8'));

    expect(result.detectedHeader.layout).toBe('single_amount');
    expect(result.transactions).toHaveLength(4);
    expect(result.errors).toHaveLength(0);

    expect(result.transactions[0]!.direction).toBe('expense');
    expect(result.transactions[0]!.amount).toBe(250.0);

    expect(result.transactions[1]!.direction).toBe('income');
    expect(result.transactions[1]!.amount).toBe(15000.0);

    expect(result.transactions[2]!.direction).toBe('expense');
    expect(result.transactions[2]!.amount).toBe(320.5);

    expect(result.transactions[3]!.direction).toBe('income');
    expect(result.transactions[3]!.amount).toBe(1000.0);
  });

  it('should parse single amount column with embedded Dr/Cr suffix or parentheses', () => {
    const csv = [
      'Date,Description,Amount',
      '01/03/2026,Groceries Kirana,"1,250.00 Dr"',
      '02/03/2026,Consulting Fee,"45,000.00 Cr"',
      '03/03/2026,BookMyShow Tickets,600.00 (Dr)',
    ].join('\n');

    const result = parseCsvStatement(Buffer.from(csv, 'utf-8'));

    expect(result.detectedHeader.layout).toBe('single_amount');
    expect(result.transactions).toHaveLength(3);
    expect(result.transactions[0]!.direction).toBe('expense');
    expect(result.transactions[0]!.amount).toBe(1250.0);

    expect(result.transactions[1]!.direction).toBe('income');
    expect(result.transactions[1]!.amount).toBe(45000.0);

    expect(result.transactions[2]!.direction).toBe('expense');
    expect(result.transactions[2]!.amount).toBe(600.0);
  });

  it('should handle UTF-8 BOM prefix cleanly', () => {
    const rawWithBom =
      '\uFEFF' +
      [
        'Date,Description,Amount,Type',
        '01/01/2026,Monthly Rent,18000.00,Debit',
      ].join('\n');

    const result = parseCsvStatement(Buffer.from(rawWithBom, 'utf-8'));

    expect(result.detectedHeader.headerLineNumber).toBe(1);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]!.description).toBe('Monthly Rent');
    expect(result.transactions[0]!.amount).toBe(18000.0);
    expect(result.transactions[0]!.direction).toBe('expense');
  });

  it('should handle quoted fields containing commas', () => {
    const csv = [
      'Date,Description,Debit,Credit,Balance',
      '05/01/2026,"UPI/54321/ZEPTO, INDIRANAGAR, BANGALORE",420.00,,10000.00',
      '06/01/2026,"SALARY FOR DECEMBER, 2025",,60000.00,70000.00',
    ].join('\n');

    const result = parseCsvStatement(Buffer.from(csv, 'utf-8'));

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]!.description).toBe('UPI/54321/ZEPTO, INDIRANAGAR, BANGALORE');
    expect(result.transactions[0]!.amount).toBe(420.0);
    expect(result.transactions[1]!.description).toBe('SALARY FOR DECEMBER, 2025');
    expect(result.transactions[1]!.amount).toBe(60000.0);
  });

  it('should report row-level errors for unparseable rows without silently dropping them', () => {
    const csv = [
      'Header Preamble Line',
      'Date,Description,Debit,Credit',
      '01/01/2026,Valid Row,100.00,',
      'invalid-date,Broken Date Row,200.00,',
      '02/01/2026,,300.00,', // Missing description
      '03/01/2026,Broken Amount Row,,', // Missing both debit and credit
      '04/01/2026,Conflicting Amounts,50.00,50.00', // Both debit and credit present
      '05/01/2026,Another Valid Row,,500.00',
      'Total: 650.00',
    ].join('\n');

    const result = parseCsvStatement(Buffer.from(csv, 'utf-8'));

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]!.description).toBe('Valid Row');
    expect(result.transactions[1]!.description).toBe('Another Valid Row');

    // 4 broken rows recorded in errors with physical line numbers
    expect(result.errors).toHaveLength(4);
    expect(result.errors[0]!.row).toBe(4);
    expect(result.errors[0]!.message).toContain('Invalid date format');

    expect(result.errors[1]!.row).toBe(5);
    expect(result.errors[1]!.message).toBe('Missing "description" column value');

    expect(result.errors[2]!.row).toBe(6);
    expect(result.errors[2]!.message).toBe('Transaction must have either a debit or credit amount');

    expect(result.errors[3]!.row).toBe(7);
    expect(result.errors[3]!.message).toBe('Row cannot have both debit and credit amounts');
  });

  it('should throw clear error when no transaction table header is found', () => {
    const nonStatement = [
      'This is an arbitrary text file.',
      'It has some notes about banking.',
      'Account opened in 2024.',
      'No tabular data here.',
    ].join('\n');

    expect(() => {
      parseCsvStatement(Buffer.from(nonStatement, 'utf-8'));
    }).toThrow('Could not find the transaction table. Please download the template or upload a standard statement.');
  });

  it('should parse valid transactions even if merchant name contains "Total" word', () => {
    const csv = [
      'Date,Description,Debit,Credit',
      '15/01/2026,Total Energies Fuel Station,1200.00,',
      '16/01/2026,Total Health Pharmacy,450.00,',
      'Total Debits: 1650.00',
      '*** End of Statement ***',
    ].join('\n');

    const result = parseCsvStatement(Buffer.from(csv, 'utf-8'));

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]!.description).toBe('Total Energies Fuel Station');
    expect(result.transactions[0]!.amount).toBe(1200.0);
    expect(result.transactions[1]!.description).toBe('Total Health Pharmacy');
    expect(result.transactions[1]!.amount).toBe(450.0);
    expect(result.errors).toHaveLength(0);
  });

  it('should process full import preview with rule categorization and duplicate detection on PNB ONE statement', async () => {
    const testUserId = new mongoose.Types.ObjectId().toString();

    // Seed an existing transaction in DB to test DB duplicate detection
    const existingTxDate = new Date('2026-01-01T00:00:00+05:30');
    const existingFingerprint = computeFingerprint(testUserId, existingTxDate, 450.0, 'unknown');
    await Transaction.create({
      userId: new mongoose.Types.ObjectId(testUserId),
      date: existingTxDate,
      amount: 450.0,
      direction: 'expense',
      currency: 'INR',
      merchant: 'unknown',
      category: 'Groceries',
      categorySource: 'rule',
      source: 'manual',
      description: 'UPI/1111/ZEPTO GROCERY',
      fingerprint: existingFingerprint,
    });

    const pnbCsv = [
      'PUNJAB NATIONAL BANK',
      'Branch: CONNAUGHT PLACE NEW DELHI',
      'Account Statement for Period: 01/01/2026 to 31/01/2026',
      'Account Number: XXXXXXXXXXXX1234',
      'Opening Balance: 25,000.00',
      '',
      'Txn Date,Value Date,Description,Ref No,Debit,Credit,Balance',
      '01/01/2026,01/01/2026,UPI/1111/ZEPTO GROCERY,REF001,450.00,,24550.00', // duplicate of seeded DB record
      '05/01/2026,05/01/2026,SALARY CREDIT FROM ACME CORP,REF002,,75000.00,99550.00', // accepted
      '05/01/2026,05/01/2026,SALARY CREDIT FROM ACME CORP,REF002,,75000.00,99550.00', // intra-file duplicate of row above
      '08/01/2026,08/01/2026,,REF003,100.00,,99450.00', // rejected: missing description
      'invalid-date,invalid-date,BROKEN DATE,REF004,200.00,,99250.00', // rejected: invalid date
      'Total Debits: 750.00,Total Credits: 150000.00',
      '*** END OF STATEMENT ***',
    ].join('\n');

    const preview = await importService.processPreview(
      testUserId,
      'pnb_statement.csv',
      Buffer.from(pnbCsv, 'utf-8'),
    );

    expect(preview.counts.accepted).toBe(1); // Salary credit
    expect(preview.counts.duplicates).toBe(2); // 1 DB duplicate (Zepto) + 1 intra-file duplicate (Salary)
    expect(preview.counts.rejected).toBe(2); // Missing description + invalid date
    expect(preview.counts.totalRows).toBe(5); // 3 candidates + 2 rejected
    expect(preview.errors).toHaveLength(2);
    expect(preview.errors[0]!.row).toBe(11); // Missing description
    expect(preview.errors[1]!.row).toBe(12); // Invalid date

    // Check categorized candidate
    const acceptedSalary = preview.sampleAccepted[0]!;
    expect(acceptedSalary.category).toBe('Income');
    expect(acceptedSalary.direction).toBe('income');
    expect(acceptedSalary.amount).toBe(75000.0);
  });
});
