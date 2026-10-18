"""
MoneyLens PDF Statement Parsing Subsystem
Extracts and normalizes transactions from digital text bank and credit card statement PDFs using pdfplumber.
Treats scanned / image-only PDFs and password-protected files with clear, human-readable errors.
"""

import io
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
import pdfplumber


class PdfStatementError(Exception):
    """Base exception for statement parsing errors."""
    def __init__(self, message: str, code: str):
        super().__init__(message)
        self.message = message
        self.code = code


class ScannedPdfUnsupportedError(PdfStatementError):
    """Raised when the uploaded PDF contains no extractable digital text (scanned or image-only)."""
    def __init__(self, message: str = "Scanned or image-only PDF detected. Text extraction requires a digital text PDF statement (OCR is not supported in v1)."):
        super().__init__(message, "SCANNED_PDF_UNSUPPORTED")


class PasswordProtectedPdfError(PdfStatementError):
    """Raised when the uploaded PDF is encrypted or password-protected."""
    def __init__(self, message: str = "Password-protected PDF statements are not currently supported. Please upload an unlocked PDF."):
        super().__init__(message, "PASSWORD_PROTECTED_PDF")


class MalformedPdfError(PdfStatementError):
    """Raised when the PDF file structure is corrupted or unreadable."""
    def __init__(self, message: str = "Unable to process the PDF statement. The file structure is invalid or corrupted."):
        super().__init__(message, "MALFORMED_PDF")


