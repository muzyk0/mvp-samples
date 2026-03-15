import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { Readable } from 'stream';
import { WasmExcelService } from './wasm-excel.service';
import { DataGeneratorService } from './data-generator.service';
import { ExportRequestDto, ExportFilterDto } from '../dto/export-request.dto';
import { ExportData, WasmProgress } from '../interfaces/export-data.interface';

@Injectable()
export class ExcelExportService {
    private readonly logger = new Logger(ExcelExportService.name);

    constructor(
        private readonly wasmExcelService: WasmExcelService,
        private readonly dataGeneratorService: DataGeneratorService,
    ) {}

    async exportToResponse(
        response: Response,
        options: ExportRequestDto
    ): Promise<void> {
        this.logger.log(`Начало экспорта в Excel: ${JSON.stringify(options)}`);

        const startTime = Date.now();

        try {
            // Устанавливаем заголовки ответа
            response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            response.setHeader('Content-Disposition', `attachment; filename="${options.fileName}"`);
            response.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

            // Получаем колонки для экспорта
            const columns = options.columns || this.dataGeneratorService.getColumnNames();

            // Создаем генератор данных
            const dataStream = this.dataGeneratorService.generateExportDataStream(
                options.filters,
                options.limit,
                500 // batch size
            );

            // Настраиваем callback для прогресса
            const onProgress = (progress: WasmProgress) => {
                this.logger.debug(`Прогресс экспорта: ${progress.percentage}%`);
                // Здесь можно отправлять прогресс через WebSocket или сохранять в базу
            };

            // Получаем поток с данными Excel из WASM
            const excelStream = await this.wasmExcelService.exportToStream(
                dataStream,
                columns,
                onProgress
            );

            // Отправляем поток клиенту
            excelStream.pipe(response);

            // Обработка завершения
            excelStream.on('end', () => {
                const duration = Date.now() - startTime;
                this.logger.log(`Экспорт завершен за ${duration}ms`);
                response.end();
            });

            excelStream.on('error', (error) => {
                this.logger.error(`Ошибка при экспорте: ${error.message}`);
                response.status(500).json({
                    error: 'Ошибка при экспорте',
                    message: error.message
                });
            });

        } catch (error) {
            this.logger.error(`Ошибка в exportToResponse: ${error.message}`);
            throw new BadRequestException(`Ошибка при экспорте: ${error.message}`);
        }
    }

    async exportToBuffer(options: ExportRequestDto): Promise<{ buffer: Buffer; fileName: string }> {
        this.logger.log(`Начало экспорта в буфер: ${JSON.stringify(options)}`);

        const startTime = Date.now();

        try {
            // Получаем колонки для экспорта
            const columns = options.columns || this.dataGeneratorService.getColumnNames();

            // Создаем генератор данных
            const dataStream = this.dataGeneratorService.generateExportDataStream(
                options.filters,
                options.limit,
                500 // batch size
            );

            // Экспортируем в буфер через WASM
            const { buffer } = await this.wasmExcelService.exportToBuffer(
                dataStream,
                columns
            );

            const duration = Date.now() - startTime;
            this.logger.log(`Экспорт в буфер завершен за ${duration}ms, размер: ${buffer.length} байт`);

            return {
                buffer,
                fileName: options.fileName!
            };
        } catch (error) {
            this.logger.error(`Ошибка при экспорте в буфер: ${error.message}`);
            throw new BadRequestException(`Ошибка при экспорте: ${error.message}`);
        }
    }

    async getExportData(options: ExportRequestDto): Promise<ExportData> {
        this.logger.log(`Получение данных для экспорта: ${JSON.stringify(options)}`);

        try {
            // В реальном приложении здесь будет запрос к другому сервису
            return await this.dataGeneratorService.generateExportData(
                options.filters,
                options.limit
            );
        } catch (error) {
            this.logger.error(`Ошибка при получении данных: ${error.message}`);
            throw new BadRequestException(`Ошибка при получении данных: ${error.message}`);
        }
    }

    async validateExportOptions(options: ExportRequestDto): Promise<{ valid: boolean; errors: string[] }> {
        const errors: string[] = [];

        // Проверка лимита
        if (options.limit && options.limit > 100000) {
            errors.push('Лимит не может превышать 100000 записей');
        }

        // Проверка дат
        if (options.filters?.startDate && options.filters?.endDate) {
            if (options.filters.startDate > options.filters.endDate) {
                errors.push('Дата начала не может быть позже даты окончания');
            }
        }

        // Проверка зарплаты
        if (options.filters?.minSalary && options.filters?.maxSalary) {
            if (options.filters.minSalary > options.filters.maxSalary) {
                errors.push('Минимальная зарплата не может быть больше максимальной');
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}
