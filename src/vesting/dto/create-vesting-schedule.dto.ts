import { IsString, IsNumber, IsPositive, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const STELLAR_ADDR = /^G[A-Z2-7]{55}$/;

export class CreateVestingScheduleDto {
  @ApiProperty({ description: 'Beneficiary Stellar address' })
  @IsString() @Matches(STELLAR_ADDR)
  beneficiary: string;

  @ApiProperty({ description: 'Token contract ID or "native"' })
  @IsString()
  token: string;

  @ApiProperty({ description: 'Total amount to vest, in stroops' })
  @IsNumber() @IsPositive()
  totalAmount: number;

  @ApiProperty({ description: 'Schedule start Unix timestamp' })
  @IsNumber() @IsPositive()
  startTime: number;

  @ApiProperty({ description: 'Cliff Unix timestamp — nothing vests before this' })
  @IsNumber() @IsPositive()
  cliffTime: number;

  @ApiProperty({ description: 'End Unix timestamp — fully vested from this point on' })
  @IsNumber() @IsPositive()
  endTime: number;
}
