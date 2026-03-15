export type AutozakazRunStatus = 'processing' | 'completed' | 'failed';

export interface AutozakazSettings {
  coverageDays: number;
  salesMultiplier: number;
  reserveUnits: number;
  packSize: number;
  minOrderQty: number;
  buyerName: string;
  deliveryDate?: string;
}

export interface AutozakazOrderItem {
  barcode: string;
  name: string;
  soldQty: number;
  orderQty: number;
  price: number;
}

export interface AutozakazSupplierResult {
  code: string;
  name: string;
  itemsCount: number;
  totalSoldQty: number;
  totalOrderQty: number;
  downloadFileName: string;
  orderItems: AutozakazOrderItem[];
}

export interface AutozakazSupplierResultWithDownload
  extends AutozakazSupplierResult {
  downloadUrl: string;
}

export interface AutozakazRunSummary {
  totalRows: number;
  uniqueBarcodes: number;
  matchedBarcodes: number;
  unknownBarcodes: number;
  suppliersWithOrders: number;
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
  summary: AutozakazRunSummary;
  suppliers: AutozakazSupplierResult[];
  unknownItems: Array<{
    barcode: string;
    name: string;
    soldQty: number;
  }>;
}

export interface AutozakazRunResultWithDownloads
  extends Omit<AutozakazRunResult, 'suppliers'> {
  sourceDownloadUrl: string;
  suppliers: AutozakazSupplierResultWithDownload[];
}

export interface AutozakazHistoryItem {
  runId: string;
  sourceFileName: string;
  status: AutozakazRunStatus;
  createdAt: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  generatedAt: string | null;
  summary: AutozakazRunSummary | null;
  suppliersCount: number;
  unknownItemsCount: number;
  sourceDownloadUrl: string;
  errorMessage: string | null;
}

export interface AutozakazHistoryRunDetail {
  historyMeta: AutozakazHistoryItem;
  result: AutozakazRunResultWithDownloads | null;
}