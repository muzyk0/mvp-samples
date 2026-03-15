import { Injectable } from '@nestjs/common';
import { ExportFilterDto, ExportRequestDto } from '../dto/export-request.dto';
import {
  ExportDataRow,
  ExportDataset,
} from '../interfaces/export-data.interface';
import { ExportDatasetRepository } from '../repositories/export-dataset.repository';

@Injectable()
export class DataGeneratorService {
  constructor(
    private readonly exportDatasetRepository: ExportDatasetRepository,
  ) {}

  async getDataset(options: ExportRequestDto): Promise<ExportDataset> {
    return this.exportDatasetRepository.getDataset(options);
  }

  async *generateExportDataStream(
    optionsOrFilters?: ExportRequestDto | ExportFilterDto,
    limit?: number,
    batchSize?: number,
  ): AsyncGenerator<ExportDataRow[]> {
    const options = this.normalizeOptions(optionsOrFilters, limit, batchSize);
    const dataset = await this.getDataset(options);
    const chunkSize = options.batchSize ?? 500;

    for (let index = 0; index < dataset.rows.length; index += chunkSize) {
      yield dataset.rows.slice(index, index + chunkSize);
    }
  }

  async generateExportData(
    filters?: ExportFilterDto,
    limit: number = 10000,
  ): Promise<ExportDataset> {
    return this.getDataset({ filters, limit });
  }

  getColumnNames(): string[] {
    return this.exportDatasetRepository.getColumnNames();
  }

  private isExportRequestDto(
    value: ExportRequestDto | ExportFilterDto | undefined,
  ): value is ExportRequestDto {
    if (!value) {
      return false;
    }

    return (
      'limit' in value ||
      'columns' in value ||
      'fileName' in value ||
      'batchSize' in value
    );
  }

  private normalizeOptions(
    optionsOrFilters?: ExportRequestDto | ExportFilterDto,
    limit: number = 10000,
    batchSize: number = 500,
  ): ExportRequestDto {
    if (this.isExportRequestDto(optionsOrFilters)) {
      return {
        batchSize,
        ...optionsOrFilters,
      };
    }

    return {
      filters: optionsOrFilters,
      limit,
      batchSize,
    };
  }
}
