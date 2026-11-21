import { Module } from '@nestjs/common';
import { StudentsModule } from '../students/students.module';
import { TeachersModule } from '../teachers/teachers.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [TeachersModule, StudentsModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
