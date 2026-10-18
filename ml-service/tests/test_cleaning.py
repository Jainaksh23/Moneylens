from app.services.text_cleaning import clean_text, build_feature_text


def test_clean_text_upi_and_vpa():
    raw = "UPI/swiggy@icici/Swiggy order biryani Ref#91823749"
    cleaned = clean_text(raw)
    assert "upi" not in cleaned
    assert "icici" not in cleaned
    assert "swiggy" in cleaned
    assert "biryani" in cleaned
    assert "91823749" not in cleaned


def test_clean_text_pos_and_card_noise():
    raw = "POS 4819 ZEPTOPAY MUMBAI IN"
    cleaned = clean_text(raw)
    assert "pos" not in cleaned
    assert "4819" not in cleaned
    assert "zeptopay" in cleaned


def test_clean_text_neft_salary():
    raw = "NEFT CR-INFOSYS LIMITED-SALARY FOR SEP TXN998811"
    cleaned = clean_text(raw)
    assert "neft" not in cleaned
    assert "infosys" in cleaned
    assert "salary" in cleaned
    assert "998811" not in cleaned


def test_build_feature_text_combines_merchant_and_desc():
    desc = "monthly broadband plan"
    merchant = "Airtel Broadband"
    feature = build_feature_text(desc, merchant)
    assert "airtel" in feature
    assert "broadband" in feature
    assert "monthly" in feature


def test_build_feature_text_unknown_merchant():
    desc = "Auto fuel petrol pump refill"
    feature = build_feature_text(desc, "unknown")
    assert feature == "auto fuel petrol pump refill"
