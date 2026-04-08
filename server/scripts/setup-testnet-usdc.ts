/**
 * Sets up USDC trustline on testnet for the settlement account.
 * After running this, get testnet USDC from Circle's faucet:
 * https://faucet.circle.com/ (select Stellar, paste settlement public key)
 *
 * Run with: npx ts-node scripts/setup-testnet-usdc.ts
 */

import * as StellarSdk from '@stellar/stellar-sdk';

const { Keypair, TransactionBuilder, Networks, Operation, Asset, Horizon, BASE_FEE } = StellarSdk;

// Settlement account (from .env)
const SETTLEMENT_SECRET = 'SAXOL3A54X3C4D2UMXAMLYSN7JG74VP2PHRCEFOPQF45XNR3PEUV2K3N';
const SETTLEMENT_KEYPAIR = Keypair.fromSecret(SETTLEMENT_SECRET);

// Circle's official testnet USDC issuer on Stellar
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const USDC = new Asset('USDC', USDC_ISSUER);

const server = new Horizon.Server('https://horizon-testnet.stellar.org');

async function setup() {
  console.log('=== Testnet USDC Trustline Setup ===\n');
  console.log('Settlement Account:', SETTLEMENT_KEYPAIR.publicKey());
  console.log('USDC Issuer (Circle):', USDC_ISSUER);
  console.log('');

  // Step 1: Add USDC trustline to settlement account
  console.log('Adding USDC trustline to settlement account...');
  const account = await server.loadAccount(SETTLEMENT_KEYPAIR.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.changeTrust({
        asset: USDC,
      })
    )
    .setTimeout(30)
    .build();

  tx.sign(SETTLEMENT_KEYPAIR);
  const result = await server.submitTransaction(tx);
  console.log('Trustline created! Hash:', (result as any).hash);

  // Step 2: Check balances
  console.log('\nCurrent balances:');
  const updated = await server.loadAccount(SETTLEMENT_KEYPAIR.publicKey());
  for (const bal of updated.balances) {
    if (bal.asset_type === 'native') {
      console.log(`  XLM:  ${bal.balance}`);
    } else if ('asset_code' in bal) {
      console.log(`  ${bal.asset_code}: ${bal.balance}`);
    }
  }

  console.log('\n=== Next Step ===');
  console.log('Go to https://faucet.circle.com/');
  console.log('Select "Stellar" and paste this address:');
  console.log(SETTLEMENT_KEYPAIR.publicKey());
  console.log('Request USDC (20 USDC per request, every 2 hours)');
}

setup().catch((err: any) => {
  console.error('Setup failed:', err.response?.data?.extras?.result_codes || err.message);
});
