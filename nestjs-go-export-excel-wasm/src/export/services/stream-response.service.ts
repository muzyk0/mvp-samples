import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { Readable } from 'stream';

@Injectable()
export class StreamResponseService {
    /**
     * Отправляет Readable stream в HTTP response
     */
    async pipeStreamToResponse(
        readableStream: Readable,
        response: Response,
        fileName: string,
        contentType: string = 'application/octet-stream'
    ): Promise<void> {
        // Устанавливаем заголовки
        response.setHeader('Content-Type', contentType);
        response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        response.setHeader('Transfer-Encoding', 'chunked');

        // Pipe stream в response
        readableStream.pipe(response);

        // Обработка ошибок
        readableStream.on('error', (error) => {
            console.error('Stream error:', error);
            if (!response.headersSent) {
                response.status(500).json({ error: 'Stream error', message: error.message });
            } else {
                response.end();
            }
        });

        // Завершение
        readableStream.on('end', () => {
            response.end();
        });
    }

    /**
     * Создает прогрессивный stream с информацией о прогрессе
     */
    createProgressStream(
        dataStream: AsyncGenerator<any>,
        totalItems: number,
        onProgress?: (percentage: number) => void
    ): Readable {
        let processed = 0;

        return new Readable({
            objectMode: true,
            async read() {
                try {
                    const { value, done } = await dataStream.next();

                    if (done) {
                        this.push(null); // Завершаем stream
                        return;
                    }

                    processed += Array.isArray(value) ? value.length : 1;

                    // Вызываем callback прогресса
                    if (onProgress && totalItems > 0) {
                        const percentage = Math.round((processed / totalItems) * 100);
                        onProgress(percentage);
                    }

                    this.push(value);
                } catch (error) {
                    this.destroy(error);
                }
            }
        });
    }
}
