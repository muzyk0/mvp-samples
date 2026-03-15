import { Controller, Get } from '@nestjs/common';
import { DataGeneratorService } from '../services/data-generator.service';
import { WasmExcelService } from '../services/wasm-excel.service';

@Controller('debug')
export class DebugController {
  constructor(
    private readonly wasmExcelService: WasmExcelService,
    private readonly dataGeneratorService: DataGeneratorService,
  ) {}

  @Get('test-wasm')
  async testWasm() {
    const headers = this.dataGeneratorService.getColumnNames().slice(0, 5);
    const sampleData = headers.length
      ? [this.dataGeneratorService.generateRowObject(1)]
      : [];
    const success = await this.wasmExcelService.testExport(headers, sampleData);

    return {
      success,
      headers,
    };
  }

  @Get('sample-data')
  getSampleData() {
    return {
      success: true,
      data: [this.dataGeneratorService.generateRowObject(1)],
      columns: this.dataGeneratorService.getColumnNames(),
    };
  }
}
