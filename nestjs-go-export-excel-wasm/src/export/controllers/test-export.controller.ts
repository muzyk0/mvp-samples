import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ExportComparisonService } from '../services/export-comparison.service';
import { StreamResponseService } from '../services/stream-response.service';
import { DataGeneratorService } from '../services/data-generator.service';

@Controller('test-export')
export class TestExportController {
  constructor(
    private readonly exportComparisonService: ExportComparisonService,
    private readonly streamResponseService: StreamResponseService,
    private readonly dataGeneratorService: DataGeneratorService,
  ) {}

  @Get('simple')
  async simpleExport(
    @Query('limit') limit = '1000',
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.exportComparisonService.exportWithWasm({
      limit: Number(limit),
      fileName: 'test-export.xlsx',
    });

    this.streamResponseService.sendBuffer(
      response,
      result.buffer,
      result.fileName,
      result.contentType,
    );
  }

  @Get('minimal')
  async minimalExport(@Res() response: Response): Promise<void> {
    await this.simpleExport('100', response);
  }

  @Get('test-data')
  async testData(@Query('limit') limit = '10') {
    const dataset = await this.dataGeneratorService.getDataset({
      limit: Number(limit),
    });
    return {
      success: true,
      count: dataset.total,
      sample: dataset.rows[0],
      columns: dataset.columns,
    };
  }
}
