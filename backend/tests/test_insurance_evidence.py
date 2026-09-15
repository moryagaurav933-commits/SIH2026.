"""
Unit and Integration Tests for Tamper-Evident Insurance Evidence System.
Validates:
1. Hash generation (SHA-256)
2. Submit claim with live camera evidence
3. Server-side SHA-256 calculation (never trusting client)
4. Verification with original file => PASS ("Verified / Evidence not modified")
5. Verification with modified/tampered file => FAIL ("Tampered / Evidence modified")
6. Preservation of existing claim submission and retrieval
"""
import hashlib
import io
import os
import uuid
from datetime import datetime, timezone
import pytest       
import pytest_asyncio
import httpx
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.db.base import Base
from app.db.session import get_db
from app.api.deps import get_current_farmer, get_optional_farmer
from app.models.farmer import Farmer
from app.models.insurance import InsuranceClaim
from app.core.crypto import compute_bytes_hash, compute_file_hash, verify_evidence_hash


TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DB_URL, echo=False)
TestSessionLocal = sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture(autouse=True)
async def setup_test_database():
    """Create in-memory SQLite tables and seed demo farmer for tests."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    # Seed test farmer
    test_farmer_id = uuid.uuid4()
    async with TestSessionLocal() as session:
        farmer = Farmer(
            id=test_farmer_id,
            aadhaar_hash="sha256_mock_aadhaar_001",
            phone_hash="sha256_mock_phone_001",
            full_name="रमेश कुमार (Ramesh Kumar)",
            district_code="UP_LKO",
            state_code="UP",
            preferred_language="hi",
        )
        session.add(farmer)
        await session.commit()

    async def override_get_db():
        async with TestSessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()

    async def override_get_farmer():
        async with TestSessionLocal() as session:
            result = await session.get(Farmer, test_farmer_id)
            return result

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_farmer] = override_get_farmer
    app.dependency_overrides[get_optional_farmer] = override_get_farmer

    yield

    app.dependency_overrides.clear()


def test_sha256_hash_generation():
    """Test SHA-256 calculation for media bytes and files."""
    sample_content = b"EVIDENCE_VIDEO_FRAME_DATA_LUCKNOW_FIELD_2026_09_15"
    expected_hex = hashlib.sha256(sample_content).hexdigest()

    computed_hex = compute_bytes_hash(sample_content)
    assert computed_hex == expected_hex
    assert len(computed_hex) == 64

    # Test file hash
    tmp_path = "uploads/insurance_evidence/test_hash_sample.bin"
    os.makedirs("uploads/insurance_evidence", exist_ok=True)
    with open(tmp_path, "wb") as f:
        f.write(sample_content)

    try:
        file_hex = compute_file_hash(tmp_path)
        assert file_hex == expected_hex
        assert verify_evidence_hash(sample_content, expected_hex) is True
        assert verify_evidence_hash(tmp_path, expected_hex) is True
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@pytest.mark.asyncio
async def test_upload_claim_evidence_calculates_server_hash():
    """Verify that uploading evidence calculates SHA-256 on server and stores claim."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        media_content = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00isommp42RAW_CROP_DAMAGE_FOOTAGE_TEST"
        expected_hash = hashlib.sha256(media_content).hexdigest()

        files = {
            "file": ("hailstorm_wheat_evidence.mp4", io.BytesIO(media_content), "video/mp4")
        }
        data = {
            "claim_type": "hailstorm",
            "crop_name": "गेहूं (Wheat)",
            "policy_number": "PMFBY-UP-2026-TEST01",
            "gps_lat": "26.8467",
            "gps_lon": "80.9462",
            "district_code": "UP_LKO",
        }

        response = await client.post("/api/v1/insurance/claims/upload-evidence", files=files, data=data)
        assert response.status_code == 201
        res_data = response.json()

        assert "id" in res_data
        assert res_data["evidence_video_hash"] == expected_hash
        assert res_data["claim_status"] == "submitted"
        assert res_data["crop_name"] == "गेहूं (Wheat)"
        assert res_data["evidence_video_url"] is not None


