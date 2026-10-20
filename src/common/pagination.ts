import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQuery {
  @ApiPropertyOptional({ default: 1, minimum: 1, description: 'Página (começa em 1)' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100, description: 'Itens por página' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize: number = 20;
}

export type PageMeta = { page: number; pageSize: number; total: number; totalPages: number };
export const pageMeta = (page: number, pageSize: number, total: number): PageMeta => ({
  page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)),
});
