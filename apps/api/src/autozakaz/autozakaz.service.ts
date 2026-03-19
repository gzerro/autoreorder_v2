import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import type { Express } from 'express';
import { existsSync, promises as fs } from 'fs';
import { dirname, join, resolve } from 'path';
import type {
  AutozakazHistoryItem,
  AutozakazHistoryRunDetail,
  AutozakazRunResult,
  AutozakazRunResultWithDownloads,
  AutozakazSettings,
} from './autozakaz.types';

@Injectable()
export class AutozakazService {
  private readonly projectRoot = this.findProjectRoot(process.cwd());
  private readonly storageDir = resolve(
    this.projectRoot,
    process.env.STORAGE_DIR || 'storage',
  );
  private readonly suppliersFile = resolve(
    this.projectRoot,
    process.env.SUPPLIERS_FILE || 'shared-data/suppliers.json',
  );
  private readonly templateFile = resolve(
    this.projectRoot,
    process.env.ORDER_TEMPLATE || 'shared-data/templates/Выгрузка заказа.xlsx',
  );
  private readonly pythonScript = resolve(
    this.projectRoot,
    process.env.PYTHON_SCRIPT || 'services/python/calculate_autozakaz.py',
  );
  private readonly pythonBin = process.env.PYTHON_BIN || 'python3';

