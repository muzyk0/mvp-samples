import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    Res,
    HttpStatus,
    Logger,
    UseInterceptors,
    StreamableFile,
    Header,
    Param
} from '@nestjs/common';
import type { Response } from 'express';
import { ExcelExportService } from '../services/excel-export.service';
import { WasmExcelService } from '../services/wasm-excel.service';
import { ExportRequestDto } from '../dto/export-request.dto';
import { Readable } from 'stream';

@Controller('export')
export class ExcelExportController {
    private readonly logger = new Logger(ExcelExportController.name);

    constructor(
        private readonly excelExportService: ExcelExportService,
        private readonly wasmExcelService: WasmExcelService,
    ) {}

    /**
     * Экспорт данных в Excel с потоковой передачей
     */
    @Post('excel/stream')
    async exportExcelStream(
        @Body() exportRequest: ExportRequestDto,
        @Res() response: Response
    ) {
        this.logger.log(`Запрос на экспорт Excel (stream): ${JSON.stringify(exportRequest)}`);

        // Валидация параметров
        const validation = await this.excelExportService.validateExportOptions(exportRequest);
        if (!validation.valid) {
            return response.status(HttpStatus.BAD_REQUEST).json({
                error: 'Validation failed',
                details: validation.errors
            });
        }

        try {
            // Экспортируем данные в поток
            await this.excelExportService.exportToResponse(response, exportRequest);
        } catch (error) {
            this.logger.error(`Ошибка экспорта: ${error.message}`);
            return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: 'Export failed',
                message: error.message
            });
        }
    }

    /**
     * Экспорт данных в Excel с возвратом файла
     */
    @Post('excel/download')
    @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    @Header('Content-Disposition', 'attachment; filename="export.xlsx"')
    async exportExcelDownload(
        @Body() exportRequest: ExportRequestDto,
        @Res({ passthrough: true }) response: Response
    ): Promise<StreamableFile> {
        this.logger.log(`Запрос на скачивание Excel: ${JSON.stringify(exportRequest)}`);

        // Валидация параметров
        const validation = await this.excelExportService.validateExportOptions(exportRequest);
        if (!validation.valid) {
            response.status(HttpStatus.BAD_REQUEST);
            throw new Error(validation.errors.join(', '));
        }

        try {
            // Экспортируем в буфер
            const { buffer } = await this.excelExportService.exportToBuffer(exportRequest);

            // Создаем stream из буфера
            const stream = new Readable();
            stream.push(buffer);
            stream.push(null);

            // Устанавливаем имя файла в заголовке
            response.setHeader('Content-Disposition', `attachment; filename="${exportRequest.fileName}"`);

            return new StreamableFile(stream);
        } catch (error) {
            this.logger.error(`Ошибка скачивания: ${error.message}`);
            response.status(HttpStatus.INTERNAL_SERVER_ERROR);
            throw error;
        }
    }

    /**
     * Получение данных для экспорта (без файла)
     */
    @Post('data')
    async getExportData(@Body() exportRequest: ExportRequestDto) {
        this.logger.log(`Запрос данных для экспорта: ${JSON.stringify(exportRequest)}`);

        const validation = await this.excelExportService.validateExportOptions(exportRequest);
        if (!validation.valid) {
            return {
                success: false,
                errors: validation.errors
            };
        }

        try {
            const data = await this.excelExportService.getExportData(exportRequest);
            return {
                success: true,
                data: {
                    rows: data.rows.slice(0, 100), // Возвращаем только первые 100 строк для предпросмотра
                    total: data.total,
                    columns: data.columns
                }
            };
        } catch (error) {
            this.logger.error(`Ошибка получения данных: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Проверка статуса WASM модуля
     */
    @Get('wasm/status')
    getWasmStatus() {
        const status = this.wasmExcelService.getStatus();
        return {
            success: true,
            status,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Инициализация WASM модуля
     */
    @Post('wasm/initialize')
    async initializeWasm() {
        this.logger.log('Запрос на инициализацию WASM модуля');

        try {
            // Инициализируем с тестовыми заголовками
            const headers = ['ID', 'Имя', 'Email', 'Должность', 'Отдел'];
            const initialized = await this.wasmExcelService.initializeExport(headers);

            return {
                success: initialized,
                message: initialized ? 'WASM модуль инициализирован' : 'Ошибка инициализации WASM'
            };
        } catch (error) {
            this.logger.error(`Ошибка инициализации WASM: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Быстрый экспорт с параметрами по умолчанию
     */
    @Get('quick/:limit')
    async quickExport(
        @Param('limit') limit: number = 1000,
        @Res() response: Response
    ) {
        this.logger.log(`Быстрый экспорт ${limit} записей`);

        const exportRequest: ExportRequestDto = {
            limit,
            fileName: `quick_export_${new Date().toISOString().split('T')[0]}.xlsx`,
            sheetName: 'Быстрый экспорт'
        };

        try {
            await this.excelExportService.exportToResponse(response, exportRequest);
        } catch (error) {
            this.logger.error(`Ошибка быстрого экспорта: ${error.message}`);
            response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: 'Export failed',
                message: error.message
            });
        }
    }

    /**
     * Health check endpoint
     */
    @Get('health')
    healthCheck() {
        return {
            status: 'ok',
            service: 'excel-export',
            timestamp: new Date().toISOString(),
            wasm: this.wasmExcelService.getStatus()
        };
    }
}
