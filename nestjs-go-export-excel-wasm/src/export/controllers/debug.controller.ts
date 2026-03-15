import {
    Controller,
    Get,
    Post,
    Res,
    HttpStatus,
    Logger,
    Body
} from '@nestjs/common';
import type { Response } from 'express';
import { WasmExcelService } from '../services/wasm-excel.service';
import { DataGeneratorService } from '../services/data-generator.service';

@Controller('debug')
export class DebugController {
    private readonly logger = new Logger(DebugController.name);

    constructor(
        private readonly wasmExcelService: WasmExcelService,
        private readonly dataGeneratorService: DataGeneratorService,
    ) {}

    @Get('test-wasm')
    async testWasm(@Res() response: Response) {
        try {
            this.logger.log('Тестирование WASM модуля...');

            // Тестовые заголовки
            const headers = ['ID', 'Имя', 'Email', 'Должность', 'Зарплата'];

            // Тестовые данные (массив объектов)
            const testData = [
                { 'ID': 1, 'Имя': 'Иван', 'Email': 'ivan@test.com', 'Должность': 'Developer', 'Зарплата': 100000 },
                { 'ID': 2, 'Имя': 'Мария', 'Email': 'maria@test.com', 'Должность': 'Designer', 'Зарплата': 90000 },
                { 'ID': 3, 'Имя': 'Алексей', 'Email': 'alex@test.com', 'Должность': 'Manager', 'Зарплата': 120000 },
                { 'ID': 4, 'Имя': 'Екатерина', 'Email': 'katya@test.com', 'Должность': 'Analyst', 'Зарплата': 95000 },
                { 'ID': 5, 'Имя': 'Дмитрий', 'Email': 'dima@test.com', 'Должность': 'QA Engineer', 'Зарплата': 85000 }
            ];

            // Тестируем экспорт
            const success = await this.wasmExcelService.testExport(headers, testData);

            if (success) {
                return response.status(HttpStatus.OK).json({
                    success: true,
                    message: 'WASM модуль работает корректно',
                    testData: testData
                });
            } else {
                return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                    success: false,
                    message: 'WASM модуль не работает'
                });
            }
        } catch (error) {
            this.logger.error(`Ошибка тестирования WASM: ${error.message}`);
            return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: error.message,
                stack: error.stack
            });
        }
    }

    @Post('test-export-objects')
    async testExportObjects(@Body() body: any, @Res() response: Response) {
        try {
            const { count = 10, columns } = body;

            this.logger.log(`Тестовый экспорт объектов: ${count} записей`);

            // Устанавливаем заголовки
            response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            response.setHeader('Content-Disposition', 'attachment; filename="test_objects.xlsx"');

            // Получаем колонки
            const columnList = columns || this.dataGeneratorService.getColumnNames().slice(0, 10);

            // Создаем генератор данных
            const dataStream = this.dataGeneratorService.generateExportDataStream(
                undefined,
                count,
                5 // небольшой batch для теста
            );

            // Создаем кастомный callback для отладки
            let progressLog = '';
            const onProgress = (progress: any) => {
                progressLog += `Прогресс: ${progress.percentage}%\n`;
            };

            // Получаем поток с данными Excel
            const excelStream = await this.wasmExcelService.exportToStream(
                dataStream,
                columnList,
                onProgress
            );

            // Отправляем поток клиенту
            excelStream.pipe(response);

            // Обработка завершения
            excelStream.on('end', () => {
                this.logger.log('Тестовый экспорт завершен');
                response.end();
            });

            excelStream.on('error', (error) => {
                this.logger.error(`Ошибка тестового экспорта: ${error.message}`);
                response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                    error: 'Export failed',
                    message: error.message,
                    progressLog
                });
            });

        } catch (error) {
            this.logger.error(`Ошибка в тестовом экспорте: ${error.message}`);
            response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: 'Test export failed',
                message: error.message,
                stack: error.stack
            });
        }
    }

    @Get('sample-data')
    getSampleData() {
        // Генерируем несколько примеров данных
        const sampleRows: Record<string, any>[] = [];
        for (let i = 1; i <= 5; i++) {
            sampleRows.push(this.dataGeneratorService.generateRowObject(i));
        }

        return {
            success: true,
            data: sampleRows,
            columns: this.dataGeneratorService.getColumnNames(),
            description: 'Пример данных в формате объектов (как для ExcelJS)'
        };
    }
}
