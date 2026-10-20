import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationQuery } from '../common/pagination.ts';

export class ListRoomsQuery extends PaginationQuery {
  @ApiPropertyOptional({ description: 'Busca no nome da sala (sem diferenciar maiúsculas)', maxLength: 80, example: 'lab' })
  @IsOptional() @IsString() @MaxLength(80)
  q?: string;
}

export class ScheduleQuery {
  @ApiPropertyOptional({ minimum: 1, maximum: 5, description: 'Filtra um dia: 1 = segunda ... 5 = sexta' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5)
  weekday?: number;
}
