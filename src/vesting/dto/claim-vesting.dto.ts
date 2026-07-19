import { IsNumber, IsOptional, IsPositive } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ClaimVestingDto {
  @ApiPropertyOptional({
    description: 'Amount to claim, in stroops. Defaults to the full vested-and-unclaimed amount.',
  })
  @IsOptional() @IsNumber() @IsPositive()
  amount?: number;
}
