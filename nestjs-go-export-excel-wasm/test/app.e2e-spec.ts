/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

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

  it('/export/wasm/status (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/export/wasm/status')
      .expect(200);

    expect(response.body.variant).toBe('wasm');
    expect(response.body.wasm.hasBinary).toBe(true);
  });

  it('/export/benchmark/default (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/export/benchmark/default')
      .expect(200);

    expect(response.body.request.limit).toBe(2000);
    expect(response.body.exceljs.variant).toBe('exceljs');
    expect(response.body.wasm.variant).toBe('wasm');
    expect(response.body.exceljs.sizeBytes).toBeGreaterThan(0);
    expect(response.body.wasm.sizeBytes).toBeGreaterThan(0);
  });
});
