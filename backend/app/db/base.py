"""
SQLAlchemy async engine and base model.
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy import select
from app.config import settings

from pathlib import Path

# Normalize SQLite database path to ensure seamless resolution from root or backend directories
db_url = settings.DATABASE_URL
if "sqlite" in db_url and ":///" in db_url:
    backend_dir = Path(__file__).resolve().parent.parent.parent
    db_file = db_url.split(":///")[-1]
    if not db_file.startswith("/"):
        clean_name = Path(db_file.lstrip("./")).name
        abs_path = backend_dir / clean_name
        driver = db_url.split(":///")[0]
        db_url = f"{driver}:///{abs_path}"

engine_kwargs = {"echo": settings.DEBUG}
if "sqlite" in db_url:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs.update({
        "pool_size": 20,
        "max_overflow": 10,
        "pool_pre_ping": True,
    })

engine = create_async_engine(
    db_url,
    **engine_kwargs
)

AsyncSessionLocal = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


async def initialize_database() -> None:
    """Create all tables if they do not already exist."""
    import app.models  # noqa: F401
    import hashlib
    import uuid
    from datetime import datetime, timedelta, timezone
    from app.models.farmer import Farmer
    from app.models.diagnosis import CropDiagnosis
    from app.models.disease_telemetry import DiseaseTelemetry
    from app.models.fertilizer import FertilizerRegistry

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        farmer = (await session.execute(select(Farmer).limit(1))).scalar_one_or_none()
        if farmer is None:
            farmer = Farmer(
                id=uuid.uuid4(),
                aadhaar_hash=hashlib.sha256(b"demo-aadhaar").hexdigest(),
                phone_hash=hashlib.sha256(b"demo-phone").hexdigest(),
                full_name="Demo Farmer",
                district_code="UP_LKO",
                state_code="UP",
                preferred_language="hi",
            )
            session.add(farmer)
            session.add(CropDiagnosis(
                id=uuid.uuid4(),
                farmer_id=farmer.id,
                image_hash=hashlib.sha256(b"demo-leaf").hexdigest(),
                disease_name="Yellow Rust",
                disease_name_hi="पीला रतुआ",
                confidence=0.94,
                severity="high",
                crop_type="Wheat",
                district_code="UP_LKO",
            ))

        telemetry = (await session.execute(select(DiseaseTelemetry).limit(1))).scalar_one_or_none()
        if telemetry is None:
            session.add(DiseaseTelemetry(
                id=uuid.uuid4(),
                disease_name="Yellow Rust",
                gps_lat=26.8467,
                gps_lon=80.9462,
                district_code="UP_LKO",
                state_code="UP",
                confidence=0.94,
                severity="high",
                crop_type="Wheat",
            ))

        valid_until = datetime.now(timezone.utc) + timedelta(days=365)
        genuine = (await session.execute(
            select(FertilizerRegistry).where(FertilizerRegistry.barcode == "8901234567890")
        )).scalar_one_or_none()
        if genuine is None:
            session.add(FertilizerRegistry(
                id=uuid.uuid4(),
                product_name="IFFCO Nano Urea (Liquid)",
                manufacturer="Indian Farmers Fertiliser Cooperative (IFFCO)",
                batch_number="DEMO-IFFCO-2026",
                qr_hash=hashlib.sha256(b"demo-genuine-qr").hexdigest(),
                barcode="8901234567890",
                product_type="nano_urea",
                valid_from=datetime.now(timezone.utc) - timedelta(days=30),
                valid_until=valid_until,
                registry_signature="DEMO_SIGNATURE",
            ))

        revoked = (await session.execute(
            select(FertilizerRegistry).where(FertilizerRegistry.barcode == "8901111222233")
        )).scalar_one_or_none()
        if revoked is None:
            session.add(FertilizerRegistry(
                id=uuid.uuid4(),
                product_name="Counterfeit / Blacklisted Batch",
                manufacturer="Unknown / Unauthorized entity",
                batch_number="DEMO-FAKE-2026",
                qr_hash=hashlib.sha256(b"demo-revoked-qr").hexdigest(),
                barcode="8901111222233",
                product_type="urea",
                valid_from=datetime.now(timezone.utc) - timedelta(days=365),
                valid_until=datetime.now(timezone.utc) - timedelta(days=1),
                is_revoked=True,
                revoked_reason="BANNED BATCH: failed registry verification.",
                registry_signature="DEMO_SIGNATURE",
            ))

        await session.commit()


def initialize_database_sync() -> None:
    """Bootstrap DB tables immediately at import time when no loop is running."""
    try:
        import asyncio
        asyncio.get_running_loop()
    except RuntimeError:
        import asyncio
        asyncio.run(initialize_database())


initialize_database_sync()
