import {
    Controller,
    Get,
    Res,
    HttpStatus,
    Logger,
    Query
} from '@nestjs/common';
import type { Response } from 'express';
import { ExcelExportService } from '../services/excel-export.service';
import { DataGeneratorService } from '../services/data-generator.service';

@Controller('test-export')
export class TestExportController {
    private readonly logger = new Logger(TestExportController.name);

    constructor(
        private readonly excelExportService: ExcelExportService,
        private readonly dataGeneratorService: DataGeneratorService,
    ) {}

    /**
     * Простой тестовый экспорт без сложных параметров
     */
    @Get('simple')
    async simpleExport(
        @Query('limit') limit: string = '1000',
        @Res() response: Response
    ) {
        const limitNumber = parseInt(limit, 10) || 1000;

        this.logger.log(`Простой экспорт ${limitNumber} записей`);

        try {
            // Простая конфигурация
            const exportOptions = {
                limit: limitNumber,
                fileName: `test_export_${new Date().toISOString().split('T')[0]}.xlsx`,
                sheetName: 'Тестовые данные',
                columns: this.dataGeneratorService.getColumnNames().slice(0, 20) // Только 20 колонок для теста
            };

            await this.excelExportService.exportToResponse(response, exportOptions);
        } catch (error) {
            this.logger.error(`Ошибка простого экспорта: ${error.message}`);
            response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: 'Export failed',
                message: error.message
            });
        }
    }

    /**
     * Минимальный экспорт для отладки
     */
    @Get('minimal')
    async minimalExport(@Res() response: Response) {
        this.logger.log('Минимальный экспорт для отладки');

        try {
            // Минимальная конфигурация
            const exportOptions = {
                limit: 100,
                fileName: 'minimal_test.xlsx',
                sheetName: 'Тест',
                columns: ['ID', 'Имя', 'Email', 'Должность', 'Зарплата (итоговая)']
            };

            await this.excelExportService.exportToResponse(response, exportOptions);
        } catch (error) {
            this.logger.error(`Ошибка минимального экспорта: ${error.message}`);
            response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: 'Export failed',
                message: error.message,
                stack: error.stack
            });
        }
    }

    /**
     * Проверка генератора данных
     */
    @Get('test-data')
    async testData(@Query('limit') limit: string = '10') {
        const limitNumber = parseInt(limit, 10) || 10;

        this.logger.log(`Генерация тестовых данных: ${limitNumber} записей`);

        try {
            // Генерируем данные для проверки
            const data: Record<string, any>[] = [];
            const generator = this.dataGeneratorService.generateExportDataStream(
                undefined,
                limitNumber,
                10
            );

            for await (const batch of generator) {
                data.push(...batch);
            }

            return {
                success: true,
                count: data.length,
                sample: data[0],
                columns: Object.keys(data[0])
            };
        } catch (error) {
            this.logger.error(`Ошибка генерации данных: ${error.message}`);
            return {
                success: false,
                error: error.message,
                stack: error.stack
            };
        }
    }
}
