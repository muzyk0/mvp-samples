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
import { parseQuickExportQuery } from './export-query-validation';

@Controller('export/exceljs')
export class ExceljsExportController {
  constructor(
    private readonly exportComparisonService: ExportComparisonService,
  ) {}

  @Post('download')
  async download(
    @Body() request: ExportRequestDto,
    @Res() response: Response,
  ): Promise<void> {
    await this.exportComparisonService.streamExcelJsToResponse(
      {
        ...request,
        fileName: request.fileName ?? 'exceljs-export.xlsx',
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
        fileName: `exceljs-quick-${query.limit}.xlsx`,
      },
      response,
    );
  }

  @Get('health')
  health() {
    return {
      status: HttpStatus.OK,
      variant: 'exceljs',
    };
  }
}
