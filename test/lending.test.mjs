import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,encodeBytes32String,keccak256,toUtf8Bytes} from 'ethers';
import artifacts from '../web/generated/contracts.json' with {type:'json'};
import {mockValuation,combineValuations,validateSubscription,accruedInterest} from '../web/valuation.mjs';
import {evaluate} from '../server/agents.mjs';
const input={provider:'codex',plan:'Pro (self-declared)',paidMicros:200_000000,startsAt:1800000000,expiresAt:1800000000+30*86400};
test('valuation: conservative quorum, rights restriction, disagreement, validation and daily interest',async()=>{
 const q=mockValuation(input,input.startsAt+15*86400);assert.equal(q.prepaidCeilingMicros,100_000000);assert.equal(q.residualMicros,60_000000);assert.equal(q.demoMaxBorrowMicros,18_000000);assert.equal(q.productionMaxBorrowMicros,0);assert.equal(q.mode,'mock');
 assert.equal(accruedInterest(100_000000,86400),32877n);assert.equal(accruedInterest(100_000000,365*86400),12_000000n);
 const s=validateSubscription(input,input.startsAt);const disagreement=combineValuations(s,[{provider:'openai',mode:'live',valueMicros:180_000000,confidence:.9,reason:'a'},{provider:'claude',mode:'live',valueMicros:50_000000,confidence:.9,reason:'b'}]);assert.equal(disagreement.reviewRequired,true);assert.equal(disagreement.demoMaxBorrowMicros,0);
 assert.throws(()=>mockValuation(input,input.expiresAt));assert.throws(()=>mockValuation({...input,provider:'unsupported'},input.startsAt));
 assert.throws(()=>combineValuations(s,[{provider:'openai',mode:'live',valueMicros:999_000000,confidence:.9,reason:'a'},{provider:'claude',mode:'live',valueMicros:1,confidence:.9,reason:'b'}]));
 await assert.rejects(()=>evaluate({...input,startsAt:Math.floor(Date.now()/1000)-86400,expiresAt:Math.floor(Date.now()/1000)+86400},{VALUATION_MODE:'live'}),/both API keys/);
});
test('dual API adapters parse schema outputs and fail closed',async()=>{
 const now=Math.floor(Date.now()/1000),i={provider:'claude',plan:'Test',paidMicros:100_000000,startsAt:now-86400,expiresAt:now+86400};const calls=[];
 const f=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});const text=JSON.stringify({valueMicros:20_000000,confidence:.8,reason:'保守估價'});return {ok:true,json:async()=>url.includes('openai')?{output:[{content:[{type:'output_text',text}]}]}:{stop_reason:'end_turn',content:[{type:'text',text}]}}};
 const env={VALUATION_MODE:'live',OPENAI_API_KEY:'test-not-a-real-key',ANTHROPIC_API_KEY:'test-not-a-real-key',OPENAI_MODEL:'configured-model',CLAUDE_MODEL:'configured-model'};
 const q=await evaluate(i,env,f);assert.equal(q.mode,'live');assert.equal(q.residualMicros,20_000000);assert.equal(q.productionEligible,false);assert.equal(calls.length,2);assert.equal(calls[0].body.store,false);
 await assert.rejects(()=>evaluate(i,env,async()=>({ok:false,status:503})),/503/);
});
test('onchain: lock, lend, simple interest, repay, permissionless overdue liquidation and safety boundaries',async()=>{
 const rpc=ganache.provider({logging:{quiet:true},chain:{chainId:31337},wallet:{totalAccounts:4}});const p=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});p.pollingInterval=30;
 const operator=await p.getSigner(0),borrower=await p.getSigner(1),keeper=await p.getSigner(2);const a=await operator.getAddress(),b=await borrower.getAddress();const checks=[];const txs=[];
 async function deploy(name,args=[]){const c=await new ContractFactory(artifacts[name].abi,artifacts[name].bytecode,operator).deploy(...args);await c.waitForDeployment();return c;}
 async function tx(promise){const receipt=await(await promise).wait();txs.push(receipt.hash);return receipt;}
 try{
 const nft=await deploy('MockSubscription'),cash=await deploy('MockUSDC'),oa=await deploy('ValuationOracle',[encodeBytes32String('openai')]),cl=await deploy('ValuationOracle',[encodeBytes32String('claude')]);
 const pool=await deploy('SubscriptionLending',[await cash.getAddress(),await nft.getAddress(),await oa.getAddress(),await cl.getAddress(),a]);const address=await pool.getAddress();
 await tx(cash.mint(address,1000_000000));await tx(cash.mint(b,100_000000));
 const latest=async()=>Number((await p.getBlock('latest')).timestamp);
 async function collateral(expirySeconds=30*86400){const n=await latest();await tx(nft.issue(b,encodeBytes32String('codex'),encodeBytes32String('Pro'),n-86400,n+expirySeconds,200_000000));const id=await nft.nextId();const hash=keccak256(toUtf8Bytes('MOCK test metadata '+id));await tx(oa.attest(id,100_000000,n+900,hash));await tx(cl.attest(id,90_000000,n+900,hash));await tx(nft.connect(borrower).approve(address,id));return id;}
 const id=await collateral();let now=await latest();
 await assert.rejects(pool.connect(keeper).borrow(id,20_000000,now+7*86400));checks.push('non-owner cannot pledge');
 await assert.rejects(pool.connect(borrower).borrow(id,28_000000,now+7*86400));checks.push('30% LTV enforced against lower quote');
 await assert.rejects(pool.connect(borrower).borrow(id,1_000000,now+30*86400));checks.push('loan matures before subscription expiry');
 await tx(pool.connect(borrower).borrow(id,20_000000,now+7*86400));assert.equal(await nft.ownerOf(id),address);assert.equal(await cash.balanceOf(b),120_000000n);checks.push('collateral locked and principal delivered atomically');
 await assert.rejects(pool.connect(borrower).borrow(id,1_000000,now+86400));checks.push('collateral cannot fund two loans');
 await assert.rejects(pool.liquidate(id));checks.push('premature liquidation rejected');
 await rpc.request({method:'evm_increaseTime',params:[86400]});await rpc.request({method:'evm_mine',params:[]});const loan=await pool.loans(id),end=await latest();assert.equal(await pool.interest(id),accruedInterest(20_000000,end-Number(loan.startedAt)));checks.push('one-day interest matches exact simple-interest formula');
 await assert.rejects(pool.connect(borrower).repay(id,100_000000));assert.equal(await nft.ownerOf(id),address);checks.push('failed payment leaves collateral locked and loan active');
 await tx(cash.connect(borrower).approve(address,100_000000));await tx(pool.setBorrowingPaused(true));await tx(pool.connect(borrower).repay(id,100_000000));assert.equal(await nft.ownerOf(id),b);assert.equal((await pool.loans(id)).status,2n);checks.push('repayment permitted during pause and returns collateral');
 const finalInterest=await pool.interest(id);await rpc.request({method:'evm_increaseTime',params:[60]});await rpc.request({method:'evm_mine',params:[]});assert.equal(await pool.interest(id),finalInterest);checks.push('repaid interest stops accruing');
 await assert.rejects(pool.connect(borrower).repay(id,100_000000));checks.push('duplicate repayment rejected');
 const id2=await collateral();now=await latest();await assert.rejects(pool.connect(borrower).borrow(id2,1_000000,now+60));checks.push('pause blocks new borrowing');await tx(pool.setBorrowingPaused(false));await tx(pool.connect(borrower).borrow(id2,10_000000,now+60));
 await rpc.request({method:'evm_increaseTime',params:[61]});await rpc.request({method:'evm_mine',params:[]});await assert.rejects(pool.connect(borrower).repay(id2,100_000000));checks.push('repayment after deadline rejected');await tx(pool.connect(keeper).liquidate(id2));assert.equal(await nft.ownerOf(id2),a);assert.equal((await pool.loans(id2)).status,3n);assert.equal(await pool.badDebt(),await pool.debt(id2));checks.push('keeper confiscates mock NFT and records bad debt');await assert.rejects(pool.liquidate(id2));checks.push('duplicate liquidation rejected');
 const id3=await collateral();await rpc.request({method:'evm_increaseTime',params:[901]});await rpc.request({method:'evm_mine',params:[]});await assert.rejects(pool.connect(borrower).borrow(id3,1_000000,await latest()+60));checks.push('expired oracle quote rejected');
 await assert.rejects(oa.connect(keeper).attest(id3,100_000000,await latest()+100,keccak256(toUtf8Bytes('unauthorized'))));checks.push('oracle only accepts authorized operator');
 await assert.rejects(nft.connect(borrower)['safeTransferFrom(address,address,uint256)'](b,address,id3));checks.push('unsolicited collateral rejected');
 const evidence={chainId:31337,network:'local-ganache',publicTestnet:false,checks,transactions:txs,contracts:{pool:address,nft:await nft.getAddress(),cash:await cash.getAddress()},interestRule:'12% APR, simple, per-second, ceil to 1 micro unit',checkedAt:new Date().toISOString()};fs.mkdirSync('public',{recursive:true});fs.writeFileSync('public/lending-evidence.json',JSON.stringify(evidence,null,2));
 }finally{await rpc.disconnect();}
});
