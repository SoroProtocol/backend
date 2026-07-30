import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExportStreamsDto {
  @ApiProperty({
    description: 'Stellar G-address to export streams for (matches sender or recipient). Required — unscoped exports are not allowed.',
    example: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW',
  })
  @IsString()
  @IsNotEmpty({ message: 'address is required' })
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'address must be a valid Stellar G-address',
  })
  address: string;
}
