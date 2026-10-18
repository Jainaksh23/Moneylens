#!/usr/bin/env python3
"""
Synthetic transaction generator for MoneyLens.
Generates ~12 months of realistic Indian INR transactions (~600 rows).
Fully seeded and reproducible.
"""

import csv
import os
import random
from datetime import datetime, timedelta

# Fix seed for reproducible results
random.seed(42)

START_DATE = datetime(2025, 11, 1)
END_DATE = datetime(2026, 10, 31)

# Recurring monthly transactions (day_of_month, description, amount, type, merchant)
RECURRING_MONTHLY = [
    (1, "Monthly Salary Credited - Infosys BPM", 95000.00, "credit", "Infosys"),
    (3, "House Rent Payment to Landlord (UPI)", 22000.00, "debit", "Rent"),
    (5, "HDFC Bank Loan EMI Auto-Debit", 18500.00, "debit", "HDFC Bank"),
    (10, "Zerodha Coin Index Fund SIP Auto-Debit", 10000.00, "debit", "Zerodha"),
    (15, "Groww Flexi-Cap Mutual Fund SIP Auto-Debit", 5000.00, "debit", "Groww"),
    (12, "BESCOM Bangalore Electricity Bill", 1680.00, "debit", "BESCOM"),
    (18, "Jio Fiber Broadband 300Mbps Plan", 1179.00, "debit", "Jio"),
    (20, "Airtel Postpaid Family Plan Mobile Bill", 949.00, "debit", "Airtel"),
    (22, "Netflix Premium 4K Monthly Subscription", 649.00, "debit", "Netflix"),
    (25, "Spotify Individual Premium Subscription", 119.00, "debit", "Spotify"),
]

# Random daily transaction pools with typical INR price distributions
EXPENSE_POOLS = [
    # Food & Dining
    [
        ("Swiggy Online Food Order", (180, 750), "Swiggy"),
        ("Zomato Restaurant Delivery", (220, 890), "Zomato"),
        ("Chaayos Chai and Bun Maska", (120, 340), "Chaayos"),
        ("Starbucks Cold Brew & Sandwich", (350, 780), "Starbucks"),
        ("McDonald's Meal Box", (280, 560), "McDonald's"),
        ("Subway 6-inch Sub & Drink", (240, 420), "Subway"),
        ("Third Wave Coffee Roasters", (260, 580), "Third Wave Coffee"),
    ],
    # Groceries & Essentials
    [
        ("Zepto 10-Min Grocery Delivery", (150, 850), "Zepto"),
        ("Blinkit Quick Commerce Delivery", (200, 950), "Blinkit"),
        ("BigBasket Monthly Grocery Basket", (1200, 4200), "BigBasket"),
        ("DMart Supermarket In-Store Purchase", (1500, 5500), "DMart"),
        ("Nature's Basket Organic Fruits & Cheese", (450, 1800), "Nature's Basket"),
        ("Local Mother Dairy Milk and Curd", (60, 220), "Mother Dairy"),
    ],
    # Commute & Travel
    [
        ("Uber Auto / Cab Ride to Office", (80, 480), "Uber"),
        ("Ola Cabs Airport Drop", (550, 1250), "Ola"),
        ("Rapido Bike Taxi Short Commute", (45, 120), "Rapido"),
        ("IRCTC Train Ticket Reservation Tatkal", (450, 2400), "IRCTC"),
        ("MakeMyTrip Weekend Hotel Booking", (2800, 7500), "MakeMyTrip"),
        ("IndiGo Flight Ticket Bangalore-Delhi", (3800, 7200), "IndiGo"),
        ("Namma Metro Smart Card Recharge", (200, 500), "Namma Metro"),
        ("HPCL Petrol Pump Fuel Refill", (500, 2500), "HPCL"),
    ],
    # Shopping & Electronics
    [
        ("Amazon India Online Purchase", (350, 4500), "Amazon"),
        ("Flipkart Big Billion Days Sale Item", (499, 3999), "Flipkart"),
        ("Myntra App Clothing Order", (699, 2800), "Myntra"),
        ("Nykaa Personal Care & Grooming", (350, 1600), "Nykaa"),
        ("Decathlon Sports Gear", (400, 2200), "Decathlon"),
    ],
    # Entertainment & Leisure
    [
        ("BookMyShow IMAX Movie Tickets (2x)", (500, 1400), "BookMyShow"),
        ("Amazon Prime Video Channels Subscription", (299, 599), "Amazon"),
        ("Cult.fit Monthly Fitness Membership", (1499, 2499), "Cult.fit"),
    ],
    # Healthcare & Wellness
    [
        ("Apollo Pharmacy Medicines & Vitamins", (120, 850), "Apollo Pharmacy"),
        ("1mg Diagnostic Lab Blood Test", (650, 1800), "Tata 1mg"),
        ("Dentist Consultation & Cleaning", (800, 1500), "Dental Care"),
    ],
]

