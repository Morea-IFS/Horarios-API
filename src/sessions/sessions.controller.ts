import { Controller, Get, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SearchSessionsQuery } from './sessions.dto.ts';
import { SessionsService } from './sessions.service.ts';

@ApiTags('Aulas')
@Controller()
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get('sessions')
  @ApiOperation({ summary: 'Busca aulas em todas as salas: por texto, turma, sala e/ou dia (paginado)' })
  @ApiOkResponse({ description: '{ semester, forecastOnly, data: [{ room, weekday, startTime, endTime, classCodes, lines, ... }], meta }' })
  @ApiBadRequestResponse({ description: 'Parâmetros inválidos' })
  @ApiServiceUnavailableResponse({ description: 'Ainda não há grade importada' })
  search(@Query() query: SearchSessionsQuery) {
    return this.sessions.search(query);
  }

  @Get('classes')
  @ApiOperation({ summary: 'Lista as turmas que têm aula na grade atual (ex.: "3º IRC-V"), com curso, período e turno' })
  @ApiOkResponse({ description: '{ semester, data: [{ code, course, period, shift, optional, sessionCount }] }' })
  @ApiServiceUnavailableResponse({ description: 'Ainda não há grade importada' })
  classes() {
    return this.sessions.classes();
  }
}

@ApiTags('Metadados')
@Controller('periods')
export class PeriodsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  @ApiOperation({ summary: 'Períodos (horários de aula) do campus, com início e fim' })
  @ApiOkResponse({ description: '{ semester, data: [{ code, startTime, endTime }] }' })
  @ApiServiceUnavailableResponse({ description: 'Ainda não há grade importada' })
  list() {
    return this.sessions.periods();
  }
}
