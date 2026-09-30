from sqlalchemy import Uuid, Column, String, DateTime, Enum as SQLEnum
from datetime import datetime, timezone
import uuid
import enum

from app.core.database import Base


class Runtime(str, enum.Enum):
    WEBGPU = "webgpu"
    WASM = "wasm"
    CPU = "cpu"


class ModelType(str, enum.Enum):
    UIDET = "uidet"
    OCR = "ocr"
    NLP = "nlp"


class ModelVersion(Base):
    __tablename__ = "model_versions"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String(255), nullable=False)
    version = Column(String(50), nullable=False)
    runtime = Column(SQLEnum(Runtime), nullable=False)
    model_type = Column(SQLEnum(ModelType), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
