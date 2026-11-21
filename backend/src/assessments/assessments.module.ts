import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarksModule } from '../marks/marks.module';
import { StudentsModule } from '../students/students.module';
import { TeachersModule } from '../teachers/teachers.module';
import { AssessmentCategory } from './assessment-category.entity';
import { AssessmentRecord } from './assessment-record.entity';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';

@Module({
  imports: [TypeOrmModule.forFeature([AssessmentCategory, AssessmentRecord]), TeachersModule, StudentsModule, MarksModule],
  controllers: [AssessmentsController],
  providers: [AssessmentsService],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
