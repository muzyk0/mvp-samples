-- CreateTable
CREATE TABLE "Employee" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "patronymic" TEXT NOT NULL,
    "workEmail" TEXT NOT NULL,
    "mobilePhone" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "birthDate" DATETIME NOT NULL,
    "age" INTEGER NOT NULL,
    "hireDate" DATETIME NOT NULL,
    "tenureYears" INTEGER NOT NULL,
    "employmentType" TEXT NOT NULL,
    "isRemote" BOOLEAN NOT NULL,
    "baseSalary" INTEGER NOT NULL,
    "bonusSalary" INTEGER NOT NULL,
    "totalSalary" INTEGER NOT NULL,
    "performanceRating" REAL NOT NULL,
    "isActive" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_workEmail_key" ON "Employee"("workEmail");

-- CreateIndex
CREATE INDEX "Employee_department_idx" ON "Employee"("department");

-- CreateIndex
CREATE INDEX "Employee_position_idx" ON "Employee"("position");

-- CreateIndex
CREATE INDEX "Employee_hireDate_idx" ON "Employee"("hireDate");

-- CreateIndex
CREATE INDEX "Employee_totalSalary_idx" ON "Employee"("totalSalary");

-- CreateIndex
CREATE INDEX "Employee_isActive_idx" ON "Employee"("isActive");
