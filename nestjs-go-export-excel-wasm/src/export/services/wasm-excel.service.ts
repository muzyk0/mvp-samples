import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Readable } from 'stream';
import { WasmChunkCallback, WasmExportResult } from '../interfaces/wasm-callback.interface';
import { WasmProgress } from '../interfaces/export-data.interface';

declare const Go: any;

@Injectable()
export class WasmExcelService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(WasmExcelService.name);
    private wasmBuffer: Buffer;
    private goInstance: any;
    private isInitialized = false;
    private wasmModulePath = join(__dirname, '../../../excel-streamer/excel_bridge.wasm');
    private wasmExecPath = join(__dirname, '../../../excel-streamer/wasm_exec.js');

    constructor() {
        this.loadWasmFiles();
    }

    async onModuleInit() {
        this.logger.log('Инициализация WASM сервиса');
    }

    onModuleDestroy() {
        this.cleanup();
    }

    private loadWasmFiles(): void {
        try {
            // Загружаем wasm_exec.js
            const wasmExecCode = readFileSync(this.wasmExecPath, 'utf8');
            eval(wasmExecCode);

            // Загружаем WASM бинарник
            this.wasmBuffer = readFileSync(this.wasmModulePath);

            this.logger.log('WASM файлы загружены');
        } catch (error) {
            this.logger.error(`Ошибка загрузки WASM файлов: ${error.message}`);
            throw error;
        }
    }

    async initializeExport(headers: string[]): Promise<boolean> {
        try {
            if (!this.wasmBuffer) {
                throw new Error('WASM не инициализирован');
            }

            // Создаем экземпляр Go
            this.goInstance = new Go();

            // Компилируем и инстанцируем WASM модуль
            // @ts-expect-error
            const { instance } = await WebAssembly.instantiate(this.wasmBuffer, this.goInstance.importObject);

            // Запускаем Go runtime в фоновом режиме
            this.goInstance.run(instance).catch((err: Error) => {
                this.logger.error(`Ошибка в Go runtime: ${err.message}`);
            });

            // Ждем инициализации WASM модуля
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Проверяем экспортированные функции
            if (typeof (global as any).goInitExport === 'undefined') {
                throw new Error('Go функции не экспортированы');
            }

            this.isInitialized = true;
            this.logger.log(`WASM экспорт инициализирован с ${headers.length} колонками`);

            return true;
        } catch (error) {
            this.logger.error(`Ошибка инициализации WASM: ${error.message}`);
            this.isInitialized = false;
            return false;
        }
    }

    async exportToStream(
        dataGenerator: AsyncGenerator<Record<string, any>[]>,
        headers: string[],
        onProgress?: (progress: WasmProgress) => void
    ): Promise<Readable> {
        const startTime = Date.now();
        let exportedRows = 0;

        // Инициализируем WASM если еще не инициализирован
        if (!this.isInitialized) {
            const initialized = await this.initializeExport(headers);
            if (!initialized) {
                throw new Error('Не удалось инициализировать WASM экспорт');
            }
        }

        // Создаем Readable stream для отправки данных клиенту
        const readableStream = new Readable({
            read() {}
        });

        // Callback для получения чанков от WASM
        const chunkCallback: WasmChunkCallback = (chunk: Uint8Array, status: string) => {
            if (status === 'INIT_OK') {
                this.logger.debug('WASM инициализирован успешно');
                return;
            }

            if (status === 'COMPLETE') {
                const duration = Date.now() - startTime;
                this.logger.log(`Экспорт завершен: ${exportedRows} строк, время: ${duration}ms`);
                readableStream.push(null);
                return;
            }

            if (status && status.startsWith('CHUNK:')) {
                const parts = status.split(':');
                const currentChunk = parseInt(parts[1]);
                const totalChunks = parseInt(parts[2]);
                const fileSize = parseInt(parts[3]);

                // Отправляем чанк в поток
                if (chunk && chunk.length > 0) {
                    readableStream.push(Buffer.from(chunk));
                }

                // Вызываем callback прогресса
                if (onProgress && totalChunks > 0) {
                    const percentage = Math.round((currentChunk / totalChunks) * 100);
                    onProgress({
                        current: currentChunk,
                        total: totalChunks,
                        percentage
                    });

                    // Логируем каждые 10%
                    if (percentage % 10 === 0) {
                        this.logger.debug(`Прогресс экспорта: ${percentage}%`);
                    }
                }
                return;
            }

            if (status && status !== '' && status !== 'INIT_OK') {
                const error = new Error(`Ошибка WASM: ${status}`);
                this.logger.error(error.message);
                readableStream.destroy(error);
                return;
            }
        };

        // Экспортируем callback в глобальную область
        (global as any).receiveChunk = chunkCallback;

        try {
            // Инициализируем экспорт в WASM
            this.logger.debug(`Инициализация экспорта с ${headers.length} колонками`);
            const initResult = (global as any).goInitExport(headers, (global as any).receiveChunk);

            if (initResult && initResult.toString().includes('Ошибка')) {
                throw new Error(`Ошибка инициализации WASM: ${initResult}`);
            }

            // Ждем завершения инициализации
            await new Promise(resolve => setTimeout(resolve, 500));

            // Перебираем данные и отправляем в WASM как объекты
            for await (const batch of dataGenerator) {
                exportedRows += batch.length;

                // Конвертируем batch в JSON строку (массив объектов)
                const jsonData = JSON.stringify(batch);

                // Отправляем данные в WASM
                const result = (global as any).goWriteRows(jsonData);

                if (result && result.toString().includes('Ошибка')) {
                    throw new Error(`Ошибка записи в WASM: ${result}`);
                }

                // Логирование прогресса
                if (exportedRows % 1000 === 0) {
                    this.logger.debug(`Экспортировано ${exportedRows} строк`);
                }

                // Небольшая пауза для асинхронной обработки
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            // Завершаем экспорт и получаем файл
            this.logger.debug('Завершение экспорта...');
            const finalizeResult = (global as any).goFinalizeExport();

            if (finalizeResult && finalizeResult.toString().includes('Ошибка')) {
                throw new Error(`Ошибка завершения экспорта: ${finalizeResult}`);
            }

            // Ждем завершения отправки файла
            await new Promise(resolve => setTimeout(resolve, 2000));

            return readableStream;
        } catch (error) {
            this.logger.error(`Ошибка при экспорте: ${error.message}`);
            readableStream.destroy(error);
            throw error;
        }
    }

    async exportToBuffer(
        dataGenerator: AsyncGenerator<Record<string, any>[]>,
        headers: string[]
    ): Promise<{ buffer: Buffer; result: WasmExportResult }> {
        const chunks: Buffer[] = [];
        let totalSize = 0;

        const stream = await this.exportToStream(dataGenerator, headers, (progress) => {
            this.logger.debug(`Прогресс: ${progress.current}/${progress.total} (${progress.percentage}%)`);
        });

        return new Promise((resolve, reject) => {
            stream.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
                totalSize += chunk.length;
            });

            stream.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const result: WasmExportResult = {
                    success: true,
                    size: totalSize,
                    duration: 0
                };
                resolve({ buffer, result });
            });

            stream.on('error', (error) => {
                reject(error);
            });
        });
    }

    async testExport(headers: string[], sampleData: Record<string, any>[]): Promise<boolean> {
        try {
            if (!this.isInitialized) {
                await this.initializeExport(headers);
            }

            // Экспортируем callback для получения статуса
            let testSuccess = false;
            (global as any).testCallback = (chunk: Uint8Array, status: string) => {
                if (status === 'INIT_OK') {
                    this.logger.debug('Тест: WASM инициализирован');
                } else if (status === 'COMPLETE') {
                    testSuccess = true;
                    this.logger.debug('Тест: экспорт завершен успешно');
                }
            };

            // Инициализируем
            (global as any).goInitExport(headers.slice(0, 5), (global as any).testCallback);
            await new Promise(resolve => setTimeout(resolve, 500));

            // Записываем тестовые данные
            const result = (global as any).goWriteRows(JSON.stringify(sampleData));

            if (result && result.toString().includes('Ошибка')) {
                this.logger.error(`Тестовая запись не удалась: ${result}`);
                return false;
            }

            // Завершаем
            (global as any).goFinalizeExport();
            await new Promise(resolve => setTimeout(resolve, 1000));

            return testSuccess;
        } catch (error) {
            this.logger.error(`Тест экспорта не удался: ${error.message}`);
            return false;
        }
    }

    private cleanup(): void {
        this.isInitialized = false;
        this.goInstance = null;
        this.logger.log('WASM ресурсы очищены');
    }

    getStatus(): { isInitialized: boolean } {
        return {
            isInitialized: this.isInitialized
        };
    }
}
