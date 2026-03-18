import { HttpException, Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExcelExportService } from './excel-export.service';

describe('ExcelExportService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
    const loggerError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const service = createService(() => Promise.reject(new Error('boom')));

    await expect(
      service.exportToResponse({} as never, { limit: 1 } as never),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(500);
      expect((error as HttpException).message).toBe(
        'Ошибка при экспорте: boom',
      );
      return true;
    });

    expect(loggerError).toHaveBeenCalledWith(
      'WASM export failed: boom',
      expect.any(String),
    );
  });
});
