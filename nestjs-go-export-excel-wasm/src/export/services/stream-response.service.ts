import { Injectable } from '@nestjs/common';
import { once } from 'events';
import type { Readable } from 'stream';
import type { Response } from 'express';

@Injectable()
export class StreamResponseService {
  prepareDownload(
    response: Response,
    fileName: string,
    contentType: string = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ): void {
    response.setHeader('Content-Type', contentType);
    const safeFileName = this.sanitizeFileName(fileName);
    const encodedFileName = encodeURIComponent(fileName || safeFileName);

    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`,
    );
    response.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Disposition, Content-Length',
    );
  }

  async pipeReadable(
    response: Response,
    readable: Readable,
    fileName: string,
    contentType?: string,
  ): Promise<void> {
    this.prepareDownload(response, fileName, contentType);
    readable.pipe(response);
    await once(response, 'finish');
  }

  sendBuffer(
    response: Response,
    buffer: Buffer,
    fileName: string,
    contentType: string = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ): void {
    this.prepareDownload(response, fileName, contentType);
    response.setHeader('Content-Length', buffer.length);
    response.end(buffer);
  }

  private sanitizeFileName(fileName: string): string {
    const withoutUnsafeChars = Array.from(fileName.normalize('NFKC'))
      .filter((char) => {
        const code = char.charCodeAt(0);
        return code >= 0x20 && code !== 0x7f;
      })
      .join('');

    const normalized = withoutUnsafeChars
      .replace(/[\r\n"]/g, '')
      .replace(/[\\/]+/g, '-')
      .replace(/;+|,+/g, '-')
      .trim();

    return normalized || 'export.xlsx';
  }
}
