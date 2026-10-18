"""
Generates synthetic, labeled transaction dataset for training the MoneyLens ML categorizer.
Target: ~3,500 balanced rows across 14 categories with realistic Indian banking noise.
"""
import csv
import os
import random
from typing import List, Dict, Any

SEED = 42
random.seed(SEED)

CATEGORIES = [
    "Food",
    "Groceries",
    "Transport",
    "Shopping",
    "Bills & Utilities",
    "Entertainment",
    "Health",
    "Education",
    "Rent",
    "EMI/Loans",
    "Investments/SIP",
    "Travel",
    "Income",
    "Other",
]

CHANNELS = ["UPI", "POS", "NEFT", "IMPS", "ACH", "CMS", "BILLPAY", "NETBANKING"]
VPAS = ["@okaxis", "@okhdfcbank", "@okicici", "@oksbi", "@paytm", "@ybl", "@upi", "@icici"]

CATEGORY_MERCHANTS: Dict[str, List[Dict[str, Any]]] = {
    "Food": [
        {"merchant": "Swiggy", "templates": ["Swiggy food delivery", "Swiggy gourmet dinner order", "Swiggy order biryani", "Swiggy snacks lunch"]},
        {"merchant": "Zomato", "templates": ["Zomato online delivery", "Zomato restaurant dining", "Zomato gold order pizza", "Zomato delivery burger"]},
        {"merchant": "McDonalds", "templates": ["McDonalds family meal combo", "McD drive thru burger", "McDonalds outlet payment"]},
        {"merchant": "Dominos", "templates": ["Dominos pizza delivery", "Dominos cheese burst pizza", "Dominos outlet"]},
        {"merchant": "Starbucks", "templates": ["Starbucks coffee latte", "Starbucks cafe snacks", "Starbucks airport outlet"]},
        {"merchant": "Chai Point", "templates": ["Chai Point tea and samosa", "Chai Point flask delivery", "Chai Point outlet"]},
        {"merchant": "Haldirams", "templates": ["Haldirams sweets snacks lunch", "Haldirams thali dinner", "Haldirams restaurant"]},
        {"merchant": "Barbeque Nation", "templates": ["Barbeque Nation dinner buffet", "BBQ Nation lunch outing", "Barbeque Nation table"]},
        {"merchant": "Subway", "templates": ["Subway salad sub", "Subway roasted chicken combo", "Subway counter"]},
        {"merchant": "Local Cafe", "templates": ["Cafe Mocha cappuccino", "The Roastery coffee shop", "Blue Tokai iced pour over", "Corner bakery breakfast"]},
    ],
    "Groceries": [
        {"merchant": "Zepto", "templates": ["Zepto 10 min groceries delivery", "Zepto daily milk vegetables", "Zepto instant fruits order"]},
        {"merchant": "Blinkit", "templates": ["Blinkit instant grocery", "Blinkit bread eggs butter", "Blinkit household items"]},
        {"merchant": "BigBasket", "templates": ["BigBasket monthly staples", "BB Daily morning milk basket", "BigBasket organic vegetables"]},
        {"merchant": "Instamart", "templates": ["Swiggy Instamart vegetables", "Instamart dairy cold drinks", "Instamart snacks grocery"]},
        {"merchant": "DMart", "templates": ["DMart supermarket ready cart", "Avenue Supermarts DMart groceries", "DMart provisions"]},
        {"merchant": "Natures Basket", "templates": ["Natures Basket gourmet cheese fruits", "Natures Basket imported organic items"]},
        {"merchant": "Reliance Fresh", "templates": ["Reliance Fresh grocery supermarket", "Reliance Smart bazaar shopping"]},
        {"merchant": "Local Kirana", "templates": ["Gupta General Store milk bread", "Sharma Kirana provisions", "Vegetable vendor fresh veggies", "Local fruit stall apples bananas"]},
    ],
    "Transport": [
        {"merchant": "Uber", "templates": ["Uber ride trip fare", "Uber Premier airport ride", "Uber Auto city travel", "Uber Go ride"]},
        {"merchant": "Ola", "templates": ["Ola Cabs city trip", "Ola Auto ride", "Ola Prime sedan booking"]},
        {"merchant": "Rapido", "templates": ["Rapido bike taxi ride", "Rapido auto commute", "Rapido quick transit"]},
        {"merchant": "BluSmart", "templates": ["BluSmart electric cab airport", "BluSmart EV ride city"]},
        {"merchant": "HPCL Petrol", "templates": ["HPCL auto fuel petrol pump", "Hindustan Petroleum fuel fill"]},
        {"merchant": "BPCL Petrol", "templates": ["Bharat Petroleum diesel refuel", "BPCL fuel station payment"]},
        {"merchant": "IOCL Petrol", "templates": ["Indian Oil petrol bunk", "IOCL fuel payment auto"]},
        {"merchant": "FASTag", "templates": ["NHAI FASTag toll auto recharge", "Paytm FASTag plaza toll fee", "ICICI FASTag highway toll"]},
        {"merchant": "Metro Transit", "templates": ["Delhi Metro smart card recharge", "Bangalore Namma Metro topup", "Mumbai Metro ticketing transit"]},
    ],
    "Shopping": [
        {"merchant": "Amazon", "templates": ["Amazon India electronics purchase", "Amazon Marketplace retail order", "Amazon fashion shoes apparel"]},
        {"merchant": "Flipkart", "templates": ["Flipkart Internet online purchase", "Flipkart mobile accessories", "Flipkart electronics"]},
        {"merchant": "Myntra", "templates": ["Myntra apparel fashion kurta", "Myntra sneakers clothing order"]},
        {"merchant": "Ajio", "templates": ["Ajio trends clothing retail", "Ajio fashion summer wear"]},
        {"merchant": "Zara", "templates": ["Zara retail store clothing", "Zara apparel store payment"]},
        {"merchant": "H&M", "templates": ["H&M fashion clothes store", "HM online casual wear"]},
        {"merchant": "Nykaa", "templates": ["Nykaa cosmetics beauty skincare", "Nykaa beauty personal care"]},
        {"merchant": "Decathlon", "templates": ["Decathlon sports gear shoes", "Decathlon outdoor fitness apparel"]},
        {"merchant": "Croma", "templates": ["Croma electronics home appliances", "Croma laptop charger retail"]},
    ],
    "Bills & Utilities": [
        {"merchant": "BESCOM", "templates": ["BESCOM monthly electricity bill payment", "Bangalore electricity board"]},
        {"merchant": "Tata Power", "templates": ["Tata Power residential electricity bill", "Tata Power payment online"]},
        {"merchant": "Adani Electricity", "templates": ["Adani Electricity Mumbai power bill", "Adani Energy monthly dues"]},
        {"merchant": "Airtel Broadband", "templates": ["Airtel Xstream broadband fiber bill", "Airtel postpaid mobile bill"]},
        {"merchant": "JioFiber", "templates": ["JioFiber monthly high speed plan", "Reliance Jio prepaid mobile recharge"]},
        {"merchant": "Mahanagar Gas", "templates": ["MGL piped natural gas cooking bill", "Mahanagar Gas residential bill"]},
        {"merchant": "Indane Gas", "templates": ["Indane LPG cylinder refill booking", "HP Gas cylinder subsidy booking"]},
        {"merchant": "Water Board", "templates": ["BWSSB monthly water supply bill", "Municipal corporation water tariff"]},
    ],
    "Entertainment": [
        {"merchant": "Netflix", "templates": ["Netflix India monthly 4K subscription", "Netflix streaming recurring plan"]},
        {"merchant": "Spotify", "templates": ["Spotify Premium individual recurring", "Spotify music streaming monthly"]},
        {"merchant": "BookMyShow", "templates": ["BookMyShow cinema tickets weekend", "BookMyShow movie ticket IMAX", "BMS concert passes"]},
        {"merchant": "Disney+ Hotstar", "templates": ["Disney Plus Hotstar annual super subscription", "Hotstar IPL streaming pack"]},
        {"merchant": "Prime Video", "templates": ["Amazon Prime yearly membership video", "Prime video subscription"]},
        {"merchant": "YouTube Premium", "templates": ["YouTube Premium family streaming plan", "Google YouTube monthly"]},
        {"merchant": "SonyLIV", "templates": ["SonyLIV entertainment sports pack", "SonyLIV annual streaming plan"]},
        {"merchant": "PVR Inox", "templates": ["PVR Cinemas movie tickets popcorn", "Inox multiplex tickets combo"]},
    ],
    "Health": [
        {"merchant": "Apollo Pharmacy", "templates": ["Apollo Pharmacy prescribed medicines", "Apollo health store vitamins"]},
        {"merchant": "Tata 1mg", "templates": ["Tata 1mg healthcare lab blood test", "1mg online prescription delivery"]},
        {"merchant": "PharmEasy", "templates": ["PharmEasy diabetic medicines order", "PharmEasy health supplements"]},
        {"merchant": "MedPlus", "templates": ["MedPlus medical store antibiotics", "MedPlus health wellness"]},
        {"merchant": "Practo", "templates": ["Practo doctor consultation clinic", "Practo online physician consult fee"]},
        {"merchant": "Lenskart", "templates": ["Lenskart eye eyeglasses lenses frame", "Lenskart contact lenses care"]},
        {"merchant": "Dr Lal PathLabs", "templates": ["Dr Lal PathLabs blood full body checkup", "Metropolis diagnostic pathology test"]},
        {"merchant": "Care Dental Clinic", "templates": ["Dental clinic scaling filling consultation", "Orthodontic treatment dental visit"]},
    ],
    "Education": [
        {"merchant": "Coursera", "templates": ["Coursera specialization learning subscription", "Coursera annual learning pass"]},
        {"merchant": "Udemy", "templates": ["Udemy online python course purchase", "Udemy web development course"]},
        {"merchant": "Byjus", "templates": ["Byjus learning tuition classes fee", "Byjus tablet learning program"]},
        {"merchant": "Unacademy", "templates": ["Unacademy Plus subscription exam coaching", "Unacademy live classes"]},
        {"merchant": "DPS School Fee", "templates": ["Delhi Public School quarterly tuition fee", "DPS school bus fee"]},
        {"merchant": "College Tuition", "templates": ["Semester tuition fees engineering college", "University examination fee"]},
        {"merchant": "Oxford Book Store", "templates": ["Academic textbooks and study material", "Stationery engineering notebooks"]},
    ],
    "Rent": [
        {"merchant": "Landlord Rent", "templates": ["Monthly house rent payment to landlord", "Flat 402 apartment rental transfer", "House rent for current month via IMPS"]},
        {"merchant": "NoBroker Rent", "templates": ["NoBroker Pay residential house rent", "NoBroker monthly rental credit card"]},
        {"merchant": "CRED RentPay", "templates": ["CRED RentPay house owner rent transfer", "CRED monthly apartment rent"]},
        {"merchant": "Society Maintenance", "templates": ["Apartment owners association maintenance dues", "Society monthly maintenance charges"]},
    ],
    "EMI/Loans": [
        {"merchant": "HDFC Home Loan", "templates": ["ACH debit HDFC Bank home loan EMI", "HDFC housing finance monthly installment"]},
        {"merchant": "ICICI Car Loan", "templates": ["NACH ICICI Bank auto loan installment", "ICICI car loan monthly EMI"]},
        {"merchant": "SBI Personal Loan", "templates": ["SBI personal loan EMI auto debit", "State Bank loan installment deduction"]},
        {"merchant": "Bajaj Finserv", "templates": ["Bajaj Finance consumer durable zero cost EMI", "Bajaj Finserv installment"]},
        {"merchant": "Axis Bank Loan", "templates": ["Axis Bank education loan repayment installment", "Axis loan auto debit"]},
    ],
    "Investments/SIP": [
        {"merchant": "Zerodha Coin", "templates": ["Zerodha Broking Coin mutual fund SIP", "Zerodha trading account fund addition"]},
        {"merchant": "Groww MF", "templates": ["Groww Investments equity index mutual fund SIP", "Groww monthly mutual fund debit"]},
        {"merchant": "Kuvera", "templates": ["Kuvera smart SIP direct plan mutual fund", "Kuvera gold ETF purchase"]},
        {"merchant": "PPF Deposit", "templates": ["Public Provident Fund annual contribution", "SBI PPF account deposit"]},
        {"merchant": "NPS Tier 1", "templates": ["National Pension Scheme retirement contribution", "NPS NSDL contribution"]},
    ],
    "Travel": [
        {"merchant": "IRCTC", "templates": ["IRCTC Indian Railway train e-ticket", "IRCTC tatkal express train booking"]},
        {"merchant": "MakeMyTrip", "templates": ["MakeMyTrip round trip flight booking", "MMT domestic hotel stay Goa"]},
        {"merchant": "Goibibo", "templates": ["Goibibo weekend resort booking", "Goibibo domestic flight tickets"]},
        {"merchant": "IndiGo Airlines", "templates": ["IndiGo air ticket New Delhi to Bengaluru", "InterGlobe Aviation IndiGo flight"]},
        {"merchant": "Air India", "templates": ["Air India economy class flight booking", "Air India baggage seat selection"]},
        {"merchant": "RedBus", "templates": ["RedBus AC sleeper interstate bus ticket", "RedBus bus booking"]},
        {"merchant": "Airbnb", "templates": ["Airbnb vacation rental homestay", "Airbnb villa stay booking"]},
    ],
    "Income": [
        {"merchant": "Employer Salary", "templates": ["NEFT CR Infosys Limited salary for month", "TCS monthly salary remuneration credit", "Wipro Limited payroll net salary", "Tech Mahindra employee salary"]},
        {"merchant": "Freelance Client", "templates": ["Client invoice payment consulting development", "Freelance UI UX design milestone payout", "Upwork Escrow USD inward remittance"]},
        {"merchant": "Interest Credit", "templates": ["Quarterly savings bank interest credit", "Fixed deposit quarterly interest payout"]},
        {"merchant": "Dividend Payout", "templates": ["TCS Limited interim dividend payout", "Reliance Industries dividend credit"]},
        {"merchant": "Reimbursement", "templates": ["Company travel expense reimbursement claim", "Medical claims reimbursement credit"]},
    ],
    "Other": [
        {"merchant": "ATM Cash Withdrawal", "templates": ["ATM cash withdrawal HDFC Bank ATM", "Cash withdrawal SBI branch ATM machine", "Cash debit self"]},
        {"merchant": "Bank Charges", "templates": ["Annual debit card fee debit", "SMS alert quarterly charges bank", "Consolidated account maintenance fee", "Minimum balance penalty charges"]},
        {"merchant": "Peer Transfer", "templates": ["Payment to friend split dinner UPI", "Splitwise settlement trip share", "Personal transfer to cousin emergency", "Transfer to contact UPI payment", "Friend repayment loan share"]},
        {"merchant": "Refund Credit", "templates": ["Ecommerce cancelled order refund credit", "Security deposit refund returned", "Reversal of failed transaction"]},
        {"merchant": "Ambiguous Transfer", "templates": ["UPI transfer ref 9812739", "POS retail outlet debit", "IMPS p2a payment", "Merchant transaction generic store", "Misc sundry transfer debit", "General store debit voucher", "Payment to vendor ref 48192"]},
    ],
}


