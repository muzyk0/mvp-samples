import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ExportFilterDto {
  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @IsOptional()
  @IsNumber()
  minSalary?: number;

  @IsOptional()
  @IsNumber()
  maxSalary?: number;
}

export const DEFAULT_EXPORT_LIMIT = 10_000;
export const DEFAULT_EXPORT_OFFSET = 0;
export const DEFAULT_EXPORT_BATCH_SIZE = 500;
export const DEFAULT_EXPORT_SEED = 12_345;
export const MAX_EXPORT_BATCH_SIZE = 10_000;

export const DEFAULT_BENCHMARK_OPTIONS: BenchmarkRequestDto = {
  limit: 2000,
  seed: DEFAULT_EXPORT_SEED,
  fileName: 'benchmark.xlsx',
  includeMemory: true,
};

export class ExportRequestDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ExportFilterDto)
  filters?: ExportFilterDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(DEFAULT_EXPORT_LIMIT)
  limit?: number = DEFAULT_EXPORT_LIMIT;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = DEFAULT_EXPORT_OFFSET;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_EXPORT_BATCH_SIZE)
  batchSize?: number = DEFAULT_EXPORT_BATCH_SIZE;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  seed?: number = DEFAULT_EXPORT_SEED;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  columns?: string[];

  @IsOptional()
  @IsString()
  fileName?: string = 'export.xlsx';

  @IsOptional()
  @IsString()
  sheetName?: string = 'Data';

  @IsOptional()
  @IsBoolean()
  includeHeaders?: boolean = true;
}

export class BenchmarkRequestDto extends ExportRequestDto {
  @IsOptional()
  @IsBoolean()
  includeMemory?: boolean = true;
}
