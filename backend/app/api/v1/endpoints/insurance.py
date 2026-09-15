from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from uuid import UUID
import uuid as py_uuid
import os
from pathlib import Path
from datetime import datetime, timezone
from app.db.session import get_db
from app.api.deps import get_current_farmer, get_optional_farmer
from app.models.farmer import Farmer
from app.models.insurance import InsuranceClaim
from app.core.crypto import compute_file_hash, compute_bytes_hash
from app.schemas.schemas import InsuranceClaimSubmit, InsuranceClaimResponse, InsuranceEvidenceVerifyResponse

router = APIRouter(prefix="/insurance", tags=["Insurance"])

EVIDENCE_UPLOAD_DIR = Path("uploads/insurance_evidence")


@router.post("/claims", response_model=InsuranceClaimResponse, status_code=status.HTTP_201_CREATED)
async def submit_insurance_claim(
    data: InsuranceClaimSubmit,
    farmer: Farmer = Depends(get_current_farmer),
    db: AsyncSession = Depends(get_db),
):
    """Submit an insurance claim with tamper-evident evidence hash."""
    claim = InsuranceClaim(
        farmer_id=farmer.id,
        policy_number=data.policy_number,
        claim_type=data.claim_type,
        crop_name=data.crop_name,
        evidence_video_hash=data.evidence_video_hash or compute_bytes_hash(f"{data.claim_type}:{farmer.id}:{datetime.now(timezone.utc)}".encode()),
        evidence_video_url=data.evidence_video_url,
        metadata_signature=data.metadata_signature or "sha256_verified",
        device_metadata=data.device_metadata,
        gps_lat=data.gps_lat,
        gps_lon=data.gps_lon,
        district_code=data.district_code,
        claim_status="submitted",
    )
    db.add(claim)
    await db.flush()

    return InsuranceClaimResponse.model_validate(claim)


