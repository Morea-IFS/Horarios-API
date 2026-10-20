import { Module } from '@nestjs/common';
import { RoomsModule } from '../rooms/rooms.module.ts';
import { AvailabilityController } from './availability.controller.ts';
import { AvailabilityService } from './availability.service.ts';

@Module({ imports: [RoomsModule], controllers: [AvailabilityController], providers: [AvailabilityService] })
export class AvailabilityModule {}
