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
import { WasmExcelService } from '../services/wasm-excel.service';
import { parseQuickExportQuery } from './export-query-validation';

@Controller('export/wasm')
export class WasmExportController {
  constructor(
    private readonly exportComparisonService: ExportComparisonService,
    private readonly wasmExcelService: WasmExcelService,
  ) {}

  @Post('download')
  async download(
    @Body() request: ExportRequestDto,
    @Res() response: Response,
  ): Promise<void> {
    await this.exportComparisonService.streamWasmToResponse(
      {
        ...request,
        fileName: request.fileName ?? 'wasm-export.xlsx',
      },
      response,
    );
  }

  @Get('quick')
  async quick(
    @Query('limit') limit = '1000',
    @Query('seed') seed = '12345',
    @Res() response: Response,
  ): Promise<void> {
    const query = parseQuickExportQuery(limit, seed);

    await this.download(
      {
        limit: query.limit,
        seed: query.seed,
        fileName: `wasm-quick-${query.limit}.xlsx`,
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
