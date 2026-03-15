import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ExportRequestDto } from '../dto/export-request.dto';
import { ExportComparisonService } from '../services/export-comparison.service';
import { StreamResponseService } from '../services/stream-response.service';
import { WasmExcelService } from '../services/wasm-excel.service';

@Controller('export/wasm')
export class WasmExportController {
  constructor(
    private readonly exportComparisonService: ExportComparisonService,
    private readonly streamResponseService: StreamResponseService,
    private readonly wasmExcelService: WasmExcelService,
  ) {}

  @Post('download')
  async download(
    @Body() request: ExportRequestDto,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.exportComparisonService.exportWithWasm({
      ...request,
      fileName: request.fileName ?? 'wasm-export.xlsx',
    });

    this.streamResponseService.sendBuffer(
      response,
      result.buffer,
      result.fileName,
      result.contentType,
    );
  }

  @Get('quick')
  async quick(
    @Query('limit') limit = '1000',
    @Query('seed') seed = '12345',
    @Res() response: Response,
  ): Promise<void> {
    await this.download(
      {
        limit: Number(limit),
        seed: Number(seed),
        fileName: `wasm-quick-${limit}.xlsx`,
      },
      response,
    );
  }

  @Get('status')
  status() {
    return {
      status: HttpStatus.OK,
      variant: 'wasm',
      wasm: this.wasmExcelService.getStatus(),
    };
  }
}
