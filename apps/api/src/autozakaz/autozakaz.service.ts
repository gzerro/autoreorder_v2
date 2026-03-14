import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, promises as fs } from 'fs';
import { join, resolve, dirname } from 'path';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import type { Express } from 'express';
import type { AutozakazRunResult, AutozakazSettings } from './autozakaz.types';

@Injectable()
export class AutozakazService {
  private readonly projectRoot = this.findProjectRoot(process.cwd());
  private readonly storageDir = resolve(this.projectRoot, process.env.STORAGE_DIR || 'storage');
  private readonly suppliersFile = resolve(this.projectRoot, process.env.SUPPLIERS_FILE || 'shared-data/suppliers.json');
  private readonly templateFile = resolve(this.projectRoot, process.env.ORDER_TEMPLATE || 'shared-data/templates/Выгрузка заказа.xlsx');
  private readonly pythonScript = resolve(this.projectRoot, process.env.PYTHON_SCRIPT || 'services/python/calculate_autozakaz.py');
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
      const parsed = JSON.parse(settingsRaw);
      return {
        coverageDays: Number(parsed.coverageDays ?? defaults.coverageDays),
        salesMultiplier: Number(parsed.salesMultiplier ?? defaults.salesMultiplier),
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

  async getSuppliers() {
    const raw = await fs.readFile(this.suppliersFile, 'utf-8');
    return JSON.parse(raw);
  }

  async processIikoUpload(file: Express.Multer.File, settings: AutozakazSettings): Promise<AutozakazRunResult & { sourceDownloadUrl: string; suppliers: any[] }> {
    const runId = randomUUID();
    const runDir = join(this.storageDir, 'runs', runId);
    await fs.mkdir(runDir, { recursive: true });

    const sourceFilePath = join(runDir, file.originalname);
    await fs.writeFile(sourceFilePath, file.buffer);

    const resultPath = join(runDir, 'result.json');

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
    const result = JSON.parse(rawResult) as AutozakazRunResult;

    const suppliers = result.suppliers.map((supplier) => ({
      ...supplier,
      downloadUrl: `/autozakaz/runs/${runId}/orders/${supplier.code}`,
    }));

    return {
      ...result,
      suppliers,
      sourceDownloadUrl: `/autozakaz/runs/${runId}/source`,
    };
  }

  async resolveOrderFile(runId: string, supplierCode: string) {
    const runDir = join(this.storageDir, 'runs', runId);
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
    const runDir = join(this.storageDir, 'runs', runId);
    const files = await fs.readdir(runDir);
    const source = files.find((file) => file.toLowerCase().endsWith('.xlsx') && !file.startsWith('order_'));
    if (!source) {
      throw new NotFoundException('Исходный файл не найден');
    }

    return {
      absolutePath: join(runDir, source),
      downloadName: source,
    };
  }

  private async executePython(payload: Record<string, unknown>) {
    await fs.mkdir(this.storageDir, { recursive: true });

    return new Promise<void>((resolvePromise, rejectPromise) => {
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
