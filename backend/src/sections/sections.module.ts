import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeachersModule } from '../teachers/teachers.module';
import { SectionsController } from './sections.controller';
import { Section } from './section.entity';
import { SectionsService } from './sections.service';

@Module({
  imports: [TypeOrmModule.forFeature([Section]), TeachersModule],
  controllers: [SectionsController],
  providers: [SectionsService],
  exports: [SectionsService],
})
export class SectionsModule {}
