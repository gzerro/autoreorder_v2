import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseFilePipeBuilder,
  Post,
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