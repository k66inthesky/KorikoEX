import {Contract,ContractFactory,encodeBytes32String,keccak256,toUtf8Bytes} from 'ethers';
import artifacts from './generated/contracts.json' with {type:'json'};
import {SEPOLIA_USDC,ERC20_ABI,validateCash} from './usdc.mjs';
export {SEPOLIA_USDC,ERC20_ABI};
export function lendingContract(name,address,runner){return new Contract(address,artifacts[name].abi,runner);}
export async function deployLending(signer,state={},log=()=>{},persist=()=>{},useMock=false){
 const chainId=Number((await signer.provider.getNetwork()).chainId);if(chainId!==11155111&&chainId!==31337)throw Error('Only Sepolia or local EVM allowed');
 if(chainId===11155111&&useMock)throw Error('Sepolia 僅允許 Circle USDC');const owner=await signer.getAddress();if(state.owner&&state.owner.toLowerCase()!==owner.toLowerCase())throw Error('Wrong owner');if(state.chainId&&state.chainId!==chainId)throw Error('Wrong chain');if(state.useMock!==undefined&&state.useMock!==useMock)throw Error('Existing deployment uses a different payment token');
 state.owner=owner;state.chainId=chainId;state.useMock=useMock;state.addresses??={};state.transactions??=[];persist(state);
 async function record(tx,label){log(label+'：等待確認');const r=await tx.wait();if(r.status!==1)throw Error('Transaction failed');state.transactions.push({label,hash:r.hash,block:r.blockNumber});persist(state);return r;}
 async function deploy(key,name,args=[]){if(state.addresses[key]){if(await signer.provider.getCode(state.addresses[key])==='0x')throw Error('Missing deployed code');return;}
 const c=await new ContractFactory(artifacts[name].abi,artifacts[name].bytecode,signer).deploy(...args);
 // Save submitted hash immediately so a page reload can recover without duplicate deployments.
 state.pending={key,hash:c.deploymentTransaction().hash};persist(state);
 await record(c.deploymentTransaction(),'部署 '+key);state.addresses[key]=await c.getAddress();delete state.pending;persist(state);}
 if(state.pending){log('復原待確認部署');const r=await signer.provider.waitForTransaction(state.pending.hash);if(!r||r.status!==1||!r.contractAddress)throw Error('Prior deployment did not succeed');state.addresses[state.pending.key]=r.contractAddress;delete state.pending;persist(state);}
 if(useMock){await deploy('cash','MockUSDC');}else{if(chainId!==11155111)throw Error('Official test USDC available here only on Sepolia');state.addresses.cash=SEPOLIA_USDC;const token=new Contract(SEPOLIA_USDC,ERC20_ABI,signer);if(await token.decimals()!==6n)throw Error('Invalid USDC configuration');persist(state);}
 await deploy('nft','MockSubscription');await deploy('openai','ValuationOracle',[encodeBytes32String('openai')]);await deploy('claude','ValuationOracle',[encodeBytes32String('claude')]);await deploy('pool','SubscriptionLending',[state.addresses.cash,state.addresses.nft,state.addresses.openai,state.addresses.claude,owner]);
 if(useMock&&!state.mockFunded){const cash=lendingContract('MockUSDC',state.addresses.cash,signer);await record(await cash.mint(state.addresses.pool,1000_000000),'注入模擬借貸資金');await record(await cash.mint(owner,100_000000),'準備模擬還款利息');state.mockFunded=true;persist(state);}
 state.deployed=true;persist(state);return state;
}
export async function pledgeValuation(signer,state,quote,log,persist){
 if(quote.mode!=='mock')throw Error('This browser PoC only posts mock agent valuations. Live requires server-side operator validation.');if(quote.reviewRequired||quote.demoMaxBorrowMicros<=0)throw Error('Valuation requires review');
 const s=quote.subscription;const nft=lendingContract('MockSubscription',state.addresses.nft,signer);const now=(await signer.provider.getBlock('latest')).timestamp;if(now>=quote.validUntil)throw Error('Quote expired: re-evaluate');
 let pending=state.pendingCollateral;
 const fingerprint=q=>JSON.stringify(['provider','plan','paidMicros','startsAt','expiresAt'].map(k=>q.subscription[k]));
 const hash=keccak256(toUtf8Bytes(JSON.stringify(quote)));
 if(pending&&!pending.complete&&pending.quoteHash!==hash){
  if(fingerprint(pending.quote)!==fingerprint(quote))throw Error('Finish registration of the pending subscription before changing metadata');
  pending.quote=quote;pending.quoteHash=hash;pending.agentDone=[];persist(state);
 }
 if(!pending||pending.quoteHash!==keccak256(toUtf8Bytes(JSON.stringify(quote)))){
  if(pending&&!pending.complete)throw Error('Finish the pending collateral registration before changing metadata');
  const tx=await nft.issue(state.owner,encodeBytes32String(s.provider),keccak256(toUtf8Bytes(s.plan)),s.startsAt,s.expiresAt,s.paidMicros);state.pendingCollateral={hash:tx.hash,quoteHash:hash,quote,agentDone:[]};persist(state);pending=state.pendingCollateral;log('建立模擬抵押憑證：等待確認');
 }
 if(!pending.id){const r=await signer.provider.waitForTransaction(pending.hash);if(r.status!==1)throw Error('NFT issuance failed');for(const l of r.logs){try{const e=nft.interface.parseLog(l);if(e?.name==='Transfer'&&e.args.from==='0x0000000000000000000000000000000000000000')pending.id=String(e.args.tokenId);}catch{}}if(!pending.id)throw Error('No issuance receipt');state.transactions.push({label:'建立模擬抵押憑證',hash:r.hash,block:r.blockNumber});persist(state);}
 // The calldata hashes record which MOCK estimates the PoC operator attested.
 for(const name of ['openai','claude'])if(!pending.agentDone.includes(name)){
 const oracle=lendingContract('ValuationOracle',state.addresses[name],signer);const agent=pending.quote.agents.find(a=>a.provider===name);const current=(await signer.provider.getBlock('latest')).timestamp;
 if(current>=pending.quote.validUntil)throw Error('Pending quote expired. Use retry with an updated valuation for the same metadata.');
 log('登錄 '+name+' 模擬估價：等待確認');const r=await(await oracle.attest(pending.id,agent.valueMicros,pending.quote.validUntil,keccak256(toUtf8Bytes(JSON.stringify(agent))))).wait();state.transactions.push({label:name+' 模擬估價',hash:r.hash,block:r.blockNumber});pending.agentDone.push(name);persist(state);
 }
 state.collateralId=pending.id;state.collateralQuote=pending.quote;pending.complete=true;persist(state);return pending.id;
}
export async function fundPool(signer,state,amount){await validateCash(signer.provider,state);const cash=new Contract(state.addresses.cash,ERC20_ABI,signer);if(amount<=0n||amount>5_000000n)throw Error('單筆入金須在 0 至 5 USDC 之間');if(await cash.balanceOf(state.owner)<amount)throw Error('測試 USDC 不足。請先向 Circle faucet 領取。');const r=await(await cash.transfer(state.addresses.pool,amount)).wait();return r;}
export async function borrow(signer,state,amount,durationSeconds){await validateCash(signer.provider,state);if(amount>4_900000n)throw Error('本金最多 4.9 USDC，預留利息後總還款不超過 5 USDC');const id=state.collateralId;if(!id)throw Error('請先登錄模擬抵押憑證');const pool=lendingContract('SubscriptionLending',state.addresses.pool,signer),nft=lendingContract('MockSubscription',state.addresses.nft,signer);if(amount>await pool.maxBorrow(id))throw Error('本金超過鏈上可借上限');await(await nft.approve(state.addresses.pool,id)).wait();const now=(await signer.provider.getBlock('latest')).timestamp;const r=await(await pool.borrow(id,amount,now+durationSeconds)).wait();if((await pool.loans(id)).status!==1n||await nft.ownerOf(id)!==state.addresses.pool)throw Error('Borrow verification failed');return r;}
export async function repay(signer,state,id){await validateCash(signer.provider,state);const pool=lendingContract('SubscriptionLending',state.addresses.pool,signer),cash=new Contract(state.addresses.cash,ERC20_ABI,signer);const current=await pool.debt(id);const loan=await pool.loans(id);const buffer=(loan.principal*1200n+365n*10000n-1n)/(365n*10000n)+1n;const cap=current+buffer;if(cap>5_000000n)throw Error('還款授權超過 5 USDC，停止交易');if(await cash.balanceOf(state.owner)<current)throw Error('餘額不足以還本金與利息。請補充測試 USDC。');await(await cash.approve(state.addresses.pool,cap)).wait();const r=await(await pool.repay(id,cap)).wait();if((await pool.loans(id)).status!==2n)throw Error('Repayment verification failed');return r;}
export async function liquidate(signer,state,id){await validateCash(signer.provider,state);const pool=lendingContract('SubscriptionLending',state.addresses.pool,signer);const r=await(await pool.liquidate(id)).wait();if((await pool.loans(id)).status!==3n)throw Error('Liquidation verification failed');return r;}
