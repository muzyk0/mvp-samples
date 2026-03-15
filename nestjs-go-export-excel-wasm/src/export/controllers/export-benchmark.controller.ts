import { Body, Controller, Get, Post } from '@nestjs/common';
import { BenchmarkRequestDto } from '../dto/export-request.dto';
import { ExportComparisonService } from '../services/export-comparison.service';

@Controller('export/benchmark')
export class ExportBenchmarkController {
  constructor(
    private readonly exportComparisonService: ExportComparisonService,
  ) {}

  @Post()
  async run(@Body() request: BenchmarkRequestDto) {
    return this.exportComparisonService.benchmark(request);
  }

  @Get('default')
  async runDefault() {
    return this.exportComparisonService.benchmark({
      limit: 2000,
      seed: 12345,
      fileName: 'benchmark.xlsx',
      includeMemory: true,
    });
  }
}
