from __future__ import annotations

import math
from .models import Settings

def calculate_order_qty(sold_qty: int, period_days: int, settings: Settings) -> int:
    if sold_qty <= 0:
        return 0

    safe_days = max(period_days, 1)
    coverage_days = max(settings.coverage_days, 1)
    sales_multiplier = max(settings.sales_multiplier, 0)
    pack_size = max(settings.pack_size, 1)
    min_order_qty = max(settings.min_order_qty, 1)

    average_daily_sales = sold_qty / safe_days
    raw_order = (average_daily_sales * coverage_days * sales_multiplier) + max(settings.reserve_units, 0)

    if raw_order <= 0:
        return 0

    rounded = math.ceil(raw_order / pack_size) * pack_size

    if 0 < rounded < min_order_qty:
        return min_order_qty

    return int(rounded)
