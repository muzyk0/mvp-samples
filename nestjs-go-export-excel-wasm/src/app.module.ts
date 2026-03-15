import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExcelExportModule } from './export/excel-export.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: '.env'
        }),
        ExcelExportModule
    ],
})
export class AppModule {}
