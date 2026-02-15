import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation }              from '@nestjs/swagger';
import { AuthService }                        from './auth.service';
import { IsString, Matches }                  from 'class-validator';

class ChallengeDto {
  @IsString() @Matches(/^G[A-Z2-7]{55}$/)
  address: string;
}

class VerifyDto {
  @IsString() address:     string;
  @IsString() signedNonce: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('challenge')
  @ApiOperation({ summary: 'Get a sign challenge for a Stellar address' })
  challenge(@Query('address') address: string) {
    return { nonce: this.auth.generateChallenge(address) };
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify signed challenge and receive JWT' })
  verify(@Body() dto: VerifyDto) {
    const token = this.auth.verifyChallenge(dto.address, dto.signedNonce);
    return { token };
  }
}
