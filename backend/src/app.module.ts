import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AcademicYearsModule } from './academic-years/academic-years.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { ExaminationsModule } from './examinations/examinations.module';
import { ExcelModule } from './excel/excel.module';
import { MarksModule } from './marks/marks.module';
import { RankingsModule } from './rankings/rankings.module';
import { ReportsModule } from './reports/reports.module';
import { ResultsModule } from './results/results.module';
import { ClassesModule } from './classes/classes.module';
import { env } from './config/env';
import { buildDataSourceOptions } from './database/data-source';
import { HealthController } from './health.controller';
import { RedisModule } from './redis/redis.module';
import { SectionsModule } from './sections/sections.module';
import { SecurityModule } from './security/security.module';
import { StudentsModule } from './students/students.module';
import { TeachersModule } from './teachers/teachers.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(buildDataSourceOptions(env.DATABASE_URL, env.DB_LOGGING)),
    RedisModule,
    SecurityModule,
    TeachersModule,
    ClassesModule,
    SectionsModule,
    AcademicYearsModule,
    StudentsModule,
    EventsModule,
    MarksModule,
    AssessmentsModule,
    ExaminationsModule,
    ResultsModule,
    AnalyticsModule,
    RankingsModule,
    ExcelModule,
    ReportsModule,
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
