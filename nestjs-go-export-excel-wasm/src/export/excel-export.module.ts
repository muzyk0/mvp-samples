import { Module } from '@nestjs/common';
import { ExcelExportController } from './controllers/excel-export.controller';
import { TestExportController } from './controllers/test-export.controller';
import { DebugController } from './controllers/debug.controller'; // Добавить эту строку
import { ExcelExportService } from './services/excel-export.service';
import { WasmExcelService } from './services/wasm-excel.service';
import { DataGeneratorService } from './services/data-generator.service';

@Module({
    controllers: [
        ExcelExportController,
        TestExportController,
        DebugController // Добавить эту строку
    ],
    providers: [
        ExcelExportService,
        WasmExcelService,
        DataGeneratorService
    ],
    exports: [
        ExcelExportService,
        WasmExcelService
    ]
})
export class ExcelExportModule {}
