import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PaginationQuery } from '../common/pagination.ts';

export class AvailabilityQuery extends PaginationQuery {
  @ApiProperty({ example: '2026-10-19', description: 'Data no formato AAAA-MM-DD' })
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date deve estar no formato AAAA-MM-DD' })
  date!: string;

  @ApiProperty({ example: '09:20', description: 'Início da janela (HH:mm, 24h)' })
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'start deve estar no formato HH:mm' })
  start!: string;

  @ApiProperty({ example: '11:00', description: 'Fim da janela (HH:mm, 24h); precisa ser depois de start' })
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'end deve estar no formato HH:mm' })
  end!: string;

  @ApiPropertyOptional({ description: 'Filtra pelo nome da sala', maxLength: 80 })
  @IsOptional() @IsString() @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ description: 'Se true, devolve só salas livres', default: false })
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean()
  onlyFree: boolean = false;
}
