from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from enum import Enum
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict
from sqlalchemy import and_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import (
    Anomaly,
    Cluster,
    Company,
    DetectionMethod,
    Field,
    MethodConfig,
    Rig,
    RigState,
    Sensor,
    SensorType,
    Telemetry,
    Well,
)


class EntityPayload(BaseModel):
    model_config = ConfigDict(extra="allow")


class AnomalyPointPayload(BaseModel):
    param: str
    timestamp: float | int | str
    value: float | int | str | None = None


class SaveAnomaliesPayload(BaseModel):
    rig_id: int
    method: str
    window_size: int
    threshold: float
    anomalies: list[AnomalyPointPayload]


def _coerce_value(value: Any, target_type: type) -> Any:
    if value is None:
        return None
    if isinstance(target_type, type) and issubclass(target_type, Enum):
        if isinstance(value, target_type):
            return value
        return target_type(value)
    if target_type is datetime and isinstance(value, str):
        return datetime.fromisoformat(value)
    if target_type is int and not isinstance(value, int):
        return int(value)
    if target_type is float and not isinstance(value, (int, float)):
        return float(value)
    return value


def _coerce_payload(model: type, payload: dict[str, Any], *, skip_fields: set[str] | None = None) -> dict[str, Any]:
    skip_fields = skip_fields or set()
    columns = model.__table__.columns
    cleaned: dict[str, Any] = {}

    for key, value in payload.items():
        if key in skip_fields:
            continue
        if key not in columns:
            continue

        column = columns[key]
        try:
            python_type = column.type.python_type
            cleaned[key] = _coerce_value(value, python_type)
        except NotImplementedError:
            cleaned[key] = value

    return cleaned


def _parse_pk(raw: str, pk_type: type) -> Any:
    try:
        if pk_type is int:
            return int(raw)
        return raw
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Invalid id format: {raw}") from exc


def _serialize(row: Any) -> dict[str, Any]:
    data: dict[str, Any] = {}
    for column in row.__table__.columns:
        data[column.name] = getattr(row, column.name)
    return jsonable_encoder(data)


def _excel_serial_to_datetime(serial: float | int) -> datetime:
    # Keep conversion aligned with frontend excelSerialToJsDate utility.
    days_before_1970 = 25569
    unix_epoch = datetime(1970, 1, 1)
    return unix_epoch + timedelta(days=float(serial) - days_before_1970 + 1)


def _parse_anomaly_timestamp(raw_value: float | int | str) -> datetime:
    if isinstance(raw_value, (float, int)):
        return _excel_serial_to_datetime(raw_value)

    raw = str(raw_value).strip()
    if not raw:
        raise ValueError("timestamp is empty")

    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        try:
            return _excel_serial_to_datetime(float(raw.replace(",", ".")))
        except ValueError as exc:
            raise ValueError(f"timestamp '{raw_value}' has unsupported format") from exc


def _to_decimal(value: float | int | str | None) -> Decimal:
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value).replace(",", "."))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"value '{value}' is not numeric") from exc


def build_crud_router(*, model: type, path: str, pk_field: str = "id", pk_type: type = int) -> APIRouter:
    router = APIRouter(prefix=f"/{path}", tags=[f"CRUD {path}"])

    @router.get("")
    async def list_items(db: AsyncSession = Depends(get_db)):
        result = await db.execute(select(model))
        rows = result.scalars().all()
        return [_serialize(row) for row in rows]

    @router.get("/{item_id}")
    async def get_item(item_id: str, db: AsyncSession = Depends(get_db)):
        pk_value = _parse_pk(item_id, pk_type)
        result = await db.execute(select(model).where(getattr(model, pk_field) == pk_value))
        row = result.scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail=f"{path} item not found")
        return _serialize(row)

    @router.post("", status_code=201)
    async def create_item(payload: EntityPayload, db: AsyncSession = Depends(get_db)):
        data = _coerce_payload(model, payload.model_dump(), skip_fields={pk_field})
        row = model(**data)
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return _serialize(row)

    @router.put("/{item_id}")
    async def update_item(item_id: str, payload: EntityPayload, db: AsyncSession = Depends(get_db)):
        pk_value = _parse_pk(item_id, pk_type)
        result = await db.execute(select(model).where(getattr(model, pk_field) == pk_value))
        row = result.scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail=f"{path} item not found")

        updates = _coerce_payload(model, payload.model_dump(), skip_fields={pk_field})
        for key, value in updates.items():
            setattr(row, key, value)

        await db.commit()
        await db.refresh(row)
        return _serialize(row)

    @router.patch("/{item_id}")
    async def patch_item(item_id: str, payload: EntityPayload, db: AsyncSession = Depends(get_db)):
        return await update_item(item_id, payload, db)

    @router.delete("/{item_id}", status_code=204)
    async def delete_item(item_id: str, db: AsyncSession = Depends(get_db)):
        pk_value = _parse_pk(item_id, pk_type)
        result = await db.execute(select(model).where(getattr(model, pk_field) == pk_value))
        row = result.scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail=f"{path} item not found")

        await db.delete(row)
        await db.commit()
        return None

    return router


