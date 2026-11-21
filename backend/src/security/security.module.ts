import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { env } from '../config/env';
import { RedisService } from '../redis/redis.service';
import { ThrottlerRedisStorage } from '../redis/throttler-redis.storage';
import { AuditLog } from './audit-log.entity';
import { AuditService } from './audit.service';
import { LoginThrottleService } from './login-throttle.service';
import { SessionGuard } from './session.guard';
import { SessionService } from './session.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
    // Redis-backed so limits hold across processes and restarts.
    ThrottlerModule.forRootAsync({
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: env.API_RATE_LIMIT_PER_MINUTE }],
        storage: new ThrottlerRedisStorage(redis),
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
