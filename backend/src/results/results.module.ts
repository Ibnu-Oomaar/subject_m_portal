import { Module } from '@nestjs/common';
import { StudentsModule } from '../students/students.module';
import { TeachersModule } from '../teachers/teachers.module';
import { MeController, StudentProfileController } from './results.controller';
import { ResultsService } from './results.service';

@Module({
  imports: [StudentsModule, TeachersModule],
  controllers: [StudentProfileController, MeController],
  providers: [ResultsService],
  exports: [ResultsService],
})
export class ResultsModule {}
