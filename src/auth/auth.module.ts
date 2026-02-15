import { Module }        from '@nestjs/common';
import { JwtModule }     from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService }   from './auth.service';
import { AuthController }from './auth.controller';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports:    [ConfigModule],
      inject:     [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret:      cfg.get('JWT_SECRET', 'dev-secret'),
        signOptions: { expiresIn: cfg.get('JWT_EXPIRES_IN', '7d') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers:   [AuthService],
  exports:     [AuthService],
})
export class AuthModule {}
