import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExcelExportModule } from './export/excel-export.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    ExcelExportModule,
  ],
})
export class AppModule {}
