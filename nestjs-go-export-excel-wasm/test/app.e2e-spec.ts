import { afterEach, beforeEach, describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

const BENCHMARK_TEST_TIMEOUT = 20_000;

const binaryParser = (
  res: NodeJS.ReadableStream,
  callback: (error: Error | null, body: Buffer) => void,
) => {
  const chunks: Buffer[] = [];

  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
  res.on('error', (error: Error) => callback(error, Buffer.alloc(0)));
};

describe('Export comparison app (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { AppModule } = await import('../src/app.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
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

  it('/export/data (POST)', async () => {
    const response = await request(app.getHttpServer())
      .post('/export/data')
      .send({ limit: 5, seed: 12345 })
      .expect(201);

    expect(response.body.total).toBe(5);
    expect(response.body.seed).toBe(12345);
    expect(response.body.sample).toHaveLength(5);
    expect(response.body.sample[0]).toHaveProperty('ID');
    expect(response.body.sample[0]).toHaveProperty('Email рабочий');
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
    const body = response.body as Buffer;
    expect(body.subarray(0, 2).toString()).toBe('PK');
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
    const body = response.body as Buffer;
    expect(body.subarray(0, 2).toString()).toBe('PK');
  });

  it('/export/exceljs/quick rejects invalid query params', async () => {
    await request(app.getHttpServer())
      .get('/export/exceljs/quick?limit=Infinity&seed=abc')
      .expect(400);
  });

  it(
    '/export/wasm/quick accepts large limit values',
    async () => {
      const response = await request(app.getHttpServer())
        .get('/export/wasm/quick?limit=100001&seed=12345')
        .buffer(true)
        .parse(binaryParser)
        .expect(200);

      expect(response.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      const body = response.body as Buffer;
      expect(body.subarray(0, 2).toString()).toBe('PK');
    },
    BENCHMARK_TEST_TIMEOUT,
  );

  it('/export/exceljs/download sanitizes file name in content disposition', async () => {
    const response = await request(app.getHttpServer())
      .post('/export/exceljs/download')
      .buffer(true)
      .parse(binaryParser)
      .send({
        limit: 5,
        seed: 12345,
        fileName: 'evil\r\nname";malicious.xlsx',
      })
      .expect(201);

    expect(response.headers['content-disposition']).toContain(
      'attachment; filename="evilname-malicious.xlsx"',
    );
    expect(response.headers['content-disposition']).toContain(
      "filename*=UTF-8''",
    );
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
      expect(response.body.exceljs.buffer).toBeUndefined();
      expect(response.body.wasm.buffer).toBeUndefined();
      expect(typeof response.body.delta.memoryDeltaBytes).toBe('number');
    },
    BENCHMARK_TEST_TIMEOUT,
  );

  it('/export/benchmark omits memory deltas when includeMemory=false', async () => {
    const response = await request(app.getHttpServer())
      .post('/export/benchmark')
      .send({ limit: 20, seed: 12345, includeMemory: false })
      .expect(201);

    expect(response.body.exceljs.memoryDeltaBytes).toBeUndefined();
    expect(response.body.wasm.memoryDeltaBytes).toBeUndefined();
    expect(response.body.delta.memoryDeltaBytes).toBeUndefined();
  });

  it(
    '/export/benchmark preserves explicit large request.limit while rowCount reflects actual rows',
    async () => {
      const response = await request(app.getHttpServer())
        .post('/export/benchmark')
        .send({ limit: 100001, seed: 12345, includeMemory: false })
        .expect(201);

      expect(response.body.request.limit).toBe(100001);
      expect(response.body.exceljs.rowCount).toBeLessThanOrEqual(100001);
      expect(response.body.wasm.rowCount).toBeLessThanOrEqual(100001);
      expect(response.body.exceljs.rowCount).toBe(response.body.wasm.rowCount);
    },
    BENCHMARK_TEST_TIMEOUT,
  );

  it('/export/exceljs/download rejects invalid filter dates', async () => {
    await request(app.getHttpServer())
      .post('/export/exceljs/download')
      .send({
        limit: 5,
        seed: 12345,
        filters: { startDate: 'not-a-date' },
      })
      .expect(400);
  });

  it('/export/data rejects requests with only invalid explicit columns', async () => {
    await request(app.getHttpServer())
      .post('/export/data')
      .send({
        limit: 5,
        seed: 12345,
        columns: ['not-a-real-column'],
      })
      .expect(400);
  });
});
