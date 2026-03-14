from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

@dataclass
class Settings:
    coverage_days: int = 7
    sales_multiplier: float = 1.0
    reserve_units: int = 0
    pack_size: int = 1
    min_order_qty: int = 1
    buyer_name: str = "Магазин Ромашка"
    delivery_date: Optional[str] = None

@dataclass
class SaleRow:
    barcode: str
    name: str
    sold_qty: int

@dataclass
class CatalogItem:
    supplier_code: str
    supplier_name: str
    barcode: str
    name: str
    price: float