def add_realistic_noise(desc: str, merchant: str, category: str) -> str:
    """
    Applies realistic Indian transaction narrative styling:
    UPI prefixes, VPA handles, reference tags, and casing noise.
    """
    noise_style = random.random()

    # 1. UPI transaction with VPA
    if noise_style < 0.35:
        channel = random.choice(["UPI", "UPI-", "POS"])
        vpa = random.choice(VPAS)
        ref_id = random.randint(10000000, 99999999)
        m_slug = merchant.lower().replace(" ", "")
        return f"{channel}/{m_slug}{vpa}/{desc} Ref#{ref_id}"

    # 2. Bank channel prefix (NEFT/IMPS/ACH/CMS)
    elif noise_style < 0.65:
        channel = random.choice(["NEFT CR-", "IMPS-P2A-", "ACH W/D-", "CMS/BILLPAY/", "INB "])
        ref_id = random.randint(100000, 999999)
        return f"{channel}{desc.upper()} TXN{ref_id}"

    # 3. Card POS or Gateway style
    elif noise_style < 0.85:
        card_digits = random.randint(1000, 9999)
        city = random.choice(["MUMBAI", "BENGALURU", "NEW DELHI", "HYDERABAD", "PUNE", "CHENNAI"])
        return f"POS {card_digits} {desc.upper()} {city} IN"

    # 4. Occasional generic merchant noise (5% chance)
    elif noise_style < 0.90 and category != "Income":
        generic_tokens = ["RETAIL PURCHASE", "MERCHANT OUTLET", "ONLINE GATEWAY", "STORE ORDER"]
        token = random.choice(generic_tokens)
        return f"POS/{token} {desc.split()[-1].upper()} #{random.randint(100, 999)}"

    # 5. Lightly formatted / clean description
    else:
        var = random.choice(["", f" #{random.randint(100, 9999)}", " *Retail"])
        return f"{desc}{var}"


