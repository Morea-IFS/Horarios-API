import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller.ts';
import { RoomsService } from './rooms.service.ts';

@Module({ controllers: [RoomsController], providers: [RoomsService], exports: [RoomsService] })
export class RoomsModule {}
