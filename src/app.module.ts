import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AvailabilityModule } from './availability/availability.module.ts';
import { intEnv } from './config.ts';
import { HealthModule } from './health/health.module.ts';
import { MetadataModule } from './metadata/metadata.module.ts';
import { PersistenceModule } from './persistence/persistence.module.ts';
import { RoomsModule } from './rooms/rooms.module.ts';
import { SessionsModule } from './sessions/sessions.module.ts';

@Module({
  imports: [
    // lido na criação do módulo (não na importação do arquivo), para respeitar o .env carregado em main.ts
    ThrottlerModule.forRootAsync({
      useFactory: () => [{ ttl: 60_000, limit: intEnv('RATE_LIMIT_PER_MINUTE', 300) }],
    }),
    PersistenceModule,
    RoomsModule,
    SessionsModule,
    AvailabilityModule,
    MetadataModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
