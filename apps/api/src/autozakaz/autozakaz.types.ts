export interface AutozakazSettings {
  coverageDays: number;
  salesMultiplier: number;
  reserveUnits: number;
  packSize: number;
  minOrderQty: number;
  buyerName: string;
  deliveryDate?: string;
}

export interface AutozakazRunResult {
  runId: string;
  sourceFileName: string;
  generatedAt: string;
  period: {
    start: string | null;
    end: string | null;
    days: number;
  };
  settings: AutozakazSettings;
  summary: {
    totalRows: number;
    uniqueBarcodes: number;
    matchedBarcodes: number;
    unknownBarcodes: number;
    suppliersWithOrders: number;
  };
  suppliers: Array<{
    code: string;
    name: string;
    itemsCount: number;
    totalSoldQty: number;
    totalOrderQty: number;
    downloadFileName: string;
    orderItems: Array<{
      barcode: string;
      name: string;
      soldQty: number;
      orderQty: number;
      price: number;
    }>;
  }>;
  unknownItems: Array<{
    barcode: string;
    name: string;
    soldQty: number;
  }>;
}
