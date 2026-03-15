import { Module } from '@nestjs/common';
import { ExceljsExportController } from './controllers/exceljs-export.controller';
import { WasmExportController } from './controllers/wasm-export.controller';
import { ExportBenchmarkController } from './controllers/export-benchmark.controller';
import { ExportDatasetController } from './controllers/export-dataset.controller';
import { DataGeneratorService } from './services/data-generator.service';
import { ExceljsExportService } from './services/exceljs-export.service';
import { WasmExcelService } from './services/wasm-excel.service';
import { StreamResponseService } from './services/stream-response.service';
import { ExportComparisonService } from './services/export-comparison.service';

@Module({
  controllers: [
    ExceljsExportController,
    WasmExportController,
    ExportBenchmarkController,
    ExportDatasetController,
  ],
  providers: [
    DataGeneratorService,
    ExceljsExportService,
    WasmExcelService,
    StreamResponseService,
    ExportComparisonService,
  ],
})
export class ExcelExportModule {}
