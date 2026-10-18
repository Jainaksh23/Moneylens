#!/usr/bin/env python3
"""
Generate 2 synthetic sample PDF statements for MoneyLens:
1. docs/sample_bank_statement.pdf - Standard Tabular Bank Account Statement (Date, Narration, Chq/Ref, Withdrawal/Dr, Deposit/Cr, Balance)
2. docs/sample_credit_card_statement.pdf - Standard Credit Card Statement (Transaction Date, Posting Date, Description/Merchant, Amount, Type)
3. docs/sample_scanned_unsupported.pdf - Simulated scanned/image-only PDF with no extractable text to test clear error behavior.
"""

import os
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas


def create_bank_statement(filepath: str):
    doc = SimpleDocTemplate(
        filepath,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36,
    )
    styles = getSampleStyleSheet()
    story = []

    # Header
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#0F172A'),
    )
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#475569'),
    )

    story.append(Paragraph("<b>Apex Synthetic Bank Ltd.</b>", title_style))
    story.append(Paragraph("Account Statement (Digital e-Statement)", subtitle_style))
    story.append(Spacer(1, 10))

    meta_data = [
        ["Account Holder:", "Rahul Sharma", "Account Number:", "XXXXXX9821"],
        ["Customer ID:", "CUST-49102", "Account Type:", "Savings Bank Account"],
        ["Statement Period:", "01-Nov-2025 to 30-Nov-2025", "Currency:", "INR (₹)"],
        ["Branch:", "Indiranagar, Bengaluru", "IFSC Code:", "APEX0004921"],
    ]
    meta_table = Table(meta_data, colWidths=[110, 160, 110, 160])
    meta_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#334155')),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#64748B')),
        ('TEXTCOLOR', (2, 0), (2, -1), colors.HexColor('#64748B')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 15))

    # Statement Table
    table_data = [
        ["Date", "Narration / Description", "Ref / Chq No", "Withdrawal (Dr)", "Deposit (Cr)", "Balance"],
        ["01-11-2025", "SALARY CREDIT - INFOSYS BPM LTD", "NEFT-IN982103", "", "95,000.00", "1,25,400.00"],
        ["01-11-2025", "UPI/53018/CHAAYOS CHAI BANGA/HDFC", "UPI-53018921", "280.00", "", "1,25,120.00"],
        ["02-11-2025", "SWIGGY BANGALORE ORDER FOOD", "POS-7489210", "460.00", "", "1,24,660.00"],
        ["03-11-2025", "HOUSE RENT TRANSFER TO LANDLORD", "IMPS-981203", "22,000.00", "", "1,02,660.00"],
        ["04-11-2025", "ZEPTO 10 MIN QUICK GROCERY", "UPI-9182301", "415.50", "", "1,02,244.50"],
        ["05-11-2025", "HDFC BANK HOME LOAN EMI", "ACH-009182", "18,500.00", "", "83,744.50"],
        ["07-11-2025", "CULT FIT MONTHLY GYM MEMBERSHIP", "CARD-48912", "1,750.00", "", "81,994.50"],
        ["10-11-2025", "BESCOM ELECTRICITY BILL BANGALORE", "BBPS-49102", "1,840.00", "", "80,154.50"],
        ["12-11-2025", "INTEREST CREDIT - Q3 SAVINGS", "INT-849102", "", "645.00", "80,799.50"],
        ["15-11-2025", "AMAZON INDIA ONLINE SHOPPING", "PG-491028", "2,490.00", "", "78,309.50"],
        ["18-11-2025", "APOLLO PHARMACY MEDICINES", "POS-98124", "850.00", "", "77,459.50"],
        ["22-11-2025", "AIRTEL BROADBAND FIBER BILL", "UPI-481920", "1,061.00", "", "76,398.50"],
        ["25-11-2025", "UBER INDIA RIDES BANGALORE", "CARD-9182", "420.00", "", "75,978.50"],
        ["28-11-2025", "DIVIDEND RECEIVED - TCS LTD", "ACH-49102", "", "1,200.00", "77,178.50"],
        ["30-11-2025", "NETFLIX INDIA SUBSCRIPTION", "AUTOPAY-91", "649.00", "", "76,529.50"],
    ]

    tx_table = Table(table_data, colWidths=[65, 185, 80, 70, 70, 70])
    tx_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0F172A')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('ALIGN', (0, 0), (2, -1), 'LEFT'),
        ('ALIGN', (3, 0), (-1, -1), 'RIGHT'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#1E293B')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')]),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))

    story.append(tx_table)
    story.append(Spacer(1, 15))

    footer_style = ParagraphStyle(
        'FooterStyle',
        parent=styles['Normal'],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor('#94A3B8'),
    )
    story.append(Paragraph("This is a computer-generated synthetic statement for MoneyLens testing. No stamp required.", footer_style))

    doc.build(story)
    print(f"Generated bank statement: {filepath}")


def create_credit_card_statement(filepath: str):
    doc = SimpleDocTemplate(
        filepath,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36,
    )
    styles = getSampleStyleSheet()
    story = []

    # Header
    title_style = ParagraphStyle(
        'CardTitle',
        parent=styles['Heading1'],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#1E1B4B'),
    )
    subtitle_style = ParagraphStyle(
        'CardSubtitle',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#4338CA'),
    )

    story.append(Paragraph("<b>Apex Platinum Credit Card</b>", title_style))
    story.append(Paragraph("Monthly Cardmember Statement", subtitle_style))
    story.append(Spacer(1, 10))

    meta_data = [
        ["Cardholder Name:", "Rahul Sharma", "Card Number:", "XXXX-XXXX-XXXX-4912"],
        ["Statement Date:", "05-Dec-2025", "Payment Due Date:", "25-Dec-2025"],
        ["Credit Limit:", "INR 3,00,000.00", "Available Limit:", "INR 2,68,450.00"],
        ["Total Amount Due:", "INR 31,550.00", "Minimum Amount Due:", "INR 1,577.00"],
    ]
    meta_table = Table(meta_data, colWidths=[110, 160, 110, 160])
    meta_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#312E81')),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#6B7280')),
        ('TEXTCOLOR', (2, 0), (2, -1), colors.HexColor('#6B7280')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 15))

    # Transactions Table (Credit Card format: Txn Date, Posting Date, Description/Merchant, Amount, Type)
    table_data = [
        ["Txn Date", "Posting Date", "Transaction Details / Merchant", "Amount (INR)", "Type"],
        ["06-11-2025", "07-11-2025", "ZOMATO RESTAURANT GURGAON", "620.00", "DR"],
        ["08-11-2025", "09-11-2025", "STARBUCKS COFFEE KORAMANGALA", "380.00", "DR"],
        ["10-11-2025", "11-11-2025", "MYNTRA DESIGNS BANGALORE", "2,190.00", "DR"],
        ["12-11-2025", "13-11-2025", "INDIAN OIL PETROL PUMP BANGALORE", "3,000.00", "DR"],
        ["15-11-2025", "16-11-2025", "MAKEMYTRIP FLIGHT TICKETS", "8,450.00", "DR"],
        ["17-11-2025", "18-11-2025", "PAYMENT RECEIVED - THANK YOU", "25,000.00", "CR"],
        ["20-11-2025", "21-11-2025", "APPLE SERVICES COM BILL", "269.00", "DR"],
        ["22-11-2025", "23-11-2025", "BOOKMYSHOW MOVIE TICKETS", "750.00", "DR"],
        ["24-11-2025", "25-11-2025", "CASHBACK PROMO REWARD CREDIT", "150.00", "CR"],
        ["27-11-2025", "28-11-2025", "IKEA HYDERABAD FURNITURE", "12,400.00", "DR"],
        ["30-11-2025", "01-12-2025", "BLINKIT 10 MIN GROCERIES", "641.00", "DR"],
        ["02-12-2025", "03-12-2025", "SWIGGY INSTAMART ORDER", "320.00", "DR"],
        ["03-12-2025", "04-12-2025", "ANNUAL CARD FEE REVERSAL", "1,500.00", "CR"],
    ]

    tx_table = Table(table_data, colWidths=[65, 65, 230, 80, 50])
    tx_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#312E81')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('ALIGN', (0, 0), (2, -1), 'LEFT'),
        ('ALIGN', (3, 0), (3, -1), 'RIGHT'),
        ('ALIGN', (4, 0), (4, -1), 'CENTER'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#1E1B4B')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E0E7FF')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#EEF2FF')]),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))

    story.append(tx_table)
    story.append(Spacer(1, 15))

    footer_style = ParagraphStyle(
        'CardFooter',
        parent=styles['Normal'],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor('#6B7280'),
    )
    story.append(Paragraph("Synthetic credit card statement generated for MoneyLens automated parsing testing.", footer_style))

    doc.build(story)
    print(f"Generated credit card statement: {filepath}")


def create_scanned_unsupported_pdf(filepath: str):
    """
    Simulates a scanned / image-only PDF by drawing a blank/graphic canvas with no extractable text characters.
    """
    c = canvas.Canvas(filepath, pagesize=letter)
    # Draw graphics rectangle and dummy raster lines (no text calls)
    c.setStrokeColor(colors.gray)
    c.rect(50, 50, 500, 700, fill=0)
    c.line(50, 700, 550, 700)
    c.line(50, 650, 550, 650)
    c.showPage()
    c.save()
    print(f"Generated scanned unsupported PDF: {filepath}")


if __name__ == "__main__":
    docs_dir = os.path.join(os.path.dirname(__file__), "..", "docs")
    os.makedirs(docs_dir, exist_ok=True)

    create_bank_statement(os.path.join(docs_dir, "sample_bank_statement.pdf"))
    create_credit_card_statement(os.path.join(docs_dir, "sample_credit_card_statement.pdf"))
    create_scanned_unsupported_pdf(os.path.join(docs_dir, "sample_scanned_unsupported.pdf"))
