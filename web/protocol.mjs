import {waitForReceipt,readProvider,sendConfirmed} from './receipts.mjs';
import {SEPOLIA_USDC,cashContract,validateCash} from './usdc.mjs';
import {Contract,ContractFactory,Interface,ZeroAddress,AbiCoder,keccak256,toUtf8Bytes,getBytes} from 'ethers';
import artifacts from './generated/contracts.json' with { type: 'json' };
export const TOPIC=1001n;
export function contract(name,address,runner){return new Contract(address,artifacts[name].abi,runner);}
export async function setup(signer,state={},log=()=>{},persist=()=>{},claimSigner=signer){
 const owner=await signer.getAddress();
 const net=await signer.provider.getNetwork();
 if(![31337n,11155111n].includes(net.chainId))throw Error('Only local chain or Sepolia permitted');
 if(state.owner&&state.owner.toLowerCase()!==owner.toLowerCase())throw Error('Deployment belongs to another wallet');
 if(state.chainId&&state.chainId!==Number(net.chainId))throw Error('Deployment belongs to another network');
 state.owner=owner;state.chainId=Number(net.chainId);state.transactions??=[];state.addresses??={};
 const record=async(tx,label)=>{log(label+'：等待確認');const r=await waitForReceipt(signer.provider,tx.hash);if(r.status!==1)throw Error(label+' failed');state.transactions.push({label,hash:r.hash,block:r.blockNumber});persist(state);return r;};
 if(state.pending){log('復原待確認部署 '+state.pending.key);const r=await waitForReceipt(signer.provider,state.pending.hash);if(!r||r.status!==1)throw Error('先前部署未成功，請檢查收據');if(state.pending.key==='hub')state.addresses.hub=r.contractAddress;else{const iface=new Interface(artifacts.DeploymentHub.abi);for(const l of r.logs){try{const e=iface.parseLog(l);if(e?.name==='Deployed')state.addresses[state.pending.key]=e.args.component;}catch{}}}if(!state.addresses[state.pending.key])throw Error('部署收據缺少合約地址');state.transactions.push({label:'復原部署 '+state.pending.key,hash:r.hash,block:r.blockNumber});delete state.pending;persist(state);}
 if(!state.addresses.hub){const f=new ContractFactory(artifacts.DeploymentHub.abi,artifacts.DeploymentHub.bytecode,signer);const hub=await f.deploy();state.pending={key:'hub',hash:hub.deploymentTransaction().hash};persist(state);await record(hub.deploymentTransaction(),'部署管理合約');state.addresses.hub=await hub.getAddress();delete state.pending;persist(state);}
 const hub=contract('DeploymentHub',state.addresses.hub,signer);
 const deploy=async(key,name,args=[],init)=>{
  if(state.addresses[key]){log('核對已部署 '+key);if(await (await readProvider(signer.provider)).getCode(state.addresses[key])==='0x')throw Error('Missing contract '+key);return;}
  const f=new ContractFactory(artifacts[name].abi,artifacts[name].bytecode,signer);const code=(await f.getDeployTransaction(...args)).data;
  const data=init?new Interface(artifacts[name].abi).encodeFunctionData(init[0],init[1]):'0x';
  log('估算部署 '+key);const request=await hub.deploy.populateTransaction(code,data);const gas=await (await readProvider(signer.provider)).estimateGas({...request,from:owner});const tx=await hub.deploy(code,data,{gasLimit:gas*120n/100n});state.pending={key,hash:tx.hash};persist(state);const r=await record(tx,'部署 '+key);
  for(const event of r.logs){try{const e=hub.interface.parseLog(event);if(e?.name==='Deployed')state.addresses[key]=e.args.component;}catch{}}
  if(!state.addresses[key])throw Error('No deployment event for '+key);delete state.pending;persist(state);
 };
 await deploy('topics','ClaimTopicsRegistry',[],['init',[]]);
 await deploy('issuers','TrustedIssuersRegistry',[],['init',[]]);
 await deploy('storage','IdentityRegistryStorage',[],['init',[]]);
 await deploy('registry','IdentityRegistry',[],['init',[state.addresses.issuers,state.addresses.topics,state.addresses.storage]]);
 await deploy('issuer','ClaimIssuer',[owner]);
 // Separate buyer and inventory identities, controlled by the PoC administration hub.
 await deploy('buyerIdentity','Identity',[state.addresses.hub,false]);
 await deploy('inventoryIdentity','Identity',[state.addresses.hub,false]);
 if(net.chainId===11155111n){if(state.addresses.cash&&state.addresses.cash.toLowerCase()!==SEPOLIA_USDC.toLowerCase())throw Error('舊環境不是 Sepolia USDC，請建立新環境');state.addresses.cash=SEPOLIA_USDC;await validateCash(signer.provider,state);persist(state);}else{await deploy('cash','MockUSD',[owner]);}
 await deploy('dvp','AtomicDvP',[state.addresses.cash]);
 state.expiresAt??=Math.floor(Date.now()/1000)+30*86400;persist(state);
 for(const batch of ['codex','claude']){
  await deploy(batch+'Compliance','CreditCompliance',[state.expiresAt]);
  await deploy(batch,'Token',[],['init',[state.addresses.registry,state.addresses[batch+'Compliance'],batch==='codex'?'Codex Service Voucher MOCK':'Claude Service Voucher MOCK',batch==='codex'?'CX-MOCK':'CL-MOCK',0,ZeroAddress]]);
 }
 if(state.pendingConfig){const r=await waitForReceipt(signer.provider,state.pendingConfig);if(!r||r.status!==1)throw Error('先前設定交易未成功');state.configured=true;state.transactions.push({label:'復原市場設定',hash:r.hash,block:r.blockNumber});delete state.pendingConfig;persist(state);}
 if(!state.configured){
  const targets=[],calls=[];const push=(key,name,method,args)=>{targets.push(state.addresses[key]);calls.push(new Interface(artifacts[name].abi).encodeFunctionData(method,args));};
  push('storage','IdentityRegistryStorage','bindIdentityRegistry',[state.addresses.registry]);
  push('registry','IdentityRegistry','addAgent',[state.addresses.hub]);
  push('topics','ClaimTopicsRegistry','addClaimTopic',[TOPIC]);
  push('issuers','TrustedIssuersRegistry','addTrustedIssuer',[state.addresses.issuer,[TOPIC]]);
  const data=toUtf8Bytes('DEMO ONLY: self-issued eligibility claim; not legal KYC');
  for(const key of ['buyerIdentity','inventoryIdentity']){
   log('簽署測試資格證明 '+key);
   const digest=keccak256(AbiCoder.defaultAbiCoder().encode(['address','uint256','bytes'],[state.addresses[key],TOPIC,data]));
   const signature=await claimSigner.signMessage(getBytes(digest));
   push(key,'Identity','addClaim',[TOPIC,1,state.addresses.issuer,signature,data,'']);
  }
  push('registry','IdentityRegistry','registerIdentity',[owner,state.addresses.buyerIdentity,158]);
  push('registry','IdentityRegistry','registerIdentity',[state.addresses.dvp,state.addresses.inventoryIdentity,158]);
  for(const batch of ['codex','claude']){
   push(batch,'Token','addAgent',[state.addresses.hub]);
   push(batch,'Token','unpause',[]);
   push(batch,'Token','mint',[state.addresses.dvp,1000]);
   push('dvp','AtomicDvP','list',[state.addresses[batch],batch==='codex'?100000n:150000n]);
  }
  const request=await hub.execute.populateTransaction(targets,calls);const gas=await (await readProvider(signer.provider)).estimateGas({...request,from:owner});const tx=await hub.execute(targets,calls,{gasLimit:gas*120n/100n});state.pendingConfig=tx.hash;persist(state);await record(tx,'設定資格、資產與市場');state.configured=true;delete state.pendingConfig;persist(state);
 }
 return state;
}
export async function trade(signer,state,batch,units=10n){
 if(!state.configured)throw Error('Deploy and configure first');
 const network=await signer.provider.getNetwork();if(Number(network.chainId)!==state.chainId)throw Error('Wrong network');
 await validateCash(signer.provider,state);if(!['codex','claude'].includes(batch)||units<=0n||units>1000n)throw Error('Invalid order');const buyer=await signer.getAddress();const reader=await readProvider(signer.provider);const dvp=contract('AtomicDvP',state.addresses.dvp,reader);const cash=cashContract(state.addresses.cash,reader);const token=contract('Token',state.addresses[batch],reader);
 const price=await dvp.unitPrice(state.addresses[batch]);const payment=price*units;if(payment>5_000000n)throw Error('單筆交易不可超過 5 Sepolia USDC');if(price===0n)throw Error('尚未掛牌');if(await cash.balanceOf(buyer)<payment)throw Error('Sepolia USDC 餘額不足，請先領取測試 USDC');if(await token.balanceOf(state.addresses.dvp)<units)throw Error('憑證庫存不足');if(!await contract('IdentityRegistry',state.addresses.registry,reader).isVerified(buyer))throw Error('未通過測試資格 Claim');
 if(await cash.allowance(buyer,state.addresses.dvp)<payment)await sendConfirmed(signer,cash.connect(signer).approve,[state.addresses.dvp,payment]);
 const before={cash:await cash.balanceOf(buyer),asset:await token.balanceOf(buyer)};
 const block=await reader.getBlock('latest');
 const r=await sendConfirmed(signer,dvp.connect(signer).buy,[state.addresses[batch],units,payment,block.timestamp+600]);
 const after={cash:await cash.balanceOf(buyer),asset:await token.balanceOf(buyer)};
 if(r.status!==1)throw Error('Settlement reverted');if(before.cash-after.cash!==payment||after.asset-before.asset!==units)throw Error('Balance verification failed');
 const event=r.logs.map(l=>{try{return dvp.interface.parseLog(l)}catch{return null}}).find(e=>e?.name==='Settled');
 if(!event||event.args.buyer.toLowerCase()!==buyer.toLowerCase()||event.args.asset.toLowerCase()!==state.addresses[batch].toLowerCase()||event.args.units!==units||event.args.payment!==payment)throw Error('Missing settlement event');
 return {batch,units:String(units),payment:String(payment),transactionHash:r.hash,blockNumber:r.blockNumber,chainId:Number(network.chainId),verified:true,paymentToken:state.addresses.cash,buyer,balances:{before:{cash:String(before.cash),asset:String(before.asset)},after:{cash:String(after.cash),asset:String(after.asset)}}};
}
