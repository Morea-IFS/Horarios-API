import { Global, Module } from '@nestjs/common';
import { PrismaReadRepository } from './prisma-read.repository.ts';
import { PrismaService } from './prisma.service.ts';
import { ScheduleReadRepository } from './schedule.repository.ts';

@Global()
@Module({
  providers: [PrismaService, { provide: ScheduleReadRepository, useClass: PrismaReadRepository }],
  exports: [PrismaService, ScheduleReadRepository],
})
export class PersistenceModule {}
