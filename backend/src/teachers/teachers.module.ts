import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Section } from '../sections/section.entity';
import { TeacherSection } from './teacher-section.entity';
import { Teacher } from './teacher.entity';
import { TeachersController } from './teachers.controller';
import { TeacherScopeService, TeachersService } from './teachers.service';

@Module({
  imports: [TypeOrmModule.forFeature([Teacher, TeacherSection, Section])],
  controllers: [TeachersController],
  providers: [TeachersService, TeacherScopeService],
  exports: [TeachersService, TeacherScopeService],
})
export class TeachersModule {}
