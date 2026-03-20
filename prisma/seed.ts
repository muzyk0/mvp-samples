import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import {
  buildEmployeeSeedRecord,
  createMulberry32,
} from '../src/export/data/employee-generator';

const databaseUrl = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
const DEFAULT_SEED = Number(process.env.SEED_DATASET_SEED ?? 20260315);
const DEFAULT_EMPLOYEE_COUNT = Number(process.env.SEED_EMPLOYEE_COUNT ?? 10000);
const DEFAULT_BATCH_SIZE = Number(process.env.SEED_BATCH_SIZE ?? 1000);

function assertFiniteInteger(name: string, value: number, min = 0): void {
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be an integer >= ${min}, got: ${value}`);
  }
}

function resolveSqlitePath(url: string): string {
  if (!url.startsWith('file:')) {
    throw new Error(
      `Only sqlite file: URLs are supported for seeding, got: ${url}`,
    );
  }

  return resolve(process.cwd(), url.slice('file:'.length));
}

async function main() {
  assertFiniteInteger('SEED_DATASET_SEED', DEFAULT_SEED, 0);
  assertFiniteInteger('SEED_EMPLOYEE_COUNT', DEFAULT_EMPLOYEE_COUNT, 1);
  assertFiniteInteger('SEED_BATCH_SIZE', DEFAULT_BATCH_SIZE, 1);

  const sqlitePath = resolveSqlitePath(databaseUrl);
  const db = new Database(sqlitePath);

  try {
    db.pragma('journal_mode = WAL');

    const clearEmployees = db.prepare('DELETE FROM "Employee"');
    const insertEmployee = db.prepare(`
      INSERT INTO "Employee" (
        "id",
        "firstName",
        "lastName",
        "patronymic",
        "workEmail",
        "mobilePhone",
        "position",
        "department",
        "city",
        "birthDate",
        "age",
        "hireDate",
        "tenureYears",
        "employmentType",
        "isRemote",
        "baseSalary",
        "bonusSalary",
        "totalSalary",
        "performanceRating",
        "isActive",
        "createdAt",
        "updatedAt"
      ) VALUES (
        @id,
        @firstName,
        @lastName,
        @patronymic,
        @workEmail,
        @mobilePhone,
        @position,
        @department,
        @city,
        @birthDate,
        @age,
        @hireDate,
        @tenureYears,
        @employmentType,
        @isRemote,
        @baseSalary,
        @bonusSalary,
        @totalSalary,
        @performanceRating,
        @isActive,
        @createdAt,
        @updatedAt
      )
    `);

    const insertBatch = db.transaction(
      (batch: ReturnType<typeof buildEmployeeSeedRecord>[]) => {
        const now = new Date().toISOString();

        for (const employee of batch) {
          insertEmployee.run({
            ...employee,
            birthDate: employee.birthDate.toISOString(),
            hireDate: employee.hireDate.toISOString(),
            isRemote: employee.isRemote ? 1 : 0,
            isActive: employee.isActive ? 1 : 0,
            createdAt: now,
            updatedAt: now,
          });
        }
      },
    );

    clearEmployees.run();

    const rng = createMulberry32(DEFAULT_SEED);
    for (
      let start = 1;
      start <= DEFAULT_EMPLOYEE_COUNT;
      start += DEFAULT_BATCH_SIZE
    ) {
      const end = Math.min(
        start + DEFAULT_BATCH_SIZE - 1,
        DEFAULT_EMPLOYEE_COUNT,
      );
      const batchSize = end - start + 1;
      const batch = Array.from({ length: batchSize }, (_, index) =>
        buildEmployeeSeedRecord(start + index, rng),
      );

      insertBatch(batch);
    }

    console.log(
      JSON.stringify({
        seeded: DEFAULT_EMPLOYEE_COUNT,
        datasetSeed: DEFAULT_SEED,
        batchSize: DEFAULT_BATCH_SIZE,
        databaseUrl,
      }),
    );
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
