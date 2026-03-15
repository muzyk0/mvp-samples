import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';
import {
  buildEmployeeSeedRecord,
  createMulberry32,
} from '../src/export/data/employee-generator';

const databaseUrl = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
const prisma = new PrismaClient({ adapter });
const DEFAULT_SEED = Number(process.env.SEED_DATASET_SEED ?? 20260315);
const DEFAULT_EMPLOYEE_COUNT = Number(process.env.SEED_EMPLOYEE_COUNT ?? 10000);
const BATCH_SIZE = 500;

function assertFiniteInteger(name: string, value: number, min = 0): void {
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be an integer >= ${min}, got: ${value}`);
  }
}

async function main() {
  assertFiniteInteger('SEED_DATASET_SEED', DEFAULT_SEED, 0);
  assertFiniteInteger('SEED_EMPLOYEE_COUNT', DEFAULT_EMPLOYEE_COUNT, 1);

  await prisma.employee.deleteMany();

  const rng = createMulberry32(DEFAULT_SEED);
  for (let start = 1; start <= DEFAULT_EMPLOYEE_COUNT; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE - 1, DEFAULT_EMPLOYEE_COUNT);
    const batch: ReturnType<typeof buildEmployeeSeedRecord>[] = [];

    for (let id = start; id <= end; id += 1) {
      batch.push(buildEmployeeSeedRecord(id, rng));
    }

    await prisma.employee.createMany({ data: batch });
  }

  console.log(
    JSON.stringify({
      seeded: DEFAULT_EMPLOYEE_COUNT,
      datasetSeed: DEFAULT_SEED,
      batchSize: BATCH_SIZE,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
