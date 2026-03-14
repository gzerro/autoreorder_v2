from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from .calculator import calculate_order_qty
from .excel import read_iiko_sales, write_supplier_order
from .models import CatalogItem, Settings

def load_suppliers(suppliers_path: str | Path) -> tuple[dict[str, dict[str, Any]], dict[str, CatalogItem]]:
    raw = json.loads(Path(suppliers_path).read_text(encoding="utf-8"))
    suppliers_by_code: dict[str, dict[str, Any]] = {}
    barcode_index: dict[str, CatalogItem] = {}

    for supplier in raw:
        suppliers_by_code[supplier["code"]] = supplier
        for item in supplier["items"]:
            barcode_index[item["barcode"]] = CatalogItem(
                supplier_code=supplier["code"],
                supplier_name=supplier["name"],
                barcode=item["barcode"],
                name=item["name"],
                price=float(item["price"]),
            )

    return suppliers_by_code, barcode_index

def build_settings(payload: dict[str, Any]) -> Settings:
    settings_payload = payload.get("settings", {})
    return Settings(
        coverage_days=int(settings_payload.get("coverageDays", 7)),
        sales_multiplier=float(settings_payload.get("salesMultiplier", 1)),
        reserve_units=int(settings_payload.get("reserveUnits", 0)),
        pack_size=int(settings_payload.get("packSize", 1)),
        min_order_qty=int(settings_payload.get("minOrderQty", 1)),
        buyer_name=str(settings_payload.get("buyerName", "Магазин Ромашка")),
        delivery_date=str(settings_payload.get("deliveryDate", "")) or None,
    )

def run_autozakaz(payload: dict[str, Any]) -> dict[str, Any]:
    input_path = Path(payload["input"])
    result_path = Path(payload["resultPath"])
    run_dir = Path(payload["runDir"])
    order_template = payload["orderTemplate"]
    suppliers_file = payload["suppliersFile"]
    run_id = payload["runId"]

    run_dir.mkdir(parents=True, exist_ok=True)

    _, barcode_index = load_suppliers(suppliers_file)
    settings = build_settings(payload)
    run_date = datetime.now()

    sales_rows, meta = read_iiko_sales(input_path)

    suppliers_result: dict[str, dict[str, Any]] = {}
    unknown_items: list[dict[str, Any]] = []
    matched_barcodes = 0

    for sale in sales_rows:
        catalog_item = barcode_index.get(sale.barcode)
        if not catalog_item:
            unknown_items.append(
                {
                    "barcode": sale.barcode,
                    "name": sale.name,
                    "soldQty": sale.sold_qty,
                }
            )
            continue

        matched_barcodes += 1
        supplier_bucket = suppliers_result.setdefault(
            catalog_item.supplier_code,
            {
                "code": catalog_item.supplier_code,
                "name": catalog_item.supplier_name,
                "itemsCount": 0,
                "totalSoldQty": 0,
                "totalOrderQty": 0,
                "downloadFileName": f"order_{catalog_item.supplier_code}.xlsx",
                "orderItems": [],
            },
        )

        order_qty = calculate_order_qty(
            sold_qty=sale.sold_qty,
            period_days=meta["days"],
            settings=settings,
        )

        if order_qty <= 0:
            continue

        supplier_bucket["orderItems"].append(
            {
                "barcode": sale.barcode,
                "name": catalog_item.name or sale.name,
                "soldQty": sale.sold_qty,
                "orderQty": order_qty,
                "price": catalog_item.price,
            }
        )
        supplier_bucket["itemsCount"] += 1
        supplier_bucket["totalSoldQty"] += sale.sold_qty
        supplier_bucket["totalOrderQty"] += order_qty

    suppliers_list = sorted(suppliers_result.values(), key=lambda item: item["name"])

    for supplier in suppliers_list:
        output_path = run_dir / f"order_{supplier['code']}.xlsx"
        write_supplier_order(
            template_path=order_template,
            output_path=output_path,
            supplier_name=supplier["name"],
            buyer_name=settings.buyer_name,
            settings=settings,
            run_date=run_date,
            order_items=supplier["orderItems"],
        )

    result = {
        "runId": run_id,
        "sourceFileName": input_path.name,
        "generatedAt": run_date.isoformat(),
        "period": {
            "start": meta["start"],
            "end": meta["end"],
            "days": meta["days"],
        },
        "settings": {
            "coverageDays": settings.coverage_days,
            "salesMultiplier": settings.sales_multiplier,
            "reserveUnits": settings.reserve_units,
            "packSize": settings.pack_size,
            "minOrderQty": settings.min_order_qty,
            "buyerName": settings.buyer_name,
            "deliveryDate": settings.delivery_date or "",
        },
        "summary": {
            "totalRows": meta["total_rows"],
            "uniqueBarcodes": meta["unique_barcodes"],
            "matchedBarcodes": matched_barcodes,
            "unknownBarcodes": len(unknown_items),
            "suppliersWithOrders": len(suppliers_list),
        },
        "suppliers": suppliers_list,
        "unknownItems": unknown_items,
    }

    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result
