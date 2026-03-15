import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ExportRequestDto } from '../dto/export-request.dto';
import { ExportComparisonService } from '../services/export-comparison.service';
import { StreamResponseService } from '../services/stream-response.service';
import { WasmExcelService } from '../services/wasm-excel.service';

@Controller('export')
export class ExcelExportController {
  constructor(
    private readonly exportComparisonService: ExportComparisonService,
    private readonly streamResponseService: StreamResponseService,
    private readonly wasmExcelService: WasmExcelService,
  ) {}

  @Post('excel/stream')
  async exportExcelStream(
    @Body() request: ExportRequestDto,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.exportComparisonService.exportWithWasm(request);
    this.streamResponseService.sendBuffer(
      response,
      result.buffer,
      result.fileName,
      result.contentType,
    );
  }

  @Post('excel/download')
  async exportExcelDownload(
    @Body() request: ExportRequestDto,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.exportComparisonService.exportWithWasm(request);
    this.streamResponseService.sendBuffer(
      response,
      result.buffer,
      result.fileName,
      result.contentType,
    );
  }

  @Post('data')
  async getExportData(@Body() request: ExportRequestDto) {
    return this.exportComparisonService.benchmark({
      ...request,
      limit: Math.min(request.limit ?? 100, 100),
    });
  }

  @Get('wasm/status')
  getWasmStatus() {
    return {
      success: true,
      status: this.wasmExcelService.getStatus(),
      timestamp: new Date().toISOString(),
    };
  }

  @Post('wasm/initialize')
  async initializeWasm() {
    const initialized = await this.wasmExcelService.initializeExport(['ID']);
    return {
      success: initialized,
      message: initialized ? 'WASM ready' : 'WASM init failed',
    };
  }

  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      service: 'excel-export',
      wasm: this.wasmExcelService.getStatus(),
      timestamp: new Date().toISOString(),
    };
  }
}
