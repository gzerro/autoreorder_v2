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
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
import { AutozakazService } from './autozakaz.service';
import { AuthGuard } from '../auth/auth.guard';
import type { JwtPayload } from '../auth/auth.types';

function getClientId(req: Request): string {
  return ((req as any).user as JwtPayload).sub;
}

@Controller('autozakaz')
@UseGuards(AuthGuard)
export class AutozakazController {
  constructor(private readonly autozakazService: AutozakazService) {}

  @Get('health')
  health() {
    return { ok: true };
  }

  @Get('suppliers')
  async suppliers(@Req() req: Request) {
    return this.autozakazService.getSuppliers(getClientId(req));
  }

  @Post('suppliers')
  async createSupplier(@Req() req: Request, @Body() body: { name: string }) {
    if (!body.name?.trim()) {
      throw new BadRequestException('Название поставщика обязательно');
    }
    return this.autozakazService.createSupplier(getClientId(req), {
      name: body.name.trim(),
    });
  }

  @Put('suppliers/:code')
  async updateSupplier(
    @Req() req: Request,
    @Param('code') code: string,
    @Body() body: { name: string },
  ) {
    if (!body.name?.trim()) {
      throw new BadRequestException('Название поставщика обязательно');
    }
    return this.autozakazService.updateSupplier(getClientId(req), code, {
      name: body.name.trim(),
    });
  }

  @Delete('suppliers/:code')
  async deleteSupplier(@Req() req: Request, @Param('code') code: string) {
    return this.autozakazService.deleteSupplier(getClientId(req), code);
  }

  @Post('suppliers/:code/items')
  async addItem(
    @Req() req: Request,
    @Param('code') code: string,
    @Body() body: { barcode: string; name: string; price: number },
  ) {
    if (!body.barcode?.trim()) {
      throw new BadRequestException('Штрихкод обязателен');
    }
    if (!body.name?.trim()) {
      throw new BadRequestException('Название товара обязательно');
    }
    return this.autozakazService.addSupplierItem(getClientId(req), code, {
      barcode: body.barcode.trim(),
      name: body.name.trim(),
      price: Number(body.price) || 0,
    });
  }

  @Put('suppliers/:code/items/:barcode')
  async updateItem(
    @Req() req: Request,
    @Param('code') code: string,
    @Param('barcode') barcode: string,
    @Body() body: { barcode?: string; name?: string; price?: number },
  ) {
    return this.autozakazService.updateSupplierItem(
      getClientId(req),
      code,
      barcode,
      {
        barcode: body.barcode?.trim(),
        name: body.name?.trim(),
        price: body.price !== undefined ? Number(body.price) : undefined,
      },
    );
  }

  @Delete('suppliers/:code/items/:barcode')
  async deleteItem(
    @Req() req: Request,
    @Param('code') code: string,
    @Param('barcode') barcode: string,
  ) {
    return this.autozakazService.deleteSupplierItem(
      getClientId(req),
      code,
      barcode,
    );
  }

  @Get('history')
  async history(@Req() req: Request) {
    return this.autozakazService.listHistory(getClientId(req));
  }

  @Get('history/:runId')
  async historyRun(@Req() req: Request, @Param('runId') runId: string) {
    return this.autozakazService.getHistoryRun(getClientId(req), runId);
  }

  @Delete('history')
  async clearHistory(@Req() req: Request) {
    return this.autozakazService.clearHistory(getClientId(req));
  }

  @Post('iiko/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
    }),
  )
  async uploadIiko(
    @Req() req: Request,
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
    return this.autozakazService.processIikoUpload(
      getClientId(req),
      file,
      settings,
    );
  }

  @Get('runs/:runId/orders/:supplierCode')
  async downloadOrder(
    @Req() req: Request,
    @Param('runId') runId: string,
    @Param('supplierCode') supplierCode: string,
    @Res() res: Response,
  ) {
    const file = await this.autozakazService.resolveOrderFile(
      getClientId(req),
      runId,
      supplierCode,
    );
    return res.download(file.absolutePath, file.downloadName);
  }

  @Get('runs/:runId/source')
  async downloadSource(
    @Req() req: Request,
    @Param('runId') runId: string,
    @Res() res: Response,
  ) {
    const file = await this.autozakazService.resolveSourceFile(
      getClientId(req),
      runId,
    );
    return res.download(file.absolutePath, file.downloadName);
  }
}
