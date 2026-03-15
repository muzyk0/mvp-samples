import { Injectable } from '@nestjs/common';
import type { Response } from 'express';

@Injectable()
export class StreamResponseService {
  sendBuffer(
    response: Response,
    buffer: Buffer,
    fileName: string,
    contentType: string = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ): void {
    response.setHeader('Content-Type', contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`,
    );
    response.setHeader('Content-Length', buffer.length);
    response.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Disposition, Content-Length',
    );
    response.end(buffer);
  }
}
