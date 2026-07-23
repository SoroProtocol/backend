import {
  IsString, IsNumber, IsPositive, Matches,
  IsArray, ArrayMinSize, ArrayMaxSize, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

const STELLAR_ADDR = /^G[A-Z2-7]{55}$/;

export const MAX_BATCH_SIZE = 100;

export class BatchStreamRecipientDto {
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

export class CreateBatchStreamsDto {
  @ApiProperty({ description: 'Sender Stellar address, shared by every stream in the batch' })
  @IsString() @Matches(STELLAR_ADDR)
  sender: string;

  @ApiProperty({
    description: `One entry per recipient, at least 1 and no more than ${MAX_BATCH_SIZE}`,
    type: [BatchStreamRecipientDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH_SIZE)
  @ValidateNested({ each: true })
  @Type(() => BatchStreamRecipientDto)
  recipients: BatchStreamRecipientDto[];
}