# Occasional discretionary credits (cashback, freelance, dividend)
CREDIT_POOLS = [
    ("Cred Credit Card Bill Payment Cashback", (25, 250), "CRED"),
    ("Google Pay Scratch Card Reward", (10, 85), "Google Pay"),
    ("Freelance Consulting Honorarium", (8000, 25000), "Freelance Client"),
    ("Quarterly Stock Dividend Tata Motors", (450, 1850), "CDSL Dividend"),
    ("Reimbursement for Team Lunch", (650, 2200), "Corporate Reimbursement"),
]


def generate_transactions():
    transactions = []

    # 1. Generate monthly recurring transactions
    current_month_start = datetime(START_DATE.year, START_DATE.month, 1)
    while current_month_start <= END_DATE:
        year = current_month_start.year
        month = current_month_start.month

        for day, desc, amt, tx_type, merchant in RECURRING_MONTHLY:
            try:
                tx_date = datetime(year, month, day)
            except ValueError:
                continue

            if START_DATE <= tx_date <= END_DATE:
                # Add slight realistic jitter to bill amounts (+/- 5%)
                final_amt = amt
                if merchant in ["BESCOM", "Airtel"]:
                    jitter = random.uniform(0.92, 1.08)
                    final_amt = round(amt * jitter, 2)

                transactions.append({
                    "date": tx_date.strftime("%Y-%m-%d"),
                    "description": desc,
                    "amount": f"{final_amt:.2f}",
                    "type": tx_type,
                    "merchant": merchant,
                })

        # Advance to next month
        if month == 12:
            current_month_start = datetime(year + 1, 1, 1)
        else:
            current_month_start = datetime(year, month + 1, 1)

    # 2. Generate realistic daily expenses across the year
    total_days = (END_DATE - START_DATE).days + 1
    for day_offset in range(total_days):
        current_day = START_DATE + timedelta(days=day_offset)

        # 0 to 3 transactions per day
        # Weekends have higher probability of dining/shopping
        is_weekend = current_day.weekday() in (5, 6)
        num_txs = random.choices([0, 1, 2, 3], weights=[0.2, 0.4, 0.3, 0.1] if not is_weekend else [0.1, 0.3, 0.4, 0.2])[0]

        for _ in range(num_txs):
            pool = random.choice(EXPENSE_POOLS)
            desc_template, (min_amt, max_amt), merchant = random.choice(pool)

            # Round amount to realistic integer or .50
            raw_amt = random.uniform(min_amt, max_amt)
            if raw_amt > 500:
                amount = float(round(raw_amt / 10) * 10)
            else:
                amount = float(round(raw_amt))

            transactions.append({
                "date": current_day.strftime("%Y-%m-%d"),
                "description": desc_template,
                "amount": f"{amount:.2f}",
                "type": "debit",
                "merchant": merchant,
            })

        # Occasional credits (roughly 2-3 per month)
        if random.random() < 0.08:
            desc, (min_amt, max_amt), merchant = random.choice(CREDIT_POOLS)
            amount = float(round(random.uniform(min_amt, max_amt), 2))
            transactions.append({
                "date": current_day.strftime("%Y-%m-%d"),
                "description": desc,
                "amount": f"{amount:.2f}",
                "type": "credit",
                "merchant": merchant,
            })

    # Sort strictly by date ascending
    transactions.sort(key=lambda x: x["date"])
    return transactions


def main():
    txs = generate_transactions()
    output_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(output_dir, "sample_transactions.csv")

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["date", "description", "amount", "type", "merchant"])
        writer.writeheader()
        writer.writerows(txs)

    print(f"Generated {len(txs)} synthetic transactions saved to: {output_path}")


if __name__ == "__main__":
    main()
