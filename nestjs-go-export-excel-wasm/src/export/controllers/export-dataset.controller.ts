import { Body, Controller, Post } from '@nestjs/common';
import { ExportRequestDto } from '../dto/export-request.dto';
import { DataGeneratorService } from '../services/data-generator.service';

@Controller('export/data')
export class ExportDatasetController {
  constructor(private readonly dataGeneratorService: DataGeneratorService) {}

  @Post()
  async preview(@Body() request: ExportRequestDto) {
    const dataset = await this.dataGeneratorService.getDataset(request);

    return {
      total: dataset.total,
      seed: dataset.seed,
      columns: dataset.columns,
      sample: dataset.rows.slice(0, Math.min(dataset.rows.length, 5)),
    };
  }
}
