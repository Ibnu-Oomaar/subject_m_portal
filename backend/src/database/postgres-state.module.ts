import { Global, Module } from '@nestjs/common';
import { PostgresStateService } from './postgres-state.service';

@Global()
@Module({ providers: [PostgresStateService], exports: [PostgresStateService] })
export class PostgresStateModule {}
