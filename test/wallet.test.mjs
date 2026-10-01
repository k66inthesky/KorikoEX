import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ensureSepolia,connectSepolia,SEPOLIA_CHAIN_ID} from '../web/wallet.mjs';
test('wallet adds unknown Sepolia network and verifies final chain',async()=>{
 let chain='0x1';const calls=[];const wallet={async request(r){calls.push(r.method);if(r.method==='eth_chainId')return chain;if(r.method==='wallet_switchEthereumChain'){if(calls.filter(x=>x===r.method).length===1)throw Object.assign(Error('Unknown'),{code:4902});chain=SEPOLIA_CHAIN_ID;}}};
 await ensureSepolia(wallet);assert.deepEqual(calls,['eth_chainId','wallet_switchEthereumChain','wallet_addEthereumChain','wallet_switchEthereumChain','eth_chainId']);
});
test('wallet refuses a provider that stays on mainnet',async()=>{await assert.rejects(ensureSepolia({request:async r=>r.method==='eth_chainId'?'0x1':null}),/停止交易/);});
test('user network rejection does not add or bypass the network',async()=>{let added=false;const rejection=Object.assign(Error('Rejected'),{code:4001});await assert.rejects(ensureSepolia({async request(r){if(r.method==='eth_chainId')return '0x1';if(r.method==='wallet_addEthereumChain')added=true;throw rejection;}}),e=>e===rejection);assert.equal(added,false);});
test('missing browser wallet gives an actionable message',async()=>{await assert.rejects(connectSepolia(),/Chrome 或 Edge/);});
