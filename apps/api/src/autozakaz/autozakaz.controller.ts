import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseFilePipeBuilder,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { AutozakazService } from './autozakaz.service';

@Controller('autozakaz')
export class AutozakazController {
  constructor(private readonly autozakazService: AutozakazService) {}

  @Get('health')
  health() {
    return { ok: true };
  }

  @Get('suppliers')
  async suppliers() {
    return this.autozakazService.getSuppliers();
  }

  @Post('suppliers')
  async createSupplier(@Body() body: { name: string }) {
    if (!body.name?.trim()) {
      throw new BadRequestException('Название поставщика обязательно');
    }
    return this.autozakazService.createSupplier({ name: body.name.trim() });
  }

  @Put('suppliers/:code')
  async updateSupplier(
    @Param('code') code: string,
    @Body() body: { name: string },
  ) {
    if (!body.name?.trim()) {
      throw new BadRequestException('Название поставщика обязательно');
    }
    return this.autozakazService.updateSupplier(code, {
      name: body.name.trim(),
    });
  }

  @Delete('suppliers/:code')
  async deleteSupplier(@Param('code') code: string) {
    return this.autozakazService.deleteSupplier(code);
  }

  @Post('suppliers/:code/items')
  async addItem(
    @Param('code') code: string,
    @Body() body: { barcode: string; name: string; price: number },
  ) {
    if (!body.barcode?.trim()) {
      throw new BadRequestException('Штрихкод обязателен');
    }
    if (!body.name?.trim()) {
      throw new BadRequestException('Название товара обязательно');
    }
    return this.autozakazService.addSupplierItem(code, {
      barcode: body.barcode.trim(),
      name: body.name.trim(),
      price: Number(body.price) || 0,
    });
  }

  @Put('suppliers/:code/items/:barcode')
  async updateItem(
    @Param('code') code: string,
    @Param('barcode') barcode: string,
    @Body() body: { barcode?: string; name?: string; price?: number },
  ) {
    return this.autozakazService.updateSupplierItem(code, barcode, {
      barcode: body.barcode?.trim(),
      name: body.name?.trim(),
      price: body.price !== undefined ? Number(body.price) : undefined,
    });
  }

  @Delete('suppliers/:code/items/:barcode')
  async deleteItem(
    @Param('code') code: string,
    @Param('barcode') barcode: string,
  ) {
    return this.autozakazService.deleteSupplierItem(code, barcode);
  }

  @Get('history')
  async history() {
    return this.autozakazService.listHistory();
  }

  @Get('history/:runId')
  async historyRun(@Param('runId') runId: string) {
    return this.autozakazService.getHistoryRun(runId);
  }

  @Delete('history')
  async clearHistory() {
    return this.autozakazService.clearHistory();
  }

  @Post('iiko/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
    }),
  )
  async uploadIiko(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType:
            /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/i,
        })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: 400,
        }),
    )
    file: Express.Multer.File,
    @Body('settings') settingsRaw?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Файл не передан');
    }

    const settings = this.autozakazService.parseSettings(settingsRaw);
    return this.autozakazService.processIikoUpload(file, settings);
  }

  @Get('runs/:runId/orders/:supplierCode')
  async downloadOrder(
    @Param('runId') runId: string,
    @Param('supplierCode') supplierCode: string,
    @Res() res: Response,
  ) {
    const file = await this.autozakazService.resolveOrderFile(
      runId,
      supplierCode,
    );
    return res.download(file.absolutePath, file.downloadName);
  }

  @Get('runs/:runId/source')
  async downloadSource(@Param('runId') runId: string, @Res() res: Response) {
    const file = await this.autozakazService.resolveSourceFile(runId);
    return res.download(file.absolutePath, file.downloadName);
  }
}