def parse_date_flexible(raw_date: str) -> Optional[str]:
    """
    Parses various date formats common in bank statements and returns ISO YYYY-MM-DD.
    Supported formats:
    - DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
    - YYYY-MM-DD, YYYY/MM/DD
    - DD-MMM-YYYY, DD/MMM/YYYY, DD MMM YYYY (e.g. 01-Nov-2025, 1 Nov 2025)
    - DD-MM-YY, DD/MM/YY
    """
    cleaned = raw_date.strip()
    # Normalize separators
    cleaned = re.sub(r'[\s/.]+', '-', cleaned)

    formats = [
        "%d-%m-%Y",
        "%d-%m-%y",
        "%Y-%m-%d",
        "%d-%b-%Y",
        "%d-%B-%Y",
        "%d-%b-%y",
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(cleaned, fmt)
            # Ensure reasonable year range (2000 to 2050)
            if 2000 <= dt.year <= 2050:
                return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue

    return None


def parse_amount_str(raw: Any) -> Optional[float]:
    """
    Parses an amount string (e.g., '1,25,400.00', '₹450.50', '280.00 DR') into a positive float.
    """
    if raw is None:
        return None
    s = str(raw).strip()
    if not s or s in ['-', '--', 'NA', 'N/A', 'nil', 'Nil']:
        return None

    # Remove currency symbols, commas, DR/CR tokens, plus/minus signs
    s = re.sub(r'[₹$€£,]', '', s)
    s = re.sub(r'\b(DR|CR|Dr|Cr|debit|credit)\b', '', s, flags=re.IGNORECASE)
    s = s.strip()

    try:
        val = float(s)
        return abs(val) if val != 0 else None
    except ValueError:
        return None


def clean_cell_text(cell: Any) -> str:
    """Normalizes cell text by stripping and collapsing linebreaks."""
    if cell is None:
        return ""
    text = str(cell).strip()
    return re.sub(r'\s+', ' ', text)


class PdfStatementParser:
    """
    Extracts tabular or line-based bank and credit card statement transactions from digital PDFs.
    """

    def parse_statement(self, file_bytes: bytes) -> Dict[str, Any]:
        if not file_bytes or len(file_bytes) == 0:
            raise MalformedPdfError("Uploaded PDF file is empty (0 bytes).")

        # 1. Open and verify encryption
        try:
            pdf_stream = io.BytesIO(file_bytes)
            pdf = pdfplumber.open(pdf_stream)
        except Exception as e:
            err_msg = str(e).lower()
            if 'password' in err_msg or 'encrypt' in err_msg:
                raise PasswordProtectedPdfError()
            raise MalformedPdfError(f"Could not open PDF file: {e}")

        with pdf:
            # Check for encryption attribute
            if getattr(pdf, 'is_encrypted', False):
                raise PasswordProtectedPdfError()

            if len(pdf.pages) == 0:
                raise MalformedPdfError("PDF contains no pages.")

            # 2. Check for extractable digital text across all pages
            total_text = ""
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                total_text += page_text + "\n"

            stripped_text = total_text.strip()
            # If total text length across all pages is under 20 characters, it's a scanned/raster PDF
            if len(stripped_text) < 20:
                raise ScannedPdfUnsupportedError()

            # 3. Process tables from all pages
            transactions: List[Dict[str, Any]] = []
            errors: List[Dict[str, Any]] = []
            row_counter = 1

            for page_idx, page in enumerate(pdf.pages):
                tables = page.extract_tables()
                if not tables:
                    # Try text-based line extraction fallback
                    page_txs, page_errs, row_counter = self._parse_from_text_lines(
                        page.extract_text() or "", row_counter
                    )
                    transactions.extend(page_txs)
                    errors.extend(page_errs)
                    continue

                for table in tables:
                    if not table or len(table) < 2:
                        continue

                    page_txs, page_errs, row_counter = self._parse_table(table, row_counter)
                    transactions.extend(page_txs)
                    errors.extend(page_errs)

            # If no transactions could be parsed from tables or text lines
            if len(transactions) == 0 and len(errors) == 0:
                # One last attempt: line-by-line parsing of total text
                page_txs, page_errs, row_counter = self._parse_from_text_lines(total_text, 1)
                transactions.extend(page_txs)
                errors.extend(page_errs)

            if len(transactions) == 0 and len(errors) == 0:
                raise PdfStatementError(
                    "No structured transaction records found in the PDF. Please verify this is a supported bank or credit card statement.",
                    "NO_TRANSACTIONS_FOUND"
                )

            return {
                "success": True,
                "statementType": self._detect_statement_type(total_text),
                "totalExtracted": len(transactions) + len(errors),
                "validRows": len(transactions),
                "errorRows": len(errors),
                "transactions": transactions,
                "errors": errors,
            }

    def _detect_statement_type(self, text: str) -> str:
        lower = text.lower()
        if any(k in lower for k in ['credit card', 'cardmember', 'card statement', 'payment due date', 'credit limit']):
            return "credit_card_statement"
        if any(k in lower for k in ['account statement', 'savings account', 'current account', 'ifsc', 'deposit', 'withdrawal']):
            return "bank_account_statement"
        return "generic_statement"

    def _parse_table(self, table: List[List[Any]], start_row: int) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], int]:
        transactions = []
        errors = []
        current_row = start_row

        # Find header row
        header_idx = -1
        col_map = {}

        for idx, row in enumerate(table):
            cleaned_row = [clean_cell_text(c).lower() for c in row if c]
            joined = " ".join(cleaned_row)

            # Check if this row looks like a table header
            if ('date' in joined) and (
                any(k in joined for k in ['narration', 'description', 'particulars', 'details', 'merchant']) or
                any(k in joined for k in ['withdrawal', 'deposit', 'debit', 'credit', 'amount', 'balance'])
            ):
                header_idx = idx
                col_map = self._map_columns([clean_cell_text(c) for c in row])
                break

        if header_idx == -1 or 'date' not in col_map:
            # Could not identify headers; try heuristic parsing on each row
            return self._heuristic_parse_table(table, current_row)

        # Parse data rows below header
        for r_idx in range(header_idx + 1, len(table)):
            current_row += 1
            row = table[r_idx]
            if not row or all(not str(c).strip() for c in row if c is not None):
                continue

            raw_str = " | ".join(clean_cell_text(c) for c in row if c is not None)

            # Check if row is metadata/summary/page header
            if self._is_skip_row(raw_str):
                continue

            # 1. Date
            date_idx = col_map.get('date', 0)
            raw_date = clean_cell_text(row[date_idx]) if date_idx < len(row) else ""
            parsed_date = parse_date_flexible(raw_date)

            if not parsed_date:
                # If there's no date, check if this is a continued multi-line description from previous row
                if transactions and len(raw_str) > 5 and not any(k in raw_str.lower() for k in ['total', 'balance', 'page']):
                    # Append description to previous transaction
                    transactions[-1]["description"] += f" {raw_str}"
                    continue

                # Not a transaction row (e.g., closing balance or summary)
                if any(k in raw_str.lower() for k in ['opening balance', 'closing balance', 'total', 'carried forward']):
                    continue

                errors.append({
                    "row": current_row,
                    "message": f"Unparseable date '{raw_date}' in transaction row",
                    "raw": raw_str,
                })
                continue

            # 2. Description
            desc_idx = col_map.get('description', 1)
            description = clean_cell_text(row[desc_idx]) if desc_idx < len(row) else ""
            if not description or len(description) < 2:
                # Fallback: look in adjacent columns
                for c_i, cell in enumerate(row):
                    if c_i != date_idx and len(clean_cell_text(cell)) > len(description):
                        description = clean_cell_text(cell)

            if not description:
                description = "Bank Transaction"

            # 3. Amount & Direction
            amount, direction, amt_err = self._extract_amount_and_direction(row, col_map, raw_str)
            if amt_err or amount is None:
                errors.append({
                    "row": current_row,
                    "message": amt_err or "Missing or invalid transaction amount",
                    "raw": raw_str,
                })
                continue

            # 4. Merchant extraction
            merchant = self._extract_merchant(description)

            transactions.append({
                "row": current_row,
                "date": parsed_date,
                "description": description,
                "merchant": merchant,
                "amount": round(amount, 2),
                "direction": direction,
                "type": direction,
                "raw": raw_str,
            })

        return transactions, errors, current_row

    def _map_columns(self, header_row: List[str]) -> Dict[str, int]:
        col_map = {}
        for idx, col in enumerate(header_row):
            c_low = col.lower().strip()
            if 'date' in c_low and 'date' not in col_map:
                col_map['date'] = idx
            elif any(k in c_low for k in ['narration', 'description', 'particulars', 'details', 'merchant']):
                col_map['description'] = idx
            elif any(k in c_low for k in ['withdrawal', 'debit', 'dr']) and 'withdrawal' not in col_map:
                col_map['withdrawal'] = idx
            elif any(k in c_low for k in ['deposit', 'credit', 'cr']) and 'deposit' not in col_map and 'credit limit' not in c_low:
                col_map['deposit'] = idx
            elif 'amount' in c_low and 'amount' not in col_map:
                col_map['amount'] = idx
            elif any(k in c_low for k in ['type', 'cr/dr', 'dr/cr', 'crdror']) and 'type' not in col_map:
                col_map['type'] = idx
            elif 'balance' in c_low and 'balance' not in col_map:
                col_map['balance'] = idx

        return col_map

    def _extract_amount_and_direction(
        self, row: List[Any], col_map: Dict[str, int], raw_str: str
    ) -> Tuple[Optional[float], Optional[str], Optional[str]]:
        # Case A: Separate Withdrawal (Debit) and Deposit (Credit) columns
        if 'withdrawal' in col_map or 'deposit' in col_map:
            w_idx = col_map.get('withdrawal')
            d_idx = col_map.get('deposit')

            w_val = parse_amount_str(row[w_idx]) if (w_idx is not None and w_idx < len(row)) else None
            d_val = parse_amount_str(row[d_idx]) if (d_idx is not None and d_idx < len(row)) else None

            if w_val is not None and w_val > 0:
                return w_val, "expense", None
            if d_val is not None and d_val > 0:
                return d_val, "income", None

        # Case B: Single Amount column with Type or DR/CR indicator
        if 'amount' in col_map:
            amt_idx = col_map['amount']
            raw_cell = clean_cell_text(row[amt_idx]) if amt_idx < len(row) else ""
            amt = parse_amount_str(raw_cell)

            if amt is not None and amt > 0:
                # Check for DR/CR in Type column
                type_idx = col_map.get('type')
                type_val = clean_cell_text(row[type_idx]).upper() if (type_idx is not None and type_idx < len(row)) else ""

                if 'CR' in type_val or 'CREDIT' in type_val or 'CR' in raw_cell.upper():
                    return amt, "income", None
                return amt, "expense", None

        # Case C: Scan all row cells for numeric amounts
        amounts_found = []
        for cell in row:
            parsed = parse_amount_str(cell)
            if parsed is not None and parsed > 0:
                amounts_found.append(parsed)

        if amounts_found:
            # Usually the transaction amount is the first or second amount (balance is usually the last)
            amt = amounts_found[0]
            direction = "income" if any(k in raw_str.upper() for k in ['CR', 'CREDIT', 'REFUND', 'INTEREST', 'SALARY']) else "expense"
            return amt, direction, None

        return None, None, "No valid currency amount identified in row"

    def _heuristic_parse_table(self, table: List[List[Any]], current_row: int) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], int]:
        transactions = []
        errors = []

        for row in table:
            current_row += 1
            if not row:
                continue
            raw_str = " | ".join(clean_cell_text(c) for c in row if c is not None)
            if self._is_skip_row(raw_str):
                continue

            # Look for date in any cell
            date_val = None
            desc_val = ""
            amount_val = None
            direction = "expense"

            for cell in row:
                c_str = clean_cell_text(cell)
                if not date_val:
                    d = parse_date_flexible(c_str)
                    if d:
                        date_val = d
                        continue

                amt = parse_amount_str(c_str)
                if amt is not None and amt > 0 and amount_val is None:
                    amount_val = amt
                    if 'CR' in c_str.upper():
                        direction = "income"
                    continue

                if len(c_str) > len(desc_val):
                    desc_val = c_str

            if date_val and amount_val:
                transactions.append({
                    "row": current_row,
                    "date": date_val,
                    "description": desc_val or "Bank Transaction",
                    "merchant": self._extract_merchant(desc_val),
                    "amount": round(amount_val, 2),
                    "direction": direction,
                    "type": direction,
                    "raw": raw_str,
                })

        return transactions, errors, current_row

    def _parse_from_text_lines(self, text: str, start_row: int) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], int]:
        """
        Fallback parser for statements where pdfplumber tables are not recognized.
        Extracts transaction lines using date and currency regex patterns.
        """
        transactions = []
        errors = []
        current_row = start_row

        lines = text.split("\n")
        # Regex matching dates like DD-MM-YYYY, DD/MM/YYYY, DD-MMM-YYYY
        date_pattern = re.compile(r'\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[-/.\s][A-Za-z]{3}[-/.\s]\d{2,4})\b')
        amount_pattern = re.compile(r'(\b\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?\b)')

        for line in lines:
            current_row += 1
            s_line = line.strip()
            if not s_line or self._is_skip_row(s_line):
                continue

            date_match = date_pattern.search(s_line)
            if not date_match:
                continue

            raw_date = date_match.group(1)
            parsed_date = parse_date_flexible(raw_date)
            if not parsed_date:
                continue

            # Find amounts
            amounts = amount_pattern.findall(s_line)
            # Filter amounts to valid numbers
            valid_amts = []
            for a in amounts:
                parsed_a = parse_amount_str(a)
                if parsed_a and parsed_a > 0:
                    valid_amts.append(parsed_a)

            if not valid_amts:
                errors.append({
                    "row": current_row,
                    "message": "Transaction date detected but amount could not be parsed",
                    "raw": s_line,
                })
                continue

            # First amount is usually txn amount
            amount = valid_amts[0]
            # Clean description by removing date and amounts
            desc = s_line.replace(raw_date, "").strip()
            for a in amounts:
                desc = desc.replace(a, "").strip()

            desc = re.sub(r'\s+', ' ', desc)
            direction = "income" if any(k in s_line.upper() for k in [' CR', 'CREDIT', 'REFUND', 'SALARY', 'INTEREST']) else "expense"

            transactions.append({
                "row": current_row,
                "date": parsed_date,
                "description": desc or "Bank Transaction",
                "merchant": self._extract_merchant(desc),
                "amount": round(amount, 2),
                "direction": direction,
                "type": direction,
                "raw": s_line,
            })

        return transactions, errors, current_row

    def _extract_merchant(self, description: str) -> str:
        """Heuristically extracts merchant/payee name from narration."""
        clean = re.sub(r'^(UPI|NEFT|IMPS|POS|ACH|CARD|BBPS|AUTOPAY)[-/:\s\d]+', '', description, flags=re.IGNORECASE).strip()
        words = clean.split()
        if words:
            return " ".join(words[:3])
        return "Unknown"

    def _is_skip_row(self, s: str) -> bool:
        low = s.lower()
        skip_phrases = [
            'account statement', 'cardmember statement', 'account number', 'statement period',
            'customer id', 'branch', 'ifsc', 'credit limit', 'available limit', 'payment due',
            'minimum amount due', 'page ', 'this is a computer-generated', 'date narration',
            'txn date', 'posting date', 'total amount due'
        ]
        return any(p in low for p in skip_phrases)


pdf_statement_parser = PdfStatementParser()
