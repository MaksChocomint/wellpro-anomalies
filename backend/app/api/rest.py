from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
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


def _coerce_value(value: Any, target_type: type) -> Any:
    if value is None:
        return None
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
