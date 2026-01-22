import { Injectable, Logger } from '@nestjs/common';
import { ConfigService }      from '@nestjs/config';
import { Horizon, SorobanRpc, Networks } from '@stellar/stellar-sdk';

@Injectable()
export class StellarService {
  private readonly logger    = new Logger(StellarService.name);
  private readonly horizon:  Horizon.Server;
  private readonly soroban:  SorobanRpc.Server;
  private readonly network:  string;

  constructor(private config: ConfigService) {
    const net = config.get<string>('STELLAR_NETWORK', 'testnet');
    this.network  = net === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
    this.horizon  = new Horizon.Server(
      config.get('HORIZON_URL', 'https://horizon-testnet.stellar.org'),
    );
    this.soroban  = new SorobanRpc.Server(
      config.get('SOROBAN_RPC_URL', 'https://soroban-testnet.stellar.org'),
    );
  }

  getHorizon()  { return this.horizon; }
  getSoroban()  { return this.soroban; }
  getNetwork()  { return this.network; }

  async getLatestLedger(): Promise<number> {
    const info = await this.soroban.getLatestLedger();
    return info.sequence;
  }

  async getAccountInfo(address: string) {
    try {
      return await this.horizon.loadAccount(address);
    } catch {
      return null;
    }
  }
}
