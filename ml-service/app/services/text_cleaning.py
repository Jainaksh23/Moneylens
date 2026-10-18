import re
from typing import Optional


# Regex patterns for stripping Indian banking / UPI noise
UPI_PREFIX_PATTERN = re.compile(
    r"\b(upi|pos|ach|neft|imps|cms|nach|rtgs|inb|billpay|paytm|gpay|phonepe)[/:\-\s]+",
    re.IGNORECASE,
)
VPA_PATTERN = re.compile(
    r"[\w\.\-]+@(okaxis|okhdfcbank|okicici|oksbi|paytm|ybl|ibl|upi|axl|apl|barodampay|icici|hdfcbank)",
    re.IGNORECASE,
)
REF_NUMBER_PATTERN = re.compile(
    r"\b(ref|txn|ord|order|id|utr)[#:\-_]+[a-z0-9]+\b|\b(ref|txn|ord|order|id|utr)\s+[a-z0-9]*\d+[a-z0-9]*\b|\b(ref|txn|ord|order|utr)\d+\b",
    re.IGNORECASE,
)
LONG_DIGIT_PATTERN = re.compile(r"\b\d{5,}\b")
SPECIAL_CHARS_PATTERN = re.compile(r"[*\/\\_#:\-\(\)\[\],]")
EXCESS_WHITESPACE_PATTERN = re.compile(r"\s+")


def clean_text(text: str) -> str:
    """
    Cleans raw transaction descriptions and merchant strings.
    Removes UPI/NEFT/IMPS prefixes, VPAs, transaction reference codes,
    long digit strings, and punctuation.
    """
    if not text:
        return ""

    s = text.lower()

    # Remove VPA addresses (e.g., swiggy@icici, user@okhdfcbank)
    s = VPA_PATTERN.sub(" ", s)

    # Remove common banking channel prefixes
    s = UPI_PREFIX_PATTERN.sub(" ", s)

    # Remove transaction / reference code tokens
    s = REF_NUMBER_PATTERN.sub(" ", s)

    # Remove long numeric strings (order IDs, phone numbers, invoice numbers)
    s = LONG_DIGIT_PATTERN.sub(" ", s)

    # Replace special characters with spaces
    s = SPECIAL_CHARS_PATTERN.sub(" ", s)

    # Remove single isolated numbers or short noise
    s = re.sub(r"\b\d+\b", " ", s)

    # Collapse multiple whitespaces
    s = EXCESS_WHITESPACE_PATTERN.sub(" ", s).strip()

    return s


def build_feature_text(description: str, merchant: Optional[str] = None) -> str:
    """
    Combines description and merchant into a single cleaned feature string.
    If merchant is provided and distinct from description, it is given prominence.
    """
    cleaned_desc = clean_text(description)
    cleaned_merch = clean_text(merchant or "")

    if cleaned_merch and cleaned_merch != "unknown":
        if cleaned_merch in cleaned_desc:
            return cleaned_desc
        return f"{cleaned_merch} {cleaned_desc}".strip()

    return cleaned_desc
