import { IsString, IsNumber, IsPositive, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const STELLAR_ADDR = /^G[A-Z2-7]{55}$/;
const CONTRACT_ID  = /^C[A-Z2-7]{55}$/;

export class CreateStreamDto {
  @ApiProperty({ description: 'Sender Stellar address' })
  @IsString() @Matches(STELLAR_ADDR)
  sender: string;

  @ApiProperty({ description: 'Recipient Stellar address' })
  @IsString() @Matches(STELLAR_ADDR)
  recipient: string;

  @ApiProperty({ description: 'Token contract ID or "native"' })
  @IsString()
  token: string;

  @ApiProperty({ description: 'Tokens per second in stroops' })
  @IsNumber() @IsPositive()
  ratePerSecond: number;

  @ApiProperty({ description: 'Stream start Unix timestamp' })
  @IsNumber() @IsPositive()
  startTime: number;

  @ApiProperty({ description: 'Stream stop Unix timestamp' })
  @IsNumber() @IsPositive()
  stopTime: number;
}
