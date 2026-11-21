import { Module } from '@nestjs/common';
import { ResultsModule } from '../results/results.module';
import { TeachersModule } from '../teachers/teachers.module';
import { RankingsController } from './rankings.controller';
import { RankingsService } from './rankings.service';

@Module({
  imports: [ResultsModule, TeachersModule],
  controllers: [RankingsController],
  providers: [RankingsService],
  exports: [RankingsService],
})
export class RankingsModule {}
