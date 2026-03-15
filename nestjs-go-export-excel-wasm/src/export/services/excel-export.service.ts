import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ExportRequestDto } from '../dto/export-request.dto';
import { ExportData } from '../interfaces/export-data.interface';
import { DataGeneratorService } from './data-generator.service';
import { ExportComparisonService } from './export-comparison.service';
import { StreamResponseService } from './stream-response.service';

@Injectable()
export class ExcelExportService {
  private readonly logger = new Logger(ExcelExportService.name);

  constructor(
    private readonly exportComparisonService: ExportComparisonService,
    private readonly dataGeneratorService: DataGeneratorService,
    private readonly streamResponseService: StreamResponseService,
  ) {}

  async exportToResponse(
    response: Response,
    options: ExportRequestDto,
  ): Promise<void> {
    try {
      const result = await this.exportComparisonService.exportWithWasm(options);
      this.streamResponseService.sendBuffer(
        response,
        result.buffer,
        result.fileName,
        result.contentType,
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `WASM export failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(`Ошибка при экспорте: ${message}`);
    }
  }

  async exportToBuffer(
    options: ExportRequestDto,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const result = await this.exportComparisonService.exportWithWasm(options);
    return { buffer: result.buffer, fileName: result.fileName };
  }

  async getExportData(options: ExportRequestDto): Promise<ExportData> {
    const dataset = await this.dataGeneratorService.getDataset(options);
    return {
      rows: dataset.rows,
      total: dataset.total,
      columns: dataset.columns,
    };
  }

  validateExportOptions(
    options: ExportRequestDto,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if ((options.limit ?? 0) > 100000) {
      errors.push('Лимит не может превышать 100000 записей');
    }

    if ((options.limit ?? 0) <= 0) {
      errors.push('Лимит должен быть больше 0');
    }

    if (
      options.filters?.startDate &&
      options.filters?.endDate &&
      options.filters.startDate > options.filters.endDate
    ) {
      errors.push('Дата начала не может быть позже даты окончания');
    }

    if (
      typeof options.filters?.minSalary === 'number' &&
      typeof options.filters?.maxSalary === 'number' &&
      options.filters.minSalary > options.filters.maxSalary
    ) {
      errors.push('Минимальная зарплата не может быть больше максимальной');
    }

    return Promise.resolve({
      valid: errors.length === 0,
      errors,
    });
  }
}
