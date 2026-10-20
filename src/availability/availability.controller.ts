import { Controller, Get, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { AvailabilityQuery } from './availability.dto.ts';
import { AvailabilityService } from './availability.service.ts';

@ApiTags('Disponibilidade')
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  @ApiOperation({ summary: 'Salas livres ou ocupadas em uma data e janela de horário (PREVISÃO pela grade regular)' })
  @ApiOkResponse({ description: '{ query, semester, forecastOnly, notice, data: [{ room, free, freeUntil, conflicts }], meta }. freeUntil: HH:mm da próxima aula da sala (só para salas livres; null = livre o resto do dia)' })
  @ApiBadRequestResponse({ description: 'Formato inválido de date, start ou end' })
  @ApiUnprocessableEntityResponse({ description: 'Data inexistente ou end <= start' })
  @ApiServiceUnavailableResponse({ description: 'Ainda não há grade importada' })
  find(@Query() query: AvailabilityQuery) {
    return this.availability.find(query);
  }
}
