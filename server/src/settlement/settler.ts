import * as StellarSdk from '@stellar/stellar-sdk';
import { Trade, Settlement } from '../types';
import { Database } from '../db/database';
import { v4 as uuidv4 } from 'uuid';

const { Keypair, TransactionBuilder, Networks, Operation, Asset, BASE_FEE, Horizon } = StellarSdk;

/**
 * Maps user IDs to Stellar public keys.
 * In production, this would come from a database/auth system.
 */
const USER_STELLAR_ADDRESSES: Record<string, string> = {
  alice:   'GAQE3PX64E2KPQJEHEEIR6YX7UC6M3EM2XO24CRI7PLFKPNZ76SEGWBS',
  bob:     'GDHPTMDBMCWE6GVZCBHEXUBYF7PBT3IJKNW4YSAE7FZDLMLE3C7VA4CE',
  charlie: 'GDP476JTITFBPEMKDCJRSCMR2ITFKIWUIIXMVOESSFESIP3EB2DYETOI',
  diana:   'GDL4OVO6BIRR5DI4BGLLZZFNFDIIYUNELARBOCRGHIMY3PGX7WI3BDCS',
  evan:    'GD3RTPSGOJAAAZC7EHMROEIWOBMUG454HT6JOLUUGKM535EKAMMDV5PW',
  frank:   'GDYCS7QHEHRQOJACTDD2FWNC5X5C65FBCYXBUWT74P553K2OJUZMMEIH',
  grace:   'GDXY7CZEVATTIKEONTF27DCB4HR4SUEQV6MJSBWMUGYGL2NXNCYFKIKA',
  hank:    'GBGRZ2WMEV3SK6IV4QDS3TT4SXS2TR7F7HQGJ27CJ4OUPD7RRX5JSEX6',
  iris:    'GBD3VLHOPWTNPLQXFW356GLKJ53XSGSYQ5EYK3HLK6RWPRJAVIQPL3YZ',
  jake:    'GCR3G6MGPSB7X6TOADE3CEGDWGIEMUMMVOSRVQBOOGVKOSENGZ4FU2PC',
};

function resolveUserAddress(userId: string): string | null {
  if (userId.startsWith('G') && userId.length === 56) return userId;
  return USER_STELLAR_ADDRESSES[userId] || null;
}

/**
 * Settlement pipeline — custodial model
 *
 * How it works:
 * - DEPOSITS: User sends USDC to the settlement account on-chain → platform credits internal balance
 * - TRADING: Happens entirely off-chain (internal ledger updates via the matching engine)
 * - WITHDRAWALS: User requests withdrawal → platform sends USDC from settlement account to user's wallet on-chain
 * - TRADE RECORDING: Trades are recorded on-chain as a single "memo" transaction for auditability
 *
 * This is the same model Polymarket uses — on-chain for money in/out, off-chain for trading.
 */
export class SettlementPipeline {
  private readonly db: Database;
  private readonly keypair: StellarSdk.Keypair;
  private readonly horizonUrl: string;
  private readonly network: string;
  private readonly usdc: { code: string; issuer: string };
  private server: StellarSdk.Horizon.Server;
  private isProcessing = false;

  constructor(
    db: Database,
    keypairSecret: string,
    horizonUrl: string,
    network: 'testnet' | 'mainnet',
    usdc: { code: string; issuer: string }
  ) {
    this.db = db;
    this.keypair = Keypair.fromSecret(keypairSecret);
    this.horizonUrl = horizonUrl;
    this.network = network;
    this.usdc = usdc;
    this.server = new Horizon.Server(horizonUrl);
  }