  private findProjectRoot(startDir: string): string {
    let currentDir = resolve(startDir);

    while (true) {
      const maybeSharedData = join(currentDir, 'shared-data');
      const maybeApps = join(currentDir, 'apps');

      if (existsSync(maybeSharedData) && existsSync(maybeApps)) {
        return currentDir;
      }

      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) {
        return resolve(startDir);
      }

      currentDir = parentDir;
    }
  }

  private looksLikeMojibake(value: string): boolean {
    return /Ð|Ñ/.test(value);
  }

  private normalizeFileName(value: string): string {
    if (!value) {
      return value;
    }

    if (!this.looksLikeMojibake(value)) {
      return value;
    }

    try {
      return Buffer.from(value, 'latin1').toString('utf8');
    } catch {
      return value;
    }
  }

  private decodeUploadedFileName(fileName: string): string {
    return this.normalizeFileName(fileName);
  }

  private getRunsDir(): string {
    return join(this.storageDir, 'runs');
  }

  private getRunDir(runId: string): string {
    return join(this.getRunsDir(), runId);
  }

  private getRunMetaPath(runId: string): string {
    return join(this.getRunDir(runId), 'run-meta.json');
  }

  private getRunResultPath(runId: string): string {
    return join(this.getRunDir(runId), 'result.json');
  }

  private async pathExists(absolutePath: string): Promise<boolean> {
    try {
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  private normalizeErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Неизвестная ошибка расчёта';
  }

  private decorateRunResult(
    result: AutozakazRunResult,
  ): AutozakazRunResultWithDownloads {
    return {
      ...result,
      sourceFileName: this.normalizeFileName(result.sourceFileName),
      suppliers: result.suppliers.map((supplier) => ({
        ...supplier,
        downloadUrl: `/autozakaz/runs/${result.runId}/orders/${supplier.code}`,
      })),
      sourceDownloadUrl: `/autozakaz/runs/${result.runId}/source`,
    };
  }

  private async writeRunMeta(
    runId: string,
    meta: AutozakazHistoryItem,
  ): Promise<void> {
    const runDir = this.getRunDir(runId);
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(
      this.getRunMetaPath(runId),
      JSON.stringify(meta, null, 2),
      'utf-8',
    );
  }

  private async readRunResult(
    runId: string,
  ): Promise<AutozakazRunResultWithDownloads | null> {
    const resultPath = this.getRunResultPath(runId);

    if (!(await this.pathExists(resultPath))) {
      return null;
    }

    const rawResult = await fs.readFile(resultPath, 'utf-8');
    const result = JSON.parse(rawResult) as AutozakazRunResult;
    return this.decorateRunResult(result);
  }

  private async readRunMeta(
    runId: string,
  ): Promise<AutozakazHistoryItem | null> {
    const metaPath = this.getRunMetaPath(runId);

    if (await this.pathExists(metaPath)) {
      const rawMeta = await fs.readFile(metaPath, 'utf-8');
      const meta = JSON.parse(rawMeta) as AutozakazHistoryItem;

      return {
        ...meta,
        sourceFileName: this.normalizeFileName(meta.sourceFileName),
        sourceDownloadUrl:
          meta.sourceDownloadUrl || `/autozakaz/runs/${runId}/source`,
        suppliersCount:
          typeof meta.suppliersCount === 'number'
            ? meta.suppliersCount
            : meta.summary?.suppliersWithOrders || 0,
        unknownItemsCount:
          typeof meta.unknownItemsCount === 'number'
            ? meta.unknownItemsCount
            : meta.summary?.unknownBarcodes || 0,
        errorMessage: meta.errorMessage ?? null,
      };
    }

    const result = await this.readRunResult(runId);
    if (!result) {
      return null;
    }

    return {
      runId,
      sourceFileName: this.normalizeFileName(result.sourceFileName),
      status: 'completed',
      createdAt: result.generatedAt,
      startedAt: result.generatedAt,
      finishedAt: result.generatedAt,
      durationMs: null,
      generatedAt: result.generatedAt,
      summary: result.summary,
      suppliersCount: result.suppliers.length,
      unknownItemsCount: result.unknownItems.length,
      sourceDownloadUrl: result.sourceDownloadUrl,
      errorMessage: null,
    };
  }

  parseSettings(settingsRaw?: string): AutozakazSettings {
    const defaults: AutozakazSettings = {
      coverageDays: 7,
      salesMultiplier: 1,
      reserveUnits: 0,
      packSize: 1,
      minOrderQty: 1,
      buyerName: 'Магазин Ромашка',
      deliveryDate: '',
    };

    if (!settingsRaw) {
      return defaults;
    }

    try {
      const parsed = JSON.parse(settingsRaw) as Partial<AutozakazSettings>;

      return {
        coverageDays: Number(parsed.coverageDays ?? defaults.coverageDays),
        salesMultiplier: Number(
          parsed.salesMultiplier ?? defaults.salesMultiplier,
        ),
        reserveUnits: Number(parsed.reserveUnits ?? defaults.reserveUnits),
        packSize: Number(parsed.packSize ?? defaults.packSize),
        minOrderQty: Number(parsed.minOrderQty ?? defaults.minOrderQty),
        buyerName: String(parsed.buyerName ?? defaults.buyerName),
        deliveryDate: String(parsed.deliveryDate ?? defaults.deliveryDate),
      };
    } catch {
      throw new BadRequestException('Настройки переданы в неверном формате');
    }
  }

  private async readSuppliersData(): Promise<any[]> {
    const raw = await fs.readFile(this.suppliersFile, 'utf-8');
    return JSON.parse(raw) as any[];
  }

  private async writeSuppliersData(data: any[]): Promise<void> {
    await fs.writeFile(
      this.suppliersFile,
      JSON.stringify(data, null, 2),
      'utf-8',
    );
  }

  async getSuppliers(): Promise<unknown> {
    return this.readSuppliersData();
  }

  async createSupplier(data: {
    name: string;
  }): Promise<{ code: string; name: string; items: any[] }> {
    const suppliers = await this.readSuppliersData();

    let maxNum = 0;
    for (const s of suppliers) {
      const match = /^SUP-(\d+)$/.exec(s.code);
      if (match) {
        maxNum = Math.max(maxNum, Number(match[1]));
      }
    }

    const code = `SUP-${String(maxNum + 1).padStart(3, '0')}`;
    const supplier = { code, name: data.name, items: [] as any[] };

    suppliers.push(supplier);
    await this.writeSuppliersData(suppliers);

    return supplier;
  }

  async updateSupplier(
    code: string,
    data: { name: string },
  ): Promise<{ code: string; name: string; items: any[] }> {
    const suppliers = await this.readSuppliersData();
    const supplier = suppliers.find((s) => s.code === code);

    if (!supplier) {
      throw new NotFoundException('Поставщик не найден');
    }

    supplier.name = data.name;
    await this.writeSuppliersData(suppliers);

    return supplier;
  }

  async deleteSupplier(code: string): Promise<{ ok: true }> {
    const suppliers = await this.readSuppliersData();
    const idx = suppliers.findIndex((s) => s.code === code);

    if (idx === -1) {
      throw new NotFoundException('Поставщик не найден');
    }

    suppliers.splice(idx, 1);
    await this.writeSuppliersData(suppliers);

    return { ok: true };
  }

  async addSupplierItem(
    supplierCode: string,
    item: { barcode: string; name: string; price: number },
  ): Promise<{ ok: true }> {
    const suppliers = await this.readSuppliersData();
    const supplier = suppliers.find((s) => s.code === supplierCode);

    if (!supplier) {
      throw new NotFoundException('Поставщик не найден');
    }

    if (supplier.items.some((i: any) => i.barcode === item.barcode)) {
      throw new BadRequestException(
        'Товар с таким штрихкодом уже есть у этого поставщика',
      );
    }

    supplier.items.push({
      barcode: item.barcode,
      name: item.name,
      price: item.price,
      isActive: true,
      source: 'manual',
    });

    await this.writeSuppliersData(suppliers);
    return { ok: true };
  }

  async updateSupplierItem(
    supplierCode: string,
    oldBarcode: string,
    data: { barcode?: string; name?: string; price?: number },
  ): Promise<{ ok: true }> {
    const suppliers = await this.readSuppliersData();
    const supplier = suppliers.find((s) => s.code === supplierCode);

    if (!supplier) {
      throw new NotFoundException('Поставщик не найден');
    }

    const item = supplier.items.find((i: any) => i.barcode === oldBarcode);

    if (!item) {
      throw new NotFoundException('Товар не найден');
    }

    if (
      data.barcode !== undefined &&
      data.barcode !== oldBarcode &&
      supplier.items.some((i: any) => i.barcode === data.barcode)
    ) {
      throw new BadRequestException(
        'Товар с таким штрихкодом уже есть у этого поставщика',
      );
    }

    if (data.barcode !== undefined) item.barcode = data.barcode;
    if (data.name !== undefined) item.name = data.name;
    if (data.price !== undefined) item.price = data.price;

    await this.writeSuppliersData(suppliers);
    return { ok: true };
  }

  async deleteSupplierItem(
    supplierCode: string,
    barcode: string,
  ): Promise<{ ok: true }> {
    const suppliers = await this.readSuppliersData();
    const supplier = suppliers.find((s) => s.code === supplierCode);

    if (!supplier) {
      throw new NotFoundException('Поставщик не найден');
    }

    const idx = supplier.items.findIndex((i: any) => i.barcode === barcode);

    if (idx === -1) {
      throw new NotFoundException('Товар не найден');
    }

    supplier.items.splice(idx, 1);
    await this.writeSuppliersData(suppliers);

    return { ok: true };
  }

  async listHistory(): Promise<AutozakazHistoryItem[]> {
    const runsDir = this.getRunsDir();

    if (!(await this.pathExists(runsDir))) {
      return [];
    }

    const entries = await fs.readdir(runsDir, { withFileTypes: true });

    const items = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => this.readRunMeta(entry.name)),
    );

    return items
      .filter((item): item is AutozakazHistoryItem => item !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getHistoryRun(runId: string): Promise<AutozakazHistoryRunDetail> {
    const historyMeta = await this.readRunMeta(runId);

    if (!historyMeta) {
      throw new NotFoundException('Прогон истории не найден');
    }

    const result = await this.readRunResult(runId);

    return {
      historyMeta,
      result,
    };
  }

  async clearHistory(): Promise<{ ok: true; cleared: boolean }> {
    const runsDir = this.getRunsDir();

    if (await this.pathExists(runsDir)) {
      await fs.rm(runsDir, { recursive: true, force: true });
    }

    await fs.mkdir(runsDir, { recursive: true });

    return {
      ok: true,
      cleared: true,
    };
  }

  async processIikoUpload(
    file: Express.Multer.File,
    settings: AutozakazSettings,
  ): Promise<AutozakazHistoryRunDetail> {
    const runId = randomUUID();
    const runDir = this.getRunDir(runId);

    await fs.mkdir(runDir, { recursive: true });

    const decodedFileName = this.decodeUploadedFileName(file.originalname);
    const sourceFilePath = join(runDir, decodedFileName);
    await fs.writeFile(sourceFilePath, file.buffer);

    const startedAt = new Date().toISOString();

    const initialMeta: AutozakazHistoryItem = {
      runId,
      sourceFileName: decodedFileName,
      status: 'processing',
      createdAt: startedAt,
      startedAt,
      finishedAt: null,
      durationMs: null,
      generatedAt: null,
      summary: null,
      suppliersCount: 0,
      unknownItemsCount: 0,
      sourceDownloadUrl: `/autozakaz/runs/${runId}/source`,
      errorMessage: null,
    };

    await this.writeRunMeta(runId, initialMeta);

    const resultPath = this.getRunResultPath(runId);
    const startedMs = Date.now();

    try {
      await this.executePython({
        input: sourceFilePath,
        runDir,
        resultPath,
        suppliersFile: this.suppliersFile,
        orderTemplate: this.templateFile,
        settings,
        runId,
      });

      const rawResult = await fs.readFile(resultPath, 'utf-8');
      const parsedResult = JSON.parse(rawResult) as AutozakazRunResult;
      const result = this.decorateRunResult(parsedResult);

      const finishedAt = new Date().toISOString();
      const historyMeta: AutozakazHistoryItem = {
        ...initialMeta,
        status: 'completed',
        finishedAt,
        durationMs: Date.now() - startedMs,
        generatedAt: result.generatedAt,
        summary: result.summary,
        suppliersCount: result.suppliers.length,
        unknownItemsCount: result.unknownItems.length,
        errorMessage: null,
      };

      await this.writeRunMeta(runId, historyMeta);

      return {
        historyMeta,
        result,
      };
    } catch (error) {
      const finishedAt = new Date().toISOString();
      const historyMeta: AutozakazHistoryItem = {
        ...initialMeta,
        status: 'failed',
        finishedAt,
        durationMs: Date.now() - startedMs,
        errorMessage: this.normalizeErrorMessage(error),
      };

      await this.writeRunMeta(runId, historyMeta);
      throw error;
    }
  }

  async resolveOrderFile(runId: string, supplierCode: string) {
    const runDir = this.getRunDir(runId);
    const orderFile = join(runDir, `order_${supplierCode}.xlsx`);

    try {
      await fs.access(orderFile);
    } catch {
      throw new NotFoundException('Файл заказа не найден');
    }

    return {
      absolutePath: orderFile,
      downloadName: `Заказ_${supplierCode}_${runId}.xlsx`,
    };
  }

  async resolveSourceFile(runId: string) {
    const runDir = this.getRunDir(runId);
    const files = await fs.readdir(runDir);

    const source = files.find(
      (file) => file.toLowerCase().endsWith('.xlsx') && !file.startsWith('order_'),
    );

    if (!source) {
      throw new NotFoundException('Исходный файл не найден');
    }

    return {
      absolutePath: join(runDir, source),
      downloadName: this.normalizeFileName(source),
    };
  }

  private async executePython(payload: Record<string, unknown>): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });

    return new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(this.pythonBin, [this.pythonScript], {
        env: {
          ...process.env,
          AUTOZAKAZ_PAYLOAD: JSON.stringify(payload),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';
      let stdout = '';

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolvePromise();
          return;
        }

        rejectPromise(
          new BadRequestException(
            `Python расчёт завершился с ошибкой.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
          ),
        );
      });
    });
  }
}