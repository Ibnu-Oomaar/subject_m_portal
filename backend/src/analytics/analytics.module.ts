import { Module } from '@nestjs/common';
import { ResultsModule } from '../results/results.module';
import { TeachersModule } from '../teachers/teachers.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [ResultsModule, TeachersModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
