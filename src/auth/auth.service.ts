import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Keypair }    from '@stellar/stellar-sdk';

export interface AuthPayload {
  address:   string;
  issuedAt:  number;
}

@Injectable()
export class AuthService {
  private readonly challenges = new Map<string, { nonce: string; expiresAt: number }>();

  constructor(private readonly jwt: JwtService) {}

  /** Step 1 — generate a nonce the client must sign with their Stellar keypair. */
  generateChallenge(address: string): string {
    const nonce = `soro-auth:${address}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
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
    } catch {
      throw new UnauthorizedException('Signature verification failed');
    }

    this.challenges.delete(address);
    const payload: AuthPayload = { address, issuedAt: Date.now() };
    return this.jwt.sign(payload);
  }
}
