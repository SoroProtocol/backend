import { IsOptional, IsInt, Min, Max, IsIn, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

const SORT_FIELDS = ['createdAt', 'startTime', 'stopTime', 'ratePerSecond'] as const;
const SORT_ORDERS  = ['asc', 'desc'] as const;

export class ListStreamsDto {
  @ApiPropertyOptional({ description: 'Stellar address to filter by, matches sender or recipient' })
  @IsOptional() @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Page number, 1-indexed', default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Results per page, capped at 100', default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Field to sort by', enum: SORT_FIELDS, default: 'createdAt' })
  @IsOptional() @IsIn(SORT_FIELDS)
  sortBy?: (typeof SORT_FIELDS)[number];

  @ApiPropertyOptional({ description: 'Sort direction', enum: SORT_ORDERS, default: 'desc' })
  @IsOptional() @IsIn(SORT_ORDERS)
  order?: (typeof SORT_ORDERS)[number];

  @ApiPropertyOptional({ description: 'Set to true to get the old unbounded flat-array response instead of the paginated shape' })
  @IsOptional() @IsString()
  all?: string;
}
