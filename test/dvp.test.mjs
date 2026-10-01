import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ganache from 'ganache';
import {BrowserProvider,Wallet} from 'ethers';import {setup,trade,contract} from '../web/protocol.mjs';
test('official ERC-3643 identity claims + Codex and Claude atomic DvP; rejected buyer cash rollback',async()=>{
 const rpc=ganache.provider({logging:{quiet:true},chain:{chainId:31337}});const p=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});p.pollingInterval=30;
 const signer=await p.getSigner();const account=rpc.getInitialAccounts()[(await signer.getAddress()).toLowerCase()];const claimSigner=new Wallet(account.secretKey);const checks=[];
 try{const state=await setup(signer,{},()=>{},()=>{},claimSigner);assert.equal(await contract('IdentityRegistry',state.addresses.registry,p).isVerified(state.owner),true);checks.push('ONCHAINID signed claim verified');
 const trades=[];for(const batch of ['codex','claude'])trades.push(await trade(signer,state,batch));checks.push('Codex atomic DvP verified');checks.push('Claude atomic DvP verified');
 await assert.rejects(trade(signer,state,'codex',51n),/不可超過 5/);const capBefore=await contract('MockUSD',state.addresses.cash,signer).balanceOf(state.owner);await(await contract('MockUSD',state.addresses.cash,signer).approve(state.addresses.dvp,6_000000)).wait();const capTime=(await p.getBlock('latest')).timestamp;await assert.rejects(contract('AtomicDvP',state.addresses.dvp,signer).buy(state.addresses.codex,51,6_000000,capTime+600));assert.equal(await contract('MockUSD',state.addresses.cash,signer).balanceOf(state.owner),capBefore);checks.push('5 USDC cap enforced by client and contract without cash debit');
 const outsider=await p.getSigner(1),outsiderAddress=await outsider.getAddress();const cash=contract('MockUSD',state.addresses.cash,signer);await(await cash.transfer(outsiderAddress,10_000000)).wait();await(await cash.connect(outsider).approve(state.addresses.dvp,10_000000)).wait();const before=await cash.balanceOf(outsiderAddress);const dvp=contract('AtomicDvP',state.addresses.dvp,outsider);const n=(await p.getBlock('latest')).timestamp;
 await assert.rejects(dvp.buy(state.addresses.codex,1,500000,n+600));assert.equal(await cash.balanceOf(outsiderAddress),before);checks.push('unverified buyer rejected without cash debit');
 const hub=contract('DeploymentHub',state.addresses.hub,signer),token=contract('Token',state.addresses.codex,p);
 await(await hub.execute([state.addresses.codex],[token.interface.encodeFunctionData('setAddressFrozen',[state.owner,true])])).wait();await assert.rejects(trade(signer,state,'codex'));checks.push('frozen buyer rejected');
 fs.writeFileSync('public/local-evidence.json',JSON.stringify({chainId:31337,network:'local-ganache',checks,trades,addresses:state.addresses},null,2));
 }finally{await rpc.disconnect();}
});
