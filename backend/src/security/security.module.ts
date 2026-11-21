import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { env } from '../config/env';
import { PostgresThrottlerStorage } from '../database/postgres-throttler.storage';
import { PostgresStateService } from '../database/postgres-state.service';
import { AuditLog } from './audit-log.entity';
import { AuditService } from './audit.service';
import { LoginThrottleService } from './login-throttle.service';
import { SessionGuard } from './session.guard';
import { SessionService } from './session.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
    ThrottlerModule.forRootAsync({
      inject: [PostgresStateService],
      useFactory: (state: PostgresStateService) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: env.API_RATE_LIMIT_PER_MINUTE }],
        storage: new PostgresThrottlerStorage(state),
      }),
    }),
  ],
  providers: [
    SessionService,
    LoginThrottleService,
    AuditService,
    // Order matters: rate-limit first (cheap, unauthenticated), then authenticate/authorize.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [SessionService, LoginThrottleService, AuditService],
})
export class SecurityModule {}
