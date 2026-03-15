import { IsOptional, IsString, IsNumber, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

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
    @IsNumber()
    limit?: number = 10000;

    @IsOptional()
    @IsNumber()
    offset?: number = 0;

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
