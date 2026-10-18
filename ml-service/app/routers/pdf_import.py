from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.schemas.categorize import TransactionPredictItem
from app.security import verify_internal_key
from app.services.categorizer import CategorizerService
from app.services.pdf_statement_parser import (
    MalformedPdfError,
    PasswordProtectedPdfError,
    PdfStatementError,
    ScannedPdfUnsupportedError,
    pdf_statement_parser,
)

router = APIRouter(
    tags=["PDF Statement Parser"],
    dependencies=[Depends(verify_internal_key)],
)


@router.post(
    "/parse/pdf-statement",
    status_code=status.HTTP_200_OK,
    summary="Parse Bank or Credit Card Statement PDF",
    description="Extracts transactions from a digital text statement PDF using pdfplumber and auto-categorizes them. "
    "Rejects scanned/image-only PDFs and password-protected files with descriptive error messages.",
)
async def parse_pdf_statement(file: UploadFile = File(...)):
    # Validate extension
    filename = file.filename or "statement.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must be a PDF document (.pdf).",
        )

    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read uploaded file: {e}",
        )

    try:
        parsed = pdf_statement_parser.parse_statement(content)
    except ScannedPdfUnsupportedError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=e.message,
        )
    except PasswordProtectedPdfError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=e.message,
        )
    except (MalformedPdfError, PdfStatementError) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.message,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error while extracting PDF text: {e}",
        )

    # Auto-categorize extracted transactions
    transactions = parsed.get("transactions", [])
    if transactions:
        categorizer = CategorizerService.get_instance()
        predict_items = [
            TransactionPredictItem(
                id=f"pdf-tx-{idx}",
                description=tx["description"],
                merchant=tx.get("merchant", "unknown"),
            )
            for idx, tx in enumerate(transactions)
        ]
        predictions = categorizer.predict_batch(items=predict_items)
        pred_map = {p.id: p for p in predictions}

        for idx, tx in enumerate(transactions):
            tx_id = f"pdf-tx-{idx}"
            if tx_id in pred_map:
                p = pred_map[tx_id]
                tx["category"] = p.category
                tx["categoryConfidence"] = p.confidence
                tx["needsReview"] = p.needsReview
                tx["modelVersion"] = p.modelVersion
                tx["categorySource"] = "model"
            else:
                tx["category"] = "unknown"
                tx["categoryConfidence"] = None
                tx["needsReview"] = True
                tx["modelVersion"] = None
                tx["categorySource"] = "rules"

    return parsed
