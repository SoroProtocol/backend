import { IsNumber, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExtendStreamDto {
  @ApiProperty({
    description: 'New stream stop Unix timestamp (must be strictly greater than current stopTime)',
    example: 1735689600,
  })
  @IsNumber()
  @IsPositive()
  newStopTime: number;
}