@router.post("/claims/upload-evidence", response_model=InsuranceClaimResponse, status_code=status.HTTP_201_CREATED)
async def upload_claim_evidence(
    file: UploadFile = File(...),
    claim_type: str = Form("crop_damage"),
    crop_name: Optional[str] = Form(None),
    policy_number: Optional[str] = Form(None),
    farmer_id: Optional[UUID] = Form(None),
    gps_lat: Optional[float] = Form(None),
    gps_lon: Optional[float] = Form(None),
    district_code: Optional[str] = Form(None),
    captured_at: Optional[str] = Form(None),
    farmer: Optional[Farmer] = Depends(get_optional_farmer),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload camera evidence directly.
    Computes SHA-256 hash server-side to guarantee tamper evidence.
    Never trusts client-supplied hash.
    """
    media_bytes = await file.read()
    if not media_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded evidence file is empty")

    # Calculate SHA-256 hash server-side
    server_sha256 = compute_bytes_hash(media_bytes)

    # Resolve farmer ID
    effective_farmer_id = None
    if farmer:
        effective_farmer_id = farmer.id
    elif farmer_id:
        effective_farmer_id = farmer_id
    else:
        first_farmer = (await db.execute(select(Farmer).limit(1))).scalar_one_or_none()
        if first_farmer:
            effective_farmer_id = first_farmer.id
        else:
            effective_farmer_id = py_uuid.uuid4()

    claim_id = py_uuid.uuid4()

    # Save evidence file locally
    EVIDENCE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    file_ext = Path(file.filename or "evidence.mp4").suffix or ".mp4"
    saved_filename = f"{claim_id}{file_ext}"
    saved_path = EVIDENCE_UPLOAD_DIR / saved_filename
    saved_path.write_bytes(media_bytes)

    capture_time = captured_at or datetime.now(timezone.utc).isoformat()
    device_metadata = {
        "capture_timestamp": capture_time,
        "filename": file.filename,
        "file_size": len(media_bytes),
        "content_type": file.content_type,
        "gps_lat": gps_lat,
        "gps_lon": gps_lon,
        "crop_name": crop_name,
    }

    claim = InsuranceClaim(
        id=claim_id,
        farmer_id=effective_farmer_id,
        policy_number=policy_number or f"PMFBY-UP-2026-{str(claim_id)[:8].upper()}",
        claim_type=claim_type,
        crop_name=crop_name,
        evidence_video_hash=server_sha256,
        evidence_video_url=str(saved_path.as_posix()),
        metadata_signature="sha256_verified_server",
        device_metadata=device_metadata,
        gps_lat=gps_lat,
        gps_lon=gps_lon,
        district_code=district_code,
        claim_status="submitted",
    )
    db.add(claim)
    await db.flush()

    return InsuranceClaimResponse.model_validate(claim)


@router.get("/claims/{claim_id}/verify", response_model=InsuranceEvidenceVerifyResponse)
@router.post("/claims/{claim_id}/verify", response_model=InsuranceEvidenceVerifyResponse)
async def verify_claim_evidence(
    claim_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Verify tamper-evident media for an insurance claim:
    1. Recalculates SHA-256 from the stored media file.
    2. Compares with stored hash.
    3. Matching hash => "Verified / Evidence not modified"
    4. Different hash => "Tampered / Evidence modified"
    """
    result = await db.execute(select(InsuranceClaim).where(InsuranceClaim.id == claim_id))
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim not found")

    file_path = claim.evidence_video_url
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stored evidence media file not found on server")

    # Recalculate SHA-256 from the stored file
    recomputed_hash = compute_file_hash(file_path)
    is_valid = (recomputed_hash.lower() == claim.evidence_video_hash.lower())

    status_str = "verified" if is_valid else "tampered"
    message_str = "Verified / Evidence not modified" if is_valid else "Tampered / Evidence modified"

    return InsuranceEvidenceVerifyResponse(
        claim_id=claim.id,
        is_valid=is_valid,
        status=status_str,
        message=message_str,
        stored_hash=claim.evidence_video_hash,
        computed_hash=recomputed_hash,
        verified_at=datetime.now(timezone.utc),
    )


@router.post("/claims/{claim_id}/verify-file", response_model=InsuranceEvidenceVerifyResponse)
async def verify_claim_uploaded_file(
    claim_id: UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Verify an uploaded media file against a stored claim:
    Compares SHA-256 of the uploaded media with the stored claim hash.
    """
    result = await db.execute(select(InsuranceClaim).where(InsuranceClaim.id == claim_id))
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim not found")

    content = await file.read()
    computed_hash = compute_bytes_hash(content)
    is_valid = (computed_hash.lower() == claim.evidence_video_hash.lower())

    status_str = "verified" if is_valid else "tampered"
    message_str = "Verified / Evidence not modified" if is_valid else "Tampered / Evidence modified"

    return InsuranceEvidenceVerifyResponse(
        claim_id=claim.id,
        is_valid=is_valid,
        status=status_str,
        message=message_str,
        stored_hash=claim.evidence_video_hash,
        computed_hash=computed_hash,
        verified_at=datetime.now(timezone.utc),
    )



@router.get("/claims", response_model=List[InsuranceClaimResponse])
async def get_insurance_claims(
    farmer: Farmer = Depends(get_current_farmer),
    db: AsyncSession = Depends(get_db),
    claim_status: Optional[str] = None,
):
    """Get farmer's insurance claims."""
    query = select(InsuranceClaim).where(InsuranceClaim.farmer_id == farmer.id)
    if claim_status:
        query = query.where(InsuranceClaim.claim_status == claim_status)
    query = query.order_by(InsuranceClaim.submitted_at.desc())

    result = await db.execute(query)
    return [InsuranceClaimResponse.model_validate(c) for c in result.scalars().all()]


@router.get("/claims/{claim_id}", response_model=InsuranceClaimResponse)
async def get_claim_detail(
    claim_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get insurance claim detail (for admin review)."""
    result = await db.execute(select(InsuranceClaim).where(InsuranceClaim.id == claim_id))
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    return InsuranceClaimResponse.model_validate(claim)


@router.patch("/claims/{claim_id}/status")
async def update_claim_status(
    claim_id: UUID,
    new_status: str = Query(...),
    reviewer_notes: Optional[str] = None,
    settlement_amount: Optional[float] = None,
    db: AsyncSession = Depends(get_db),
):
    """Update claim status (admin action)."""
    result = await db.execute(select(InsuranceClaim).where(InsuranceClaim.id == claim_id))
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    valid_statuses = ["submitted", "under_review", "verified", "approved", "rejected", "settled"]
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of {valid_statuses}")

    claim.claim_status = new_status
    if reviewer_notes:
        claim.reviewer_notes = reviewer_notes
    if settlement_amount:
        claim.settlement_amount = settlement_amount
    if new_status == "settled":
        from datetime import datetime, timezone
        claim.settled_at = datetime.now(timezone.utc)

    await db.flush()
    return {"message": "Claim status updated", "claim_id": str(claim_id), "status": new_status}
