import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PaginationQuery } from '../common/pagination.ts';

export class SearchSessionsQuery extends PaginationQuery {
  @ApiPropertyOptional({
    description: 'Busca no texto da aula (disciplina, docente, turma). Ignora acentos; todas as palavras precisam aparecer.',
    maxLength: 80, example: 'física',
  })
  @IsOptional() @IsString() @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ description: 'Turma exata (como em GET /classes), ex.: "3º IRC-V"', maxLength: 40, example: '3º BSI-N' })
  @IsOptional() @IsString() @MaxLength(40)
  classCode?: string;

  @ApiPropertyOptional({ description: 'Só aulas de uma sala (id de GET /rooms)' })
  @IsOptional() @IsUUID()
  roomId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5, description: '1 = segunda ... 5 = sexta' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5)
  weekday?: number;
}
