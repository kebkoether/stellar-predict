/**
 * Sets up USDC trustlines for all test user accounts.
 * Run AFTER friendbot funding and BEFORE Circle faucet.
 *
 * npx ts-node scripts/setup-user-trustlines.ts
 */

import * as StellarSdk from '@stellar/stellar-sdk';
const { Keypair, TransactionBuilder, Networks, Operation, Asset, Horizon, BASE_FEE } = StellarSdk;

const USDC = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
const server = new Horizon.Server('https://horizon-testnet.stellar.org');

const USERS: any = {
  alice:   'SCBSVAC7X4DHSVKYZBFG43WVVORBALJFCZUWI2BS3LYFAGPXH22CG3BQ',
  bob:     'SDLCZWCFGHHDDGHVCIEPVJSN3PVUHDT3TZBE2U2LADSMT6YWBSBHPPIA',
  charlie: 'SDSHKOHCRSAWUDH76LNFJQXWPIE3S36WLEM6VM4QVZ62I2BUUPXL3FD5',
  diana:   'SD3XXCFJPXEOJDIF6LPHYB4VNSXOWQV7FLTHBRBNOGOOHFJZDPJCOJLE',
  evan:    'SC654EYOY5NNX3PNAFD7IZASYNRGGG2665BBYWBFN5GGDIYWZR2O6YQW',
  frank:   'SAHKI6BROY2DYV5HYDMDZXPHZLYRYRKE33EIBM5ADTLJH25BF4TAQWCI',
  grace:   'SCJ3FAEMNXFNGXMNJZVSZIFUFUOZTU4A5U7UGVVUVDU47EILXO27OCAV',
  hank:    'SDBEHCHSHMZT62RAAX5XNOOFD4WLU6ZH3ZLZ46GTJSE6WDAUGR3KYEP2',
  iris:    'SD7FQDLTBNSFGBBT6F3VQCTYBGO6EW4MSUCHDYYC74SDDBWYLWQQFLMU',
  jake:    'SBYCL6BS24XVPBDPJA6PIMMRQAMY7AY5BXY7A2344WOVXAO7T7DTF4AN',
};

async function setup() {
  console.log('Setting up USDC trustlines for test users...\n');

  for (const [name, secret] of Object.entries(USERS)) {
    try {
      const keypair = Keypair.fromSecret(secret as string);
      const account = await server.loadAccount(keypair.publicKey());

      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(Operation.changeTrust({ asset: USDC }))
        .setTimeout(30)
        .build();

      tx.sign(keypair);
      await server.submitTransaction(tx);
      console.log(`✓ ${name}: trustline created (${keypair.publicKey()})`);
    } catch (err: any) {
      console.log(`✗ ${name}: ${err.message}`);
    }
  }

  console.log('\n=== Now go to https://faucet.circle.com/ ===');
  console.log('Select "Stellar" and paste each address to get 20 USDC:\n');
  for (const [name, secret] of Object.entries(USERS)) {
    const keypair = Keypair.fromSecret(secret as string);
    console.log(`${name}: ${keypair.publicKey()}`);
  }
}

setup().catch(console.error);
