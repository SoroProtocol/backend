import { Injectable, UnauthorizedException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Keypair }    from '@stellar/stellar-sdk';
import * as crypto    from 'crypto';

export interface AuthPayload {
  address:   string;
  issuedAt:  number;
}

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private readonly challenges = new Map<string, { nonce: string; expiresAt: number }>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly jwt: JwtService) {}

  onModuleInit() {
    // Purge expired challenges every 10 minutes to prevent memory leaks
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [addr, challenge] of this.challenges) {
        if (now > challenge.expiresAt) this.challenges.delete(addr);
      }
    }, 10 * 60_000);
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  /** Step 1 — generate a nonce the client must sign with their Stellar keypair. */
  generateChallenge(address: string): string {
    const nonce = `soro-auth:${address}:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`;
    this.challenges.set(address, { nonce, expiresAt: Date.now() + 5 * 60_000 });
    return nonce;
  }

  /** Step 2 — verify the signed nonce and return a JWT. */
  verifyChallenge(address: string, signedNonce: string): string {
    const challenge = this.challenges.get(address);
    if (!challenge) throw new UnauthorizedException('No challenge found for address');
    if (Date.now() > challenge.expiresAt) {
      this.challenges.delete(address);
      throw new UnauthorizedException('Challenge expired');
    }

    try {
      const kp = Keypair.fromPublicKey(address);
      const valid = kp.verify(
        Buffer.from(challenge.nonce),
        Buffer.from(signedNonce, 'base64'),
      );
      if (!valid) throw new UnauthorizedException('Invalid signature');
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Signature verification failed');
    }

    this.challenges.delete(address);
    const payload: AuthPayload = { address, issuedAt: Date.now() };
    return this.jwt.sign(payload);
  }
}
