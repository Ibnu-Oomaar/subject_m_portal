import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { RankingsModule } from '../rankings/rankings.module';
import { ResultsModule } from '../results/results.module';
import { TeachersModule } from '../teachers/teachers.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [ResultsModule, RankingsModule, AnalyticsModule, TeachersModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
