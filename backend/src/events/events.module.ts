import { Global, Module } from '@nestjs/common';
import { TeachersModule } from '../teachers/teachers.module';
import { EventsGateway } from './events.gateway';
import { EventsService } from './events.service';

@Global()
@Module({ imports: [TeachersModule], providers: [EventsService, EventsGateway], exports: [EventsService] })
export class EventsModule {}
