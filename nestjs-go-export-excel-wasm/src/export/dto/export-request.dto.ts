import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
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
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  endDate?: Date;

  @IsOptional()
  @IsNumber()
  minSalary?: number;

  @IsOptional()
  @IsNumber()
  maxSalary?: number;
}

export class ExportRequestDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ExportFilterDto)
  filters?: ExportFilterDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  limit: number = 10000;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  batchSize?: number = 500;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  seed?: number = 12345;

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
