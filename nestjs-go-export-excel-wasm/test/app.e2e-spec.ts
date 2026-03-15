/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const binaryParser = (
  res: NodeJS.ReadableStream,
  callback: (error: Error | null, body: Buffer) => void,
) => {
  const chunks: Buffer[] = [];

  res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
  res.on('error', (error: Error) => callback(error, Buffer.alloc(0)));
};

describe('Export comparison app (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/export/exceljs/health (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/export/exceljs/health')
      .expect(200);

    expect(response.body).toEqual({
      status: 200,
      variant: 'exceljs',
    });
  });

  it('/export/wasm/status (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/export/wasm/status')
      .expect(200);

    expect(response.body.variant).toBe('wasm');
    expect(response.body.wasm.hasBinary).toBe(true);
  });

  it('/export/exceljs/download (POST)', async () => {
    const response = await request(app.getHttpServer())
      .post('/export/exceljs/download')
      .buffer(true)
      .parse(binaryParser)
      .send({ limit: 5, seed: 12345, fileName: 'exceljs-check.xlsx' })
      .expect(201);

    expect(response.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.headers['content-disposition']).toContain(
      'exceljs-check.xlsx',
    );
    expect(response.body.subarray(0, 2).toString()).toBe('PK');
  });

  it('/export/wasm/download (POST)', async () => {
    const response = await request(app.getHttpServer())
      .post('/export/wasm/download')
      .buffer(true)
      .parse(binaryParser)
      .send({ limit: 5, seed: 12345, fileName: 'wasm-check.xlsx' })
      .expect(201);

    expect(response.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.headers['content-disposition']).toContain(
      'wasm-check.xlsx',
    );
    expect(response.body.subarray(0, 2).toString()).toBe('PK');
  });

  it(
    '/export/benchmark/default (GET)',
    async () => {
      const response = await request(app.getHttpServer())
        .get('/export/benchmark/default')
        .expect(200);

      expect(response.body.request.limit).toBe(2000);
      expect(response.body.exceljs.variant).toBe('exceljs');
      expect(response.body.wasm.variant).toBe('wasm');
      expect(response.body.exceljs.sizeBytes).toBeGreaterThan(0);
      expect(response.body.wasm.sizeBytes).toBeGreaterThan(0);
    },
    20000,
  );
});
