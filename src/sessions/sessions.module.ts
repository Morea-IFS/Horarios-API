import { Module } from '@nestjs/common';
import { RoomsModule } from '../rooms/rooms.module.ts';
import { PeriodsController, SessionsController } from './sessions.controller.ts';
import { SessionsService } from './sessions.service.ts';

@Module({ imports: [RoomsModule], controllers: [SessionsController, PeriodsController], providers: [SessionsService] })
export class SessionsModule {}
