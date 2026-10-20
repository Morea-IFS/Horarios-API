import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ScheduleReadRepository } from '../persistence/schedule.repository.ts';

@ApiTags('Saúde')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly repo: ScheduleReadRepository) {}

  @Get()
  @ApiOperation({ summary: 'Verifica se a API e o banco estão respondendo' })
  @ApiOkResponse({ description: '{ status: "ok", database: "up", time }' })
  @ApiServiceUnavailableResponse({ description: 'Banco de dados indisponível' })
  async check() {
    try {
      await this.repo.ping();
    } catch {
      throw new ServiceUnavailableException('Banco de dados indisponível');
    }
    return { status: 'ok', database: 'up', time: new Date().toISOString() };
  }
}
