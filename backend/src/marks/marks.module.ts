import { Module } from '@nestjs/common';
import { TeachersModule } from '../teachers/teachers.module';
import { MarksService } from './marks.service';

@Module({ imports: [TeachersModule], providers: [MarksService], exports: [MarksService] })
export class MarksModule {}