  /**
   * Process pending trades — mark as settled internally
   * (No on-chain tx needed for individual trades in custodial model)
   */
  public async processPendingTrades(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const unsettledTrades = this.db.getUnsettledTrades();
      if (unsettledTrades.length === 0) {
        this.isProcessing = false;
        return;
      }

      console.log(`Processing ${unsettledTrades.length} unsettled trades (internal settlement)`);

      for (const trade of unsettledTrades) {
        // Trade is already settled in the internal ledger by the matching engine.
        // Just mark it as confirmed.
        this.db.updateTradeSettlement(trade.id, 'confirmed');
        console.log(`  ✓ Trade ${trade.id.slice(0, 8)}: ${trade.buyUserId} bought ${trade.quantity} @ ${trade.price} from ${trade.sellUserId} — confirmed`);
      }

      console.log(`All ${unsettledTrades.length} trades confirmed internally`);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a user withdrawal — sends USDC on-chain from settlement account to user's wallet
   */
  public async processWithdrawal(userId: string, amount: number): Promise<string> {
    const userAddr = resolveUserAddress(userId);
    if (!userAddr) {
      throw new Error(`Cannot resolve Stellar address for user: ${userId}`);
    }

    if (amount <= 0) {
      throw new Error('Withdrawal amount must be positive');
    }

    // Check internal balance
    const balance = this.db.getUserBalance(userId);
    if (!balance || balance.available < amount) {
      throw new Error(`Insufficient balance. Available: ${balance?.available ?? 0}, Requested: ${amount}`);
    }

    console.log(`Processing withdrawal: ${userId} → ${userAddr.slice(0, 12)}... for ${amount} USDC`);

    const account = await this.server.loadAccount(this.keypair.publicKey());
    const networkPassphrase = this.network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC;
    const usdcAsset = new Asset(this.usdc.code, this.usdc.issuer);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: userAddr,
          asset: usdcAsset,
          amount: amount.toFixed(7),
        })
      )
      .addMemo(StellarSdk.Memo.text(`withdraw:${userId}`))
      .setTimeout(30)
      .build();

    tx.sign(this.keypair);

    try {
      const result = await this.server.submitTransaction(tx);
      const hash = (result as any).hash;

      // Deduct from internal balance
      this.db.updateUserBalance(userId, {
        available: balance.available - amount,
      });

      console.log(`  ✓ Withdrawal confirmed: ${hash}`);
      return hash;
    } catch (err: any) {
      const resultCodes = err.response?.data?.extras?.result_codes;
      console.error('Withdrawal failed:', resultCodes || err.message);
      throw new Error(`Withdrawal failed: ${JSON.stringify(resultCodes) || err.message}`);
    }
  }

  /**
   * Process a user deposit — verifies an incoming USDC payment and credits internal balance
   * In production, you'd watch for incoming payments via Horizon streaming.
   * For now, this checks a specific transaction.
   */
  public async processDeposit(userId: string, transactionHash: string): Promise<number> {
    const userAddr = resolveUserAddress(userId);
    if (!userAddr) {
      throw new Error(`Cannot resolve Stellar address for user: ${userId}`);
    }

    try {
      const tx = await this.server.transactions().transaction(transactionHash).call();
      const ops = await (tx as any).operations();

      let depositAmount = 0;

      for (const op of ops.records) {
        if (
          op.type === 'payment' &&
          op.to === this.keypair.publicKey() &&
          op.from === userAddr &&
          op.asset_code === this.usdc.code &&
          op.asset_issuer === this.usdc.issuer
        ) {
          depositAmount += parseFloat(op.amount);
        }
      }

      if (depositAmount <= 0) {
        throw new Error('No matching USDC payment found in transaction');
      }

      // Credit internal balance
      const balance = this.db.getUserBalance(userId);
      if (balance) {
        this.db.updateUserBalance(userId, {
          available: balance.available + depositAmount,
        });
      } else {
        this.db.createUserBalance(userId, depositAmount);
      }

      console.log(`  ✓ Deposit confirmed: ${userId} credited ${depositAmount} USDC from tx ${transactionHash.slice(0, 12)}...`);
      return depositAmount;
    } catch (err: any) {
      console.error('Deposit verification failed:', err.message);
      throw new Error(`Deposit verification failed: ${err.message}`);
    }
  }

  /**
   * Build an unsigned USDC payment transaction (user → settlement account).
   * Returns the XDR string for the frontend to sign with Freighter.
   */
  public async buildDepositTransaction(sourceAccount: string, amount: number): Promise<string> {
    if (amount <= 0) {
      throw new Error('Deposit amount must be positive');
    }

    const account = await this.server.loadAccount(sourceAccount);
    const networkPassphrase = this.network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC;
    const usdcAsset = new Asset(this.usdc.code, this.usdc.issuer);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: this.keypair.publicKey(),
          asset: usdcAsset,
          amount: amount.toFixed(7),
        })
      )
      .addMemo(StellarSdk.Memo.text(`deposit:${sourceAccount.slice(0, 8)}`))
      .setTimeout(120)
      .build();

    return tx.toXDR();
  }

  /**
   * Build an unsigned changeTrust transaction so the user can opt in to holding USDC.
   * Returns the XDR string for the frontend to sign with Freighter.
   */
  public async buildTrustlineTransaction(sourceAccount: string): Promise<string> {
    const account = await this.server.loadAccount(sourceAccount);
    const networkPassphrase = this.network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC;
    const usdcAsset = new Asset(this.usdc.code, this.usdc.issuer);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(
        Operation.changeTrust({
          asset: usdcAsset,
        })
      )
      .setTimeout(120)
      .build();

    return tx.toXDR();
  }

  /**
   * Check if an account has a USDC trustline
   */
  public async hasUsdcTrustline(accountId: string): Promise<boolean> {
    try {
      const account = await this.server.loadAccount(accountId);
      return account.balances.some(
        (b: any) => b.asset_code === this.usdc.code && b.asset_issuer === this.usdc.issuer
      );
    } catch {
      return false;
    }
  }

  /**
   * Get the settlement account's on-chain USDC balance
   */
  public async getOnChainBalance(): Promise<{ xlm: string; usdc: string }> {
    const account = await this.server.loadAccount(this.keypair.publicKey());
    let xlm = '0';
    let usdc = '0';

    for (const bal of account.balances) {
      if (bal.asset_type === 'native') {
        xlm = bal.balance;
      } else if ('asset_code' in bal && bal.asset_code === this.usdc.code) {
        usdc = bal.balance;
      }
    }

    return { xlm, usdc };
  }

  /**
   * Retry failed settlements (no-op in custodial model since trades settle internally)
   */
  public async retryFailedSettlements(): Promise<void> {
    // In the custodial model, trade settlement is internal and instant.
    // This method exists for interface compatibility.
  }

  /**
   * Check settlement status
   */
  public async checkSettlementStatus(settlementId: string): Promise<Settlement | null> {
    return this.db.getSettlement(settlementId);
  }
}
