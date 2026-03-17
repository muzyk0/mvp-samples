import { HttpException, InternalServerErrorException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ExcelExportService } from './excel-export.service';

describe('ExcelExportService', () => {
  const createService = (
    exportWithWasm: (options: unknown) => Promise<{
      buffer: Buffer;
      fileName: string;
      contentType: string;
    }>,
  ) =>
    new ExcelExportService(
      {
        exportWithWasm,
      } as never,
      {} as never,
      {
        sendBuffer: vi.fn(),
      } as never,
    );

  it('rethrows any HttpException from the exporter', async () => {
    const expectedError = new HttpException('conflict', 409);
    const service = createService(() => Promise.reject(expectedError));

    await expect(
      service.exportToResponse({} as never, { limit: 1 } as never),
    ).rejects.toBe(expectedError);
  });

  it('wraps unexpected exporter errors as internal server errors', async () => {
    const service = createService(() => Promise.reject(new Error('boom')));

    await expect(
      service.exportToResponse({} as never, { limit: 1 } as never),
    ).rejects.toMatchObject({
      status: 500,
      message: 'Ошибка при экспорте: boom',
    });
  });
});
