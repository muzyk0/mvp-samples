import { Injectable } from '@nestjs/common';
import {
  DEFAULT_EXPORT_BATCH_SIZE,
  DEFAULT_EXPORT_LIMIT,
  ExportFilterDto,
  ExportRequestDto,
} from '../dto/export-request.dto';
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
    const chunkSize = this.normalizeBatchSize(options.batchSize);

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
      'batchSize' in value ||
      'filters' in value ||
      'seed' in value ||
      'offset' in value
    );
  }

  private normalizeOptions(
    optionsOrFilters?: ExportRequestDto | ExportFilterDto,
    limit: number = DEFAULT_EXPORT_LIMIT,
    batchSize: number = DEFAULT_EXPORT_BATCH_SIZE,
  ): ExportRequestDto {
    if (this.isExportRequestDto(optionsOrFilters)) {
      return {
        limit,
        batchSize: this.normalizeBatchSize(
          optionsOrFilters.batchSize ?? batchSize,
        ),
        ...optionsOrFilters,
      };
    }

    return {
      filters: optionsOrFilters,
      limit,
      batchSize: this.normalizeBatchSize(batchSize),
    };
  }

  private normalizeBatchSize(batchSize: number | undefined): number {
    const effectiveBatchSize = batchSize ?? DEFAULT_EXPORT_BATCH_SIZE;

    if (effectiveBatchSize <= 0) {
      throw new Error('batchSize must be greater than 0');
    }

    return effectiveBatchSize;
  }
}
