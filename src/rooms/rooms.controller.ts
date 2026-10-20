import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { ListRoomsQuery, ScheduleQuery } from './rooms.dto.ts';
import { RoomsService } from './rooms.service.ts';

@ApiTags('Salas')
@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista as salas e laboratórios da grade atual (paginado)' })
  @ApiOkResponse({ description: '{ data: [{ id, name, externalIds }], meta: { page, pageSize, total, totalPages, semester } }' })
  @ApiBadRequestResponse({ description: 'Parâmetros inválidos' })
  @ApiServiceUnavailableResponse({ description: 'Ainda não há grade importada' })
  list(@Query() query: ListRoomsQuery) {
    return this.rooms.list(query.q, query.page, query.pageSize);
  }

  @Get(':id/schedule')
  @ApiOperation({ summary: 'Grade semanal prevista de uma sala' })
  @ApiOkResponse({ description: '{ room, semester, forecastOnly, days: [{ weekday, name, sessions: [...] }] }' })
  @ApiBadRequestResponse({ description: 'id ou parâmetros inválidos' })
  @ApiNotFoundResponse({ description: 'Sala não existe na grade atual' })
  @ApiServiceUnavailableResponse({ description: 'Ainda não há grade importada' })
  schedule(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: ScheduleQuery) {
    return this.rooms.schedule(id, query.weekday);
  }
}
