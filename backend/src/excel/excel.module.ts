import { Global, Module } from '@nestjs/common';
import { TeachersModule } from '../teachers/teachers.module';
import { ExcelService } from './excel.service';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

/** ExcelService is global because the Reports module (and any future export) builds workbooks with it. */
@Global()
@Module({
  imports: [TeachersModule],
  controllers: [ImportController],
  providers: [ExcelService, ImportService],
  exports: [ExcelService],
})
export class ExcelModule {}
