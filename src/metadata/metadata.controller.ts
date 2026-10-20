import { Controller, Get, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { ScheduleReadRepository } from '../persistence/schedule.repository.ts';

@Injectable()
export class MetadataService {
  constructor(private readonly repo: ScheduleReadRepository) {}

  async current() {
    const cur = await this.repo.getCurrent();
    if (!cur) throw new ServiceUnavailableException('Nenhuma grade de horários disponível ainda');
    const last = await this.repo.getLastRun();
    return {
      apiVersion: 'v1',
      schedule: {
        semester: cur.semester,
        pdfCreatedAt: cur.pdfCreatedAt,
        sourceUrl: cur.sourceUrl,
        contentSha256: cur.contentSha256,
        activatedAt: cur.activatedAt.toISOString(),
        roomCount: cur.roomCount,
        sessionCount: cur.sessionCount,
      },
      lastSync: last ? { outcome: last.outcome, finishedAt: last.finishedAt.toISOString(), errorCode: last.errorCode } : null,
      notice: 'Dados previstos pela grade regular do semestre; não incluem eventos, feriados ou trocas.',
    };
  }
}

@ApiTags('Metadados')
@Controller('metadata')
export class MetadataController {
  constructor(private readonly metadata: MetadataService) {}

  @Get('current')
  @ApiOperation({ summary: 'Informações da grade atual e da última sincronização' })
  @ApiOkResponse({ description: '{ apiVersion, schedule: { semester, pdfCreatedAt, sourceUrl, contentSha256, ... }, lastSync }' })
  @ApiServiceUnavailableResponse({ description: 'Ainda não há grade importada' })
  current() {
    return this.metadata.current();
  }
}