def generate_dataset(total_target: int = 3600) -> List[Dict[str, Any]]:
    rows_per_category = total_target // len(CATEGORIES)
    dataset: List[Dict[str, Any]] = []

    for cat in CATEGORIES:
        merchants = CATEGORY_MERCHANTS.get(cat, [])
        cat_count = 0

        while cat_count < rows_per_category:
            m_info = random.choice(merchants)
            base_template = random.choice(m_info["templates"])
            merchant_name = m_info["merchant"]

            # Generate noisy description
            final_desc = add_realistic_noise(base_template, merchant_name, cat)

            # Assign direction and realistic amount
            if cat == "Income":
                direction = "income"
                amount = round(random.uniform(5000, 150000), 2)
            else:
                direction = "expense"
                if cat in ["Rent", "EMI/Loans"]:
                    amount = round(random.uniform(10000, 60000), 2)
                elif cat in ["Investments/SIP"]:
                    amount = round(random.uniform(2000, 30000), 2)
                elif cat in ["Bills & Utilities"]:
                    amount = round(random.uniform(300, 6000), 2)
                elif cat in ["Food", "Groceries", "Transport"]:
                    amount = round(random.uniform(50, 2500), 2)
                elif cat in ["Entertainment"]:
                    amount = round(random.uniform(199, 1500), 2)
                else:
                    amount = round(random.uniform(200, 15000), 2)

            dataset.append({
                "description": final_desc,
                "merchant": merchant_name,
                "amount": amount,
                "direction": direction,
                "category": cat,
            })
            cat_count += 1

    # Shuffle dataset
    random.shuffle(dataset)
    return dataset


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(script_dir, "..", "data")
    os.makedirs(data_dir, exist_ok=True)

    csv_path = os.path.join(data_dir, "training_transactions.csv")
    dataset = generate_dataset(total_target=3640)

    print(f"Generating synthetic training dataset ({len(dataset)} rows) to: {csv_path}")

    fieldnames = ["description", "merchant", "amount", "direction", "category"]
    with open(csv_path, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(dataset)

    print(f"[SUCCESS] Generated {len(dataset)} balanced training rows across {len(CATEGORIES)} categories.")


if __name__ == "__main__":
    main()