@pytest.mark.asyncio
async def test_verification_with_original_file_passes():
    """Verify that checking stored/original evidence yields 'Verified / Evidence not modified'."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        original_media = b"GENUINE_AUTHENTIC_CROP_EVIDENCE_CAMERA_RECORDING_2026"
        expected_hash = hashlib.sha256(original_media).hexdigest()

        # 1. Upload original evidence
        files = {
            "file": ("genuine_crop.mp4", io.BytesIO(original_media), "video/mp4")
        }
        data = {
            "claim_type": "flood",
            "crop_name": "धान (Paddy)",
            "policy_number": "PMFBY-UP-2026-VERIFY-PASS",
        }
        upload_resp = await client.post("/api/v1/insurance/claims/upload-evidence", files=files, data=data)
        assert upload_resp.status_code == 201
        claim_id = upload_resp.json()["id"]

        # 2. Verify evidence stored on server
        verify_resp = await client.get(f"/api/v1/insurance/claims/{claim_id}/verify")
        assert verify_resp.status_code == 200
        result = verify_resp.json()

        assert result["is_valid"] is True
        assert result["status"] == "verified"
        assert result["message"] == "Verified / Evidence not modified"
        assert result["stored_hash"] == expected_hash
        assert result["computed_hash"] == expected_hash
        assert "verified_at" in result
        assert isinstance(result["verified_at"], str)

        # 3. Verify uploaded file matches
        verify_file_resp = await client.post(
            f"/api/v1/insurance/claims/{claim_id}/verify-file",
            files={"file": ("original.mp4", io.BytesIO(original_media), "video/mp4")}
        )
        assert verify_file_resp.status_code == 200
        file_result = verify_file_resp.json()
        assert file_result["is_valid"] is True
        assert file_result["status"] == "verified"
        assert file_result["message"] == "Verified / Evidence not modified"


@pytest.mark.asyncio
async def test_verification_with_tampered_file_fails():
    """Verify that modified media yields 'Tampered / Evidence modified'."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        original_media = b"ORIGINAL_EVIDENCE_BEFORE_TAMPERING_ABC_123"

        # 1. Upload original evidence
        files = {
            "file": ("original_crop.mp4", io.BytesIO(original_media), "video/mp4")
        }
        data = {
            "claim_type": "pest_attack",
            "crop_name": "सरसों (Mustard)",
        }
        upload_resp = await client.post("/api/v1/insurance/claims/upload-evidence", files=files, data=data)
        assert upload_resp.status_code == 201
        claim_info = upload_resp.json()
        claim_id = claim_info["id"]
        stored_file_path = claim_info["evidence_video_url"]

        # 2. Test verifying a tampered file via verify-file endpoint
        tampered_media = b"TAMPERED_EVIDENCE_FORGED_FRAMES_XYZ_789"
        tamper_resp = await client.post(
            f"/api/v1/insurance/claims/{claim_id}/verify-file",
            files={"file": ("tampered.mp4", io.BytesIO(tampered_media), "video/mp4")}
        )
        assert tamper_resp.status_code == 200
        tamper_data = tamper_resp.json()

        assert tamper_data["is_valid"] is False
        assert tamper_data["status"] == "tampered"
        assert tamper_data["message"] == "Tampered / Evidence modified"
        assert tamper_data["stored_hash"] != tamper_data["computed_hash"]

        # 3. Test modifying stored file directly on server disk
        if stored_file_path and os.path.exists(stored_file_path):
            with open(stored_file_path, "wb") as f:
                f.write(b"CORRUPTED_DISK_DATA_BYTES")

            server_verify_resp = await client.get(f"/api/v1/insurance/claims/{claim_id}/verify")
            assert server_verify_resp.status_code == 200
            disk_tamper_data = server_verify_resp.json()

            assert disk_tamper_data["is_valid"] is False
            assert disk_tamper_data["status"] == "tampered"
            assert disk_tamper_data["message"] == "Tampered / Evidence modified"


def test_verify_evidence_hash_function():
    """Test the verify_evidence_hash function directly."""
    # Test with matching hash
    sample_content = b"TEST_EVIDENCE_DATA"
    expected_hash = hashlib.sha256(sample_content).hexdigest()
    assert verify_evidence_hash(sample_content, expected_hash) is True

    # Test with mismatched hash
    wrong_hash = "wrong_hash_1234567890"
    assert verify_evidence_hash(sample_content, wrong_hash) is False


@pytest.mark.asyncio
async def test_existing_claim_submission_and_get():
    """Verify that existing POST /claims and GET /claims continue to function without breaking."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "policy_number": "PMFBY-UP-2026-LEGACY-01",
            "claim_type": "crop_damage",
            "crop_name": "मक्का (Maize)",
            "evidence_video_hash": "a" * 64,
            "evidence_video_url": "https://storage.krishi-saarthi.in/evidence/legacy01.mp4",
            "metadata_signature": "ecdsa_sig_test",
            "gps_lat": 26.85,
            "gps_lon": 80.95,
            "district_code": "UP_LKO",
        }

        # Submit legacy claim
        post_resp = await client.post("/api/v1/insurance/claims", json=payload)
        assert post_resp.status_code == 201
        created = post_resp.json()
        assert created["claim_type"] == "crop_damage"
        assert created["evidence_video_hash"] == "a" * 64

        # List claims
        get_resp = await client.get("/api/v1/insurance/claims")
        assert get_resp.status_code == 200
        claims_list = get_resp.json()
        assert len(claims_list) >= 1