router = APIRouter(prefix="/entities", tags=["Entities"])

entity_configs = [
    ("companies", Company, "company_id", int),
    ("fields", Field, "field_id", int),
    ("clusters", Cluster, "cluster_id", int),
    ("rigs", Rig, "rig_id", int),
    ("wells", Well, "well_id", int),
    ("rig-states", RigState, "rig_state_id", int),
    ("sensor-types", SensorType, "sensor_type_id", int),
    ("sensors", Sensor, "sensor_id", int),
    ("telemetry", Telemetry, "telemetry_id", int),
    ("detection-methods", DetectionMethod, "method_id", int),
    ("method-configs", MethodConfig, "method_config_id", int),
    ("anomalies", Anomaly, "anomaly_id", int),
]

for path, model, pk_field, pk_type in entity_configs:
    router.include_router(
        build_crud_router(model=model, path=path, pk_field=pk_field, pk_type=pk_type)
    )


@router.post("/anomalies/save-batch")
async def save_anomalies_batch(payload: SaveAnomaliesPayload, db: AsyncSession = Depends(get_db)):
    if not payload.anomalies:
        raise HTTPException(status_code=400, detail="anomalies list is empty")
    if payload.window_size <= 0:
        raise HTTPException(status_code=422, detail="window_size must be greater than zero")
    if payload.threshold < 0:
        raise HTTPException(status_code=422, detail="threshold must be non-negative")

    method_name = payload.method.lower()

    rig = await db.get(Rig, payload.rig_id)
    if rig is None:
        raise HTTPException(status_code=404, detail=f"Rig {payload.rig_id} not found")

    method_result = await db.execute(
        select(DetectionMethod).where(DetectionMethod.name == method_name)
    )
    method = method_result.scalar_one_or_none()
    if method is None:
        raise HTTPException(status_code=404, detail=f"Detection method '{payload.method}' not found")

    config_result = await db.execute(
        select(MethodConfig)
        .where(
            and_(
                MethodConfig.rig_id == payload.rig_id,
                MethodConfig.method_id == method.method_id,
                MethodConfig.window_size == payload.window_size,
                MethodConfig.threshold == Decimal(str(payload.threshold)),
            )
        )
        .order_by(MethodConfig.method_config_id.desc())
        .limit(1)
    )
    method_config = config_result.scalar_one_or_none()
    if method_config is None:
        method_config = MethodConfig(
            rig_id=payload.rig_id,
            method_id=method.method_id,
            window_size=payload.window_size,
            threshold=Decimal(str(payload.threshold)),
            created_at=datetime.utcnow(),
        )
        db.add(method_config)
        await db.flush()

    sensor_rows = await db.execute(
        select(Sensor, SensorType).join(SensorType, Sensor.sensor_type_id == SensorType.sensor_type_id)
        .where(Sensor.rig_id == payload.rig_id)
    )
    sensor_by_name = {
        sensor_type.name.lower(): sensor.sensor_id
        for sensor, sensor_type in sensor_rows.all()
    }

    saved_count = 0
    skipped_count = 0
    skipped_details: list[str] = []

    for item in payload.anomalies:
        param_name = item.param.strip().lower()
        sensor_id = sensor_by_name.get(param_name)
        if sensor_id is None:
            skipped_count += 1
            skipped_details.append(f"sensor for param '{item.param}' not found on rig {payload.rig_id}")
            continue

        try:
            detected_at = _parse_anomaly_timestamp(item.timestamp)
            telemetry_value = _to_decimal(item.value)
        except ValueError as exc:
            skipped_count += 1
            skipped_details.append(str(exc))
            continue

        telemetry_result = await db.execute(
            select(Telemetry)
            .where(
                and_(
                    Telemetry.sensor_id == sensor_id,
                    Telemetry.timestamp == detected_at,
                )
            )
            .order_by(Telemetry.telemetry_id.desc())
            .limit(1)
        )
        telemetry = telemetry_result.scalar_one_or_none()
        if telemetry is None:
            telemetry = Telemetry(
                sensor_id=sensor_id,
                timestamp=detected_at,
                value=telemetry_value,
            )
            db.add(telemetry)
            await db.flush()

        anomaly_exists_result = await db.execute(
            select(Anomaly.anomaly_id).where(
                and_(
                    Anomaly.telemetry_id == telemetry.telemetry_id,
                    Anomaly.method_config_id == method_config.method_config_id,
                )
            )
        )
        if anomaly_exists_result.scalar_one_or_none() is not None:
            skipped_count += 1
            continue

        db.add(
            Anomaly(
                telemetry_id=telemetry.telemetry_id,
                method_config_id=method_config.method_config_id,
                detected_at=detected_at,
            )
        )
        saved_count += 1

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="conflict while saving anomalies") from exc

    return {
        "saved": saved_count,
        "skipped": skipped_count,
        "method_config_id": method_config.method_config_id,
        "rig_id": payload.rig_id,
        "method": method_name,
        "details": skipped_details[:20],
    }
