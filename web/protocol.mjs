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
 const record=async(tx,label)=>{log(label+'：等待確認');const r=await tx.wait();if(r.status!==1)throw Error(label+' failed');state.transactions.push({label,hash:r.hash,block:r.blockNumber});persist(state);return r;};
 if(!state.addresses.hub){const f=new ContractFactory(artifacts.DeploymentHub.abi,artifacts.DeploymentHub.bytecode,signer);const hub=await f.deploy();await record(hub.deploymentTransaction(),'部署管理合約');state.addresses.hub=await hub.getAddress();persist(state);}
 const hub=contract('DeploymentHub',state.addresses.hub,signer);
 const deploy=async(key,name,args=[],init)=>{
  if(state.addresses[key]){if(await signer.provider.getCode(state.addresses[key])==='0x')throw Error('Missing contract '+key);return;}
  const f=new ContractFactory(artifacts[name].abi,artifacts[name].bytecode,signer);const code=(await f.getDeployTransaction(...args)).data;
  const data=init?new Interface(artifacts[name].abi).encodeFunctionData(init[0],init[1]):'0x';
  const tx=await hub.deploy(code,data);const r=await record(tx,'部署 '+key);
  for(const event of r.logs){try{const e=hub.interface.parseLog(event);if(e?.name==='Deployed')state.addresses[key]=e.args.component;}catch{}}
  if(!state.addresses[key])throw Error('No deployment event for '+key);persist(state);
 };
 await deploy('topics','ClaimTopicsRegistry',[],['init',[]]);
 await deploy('issuers','TrustedIssuersRegistry',[],['init',[]]);
 await deploy('storage','IdentityRegistryStorage',[],['init',[]]);
 await deploy('registry','IdentityRegistry',[],['init',[state.addresses.issuers,state.addresses.topics,state.addresses.storage]]);
 await deploy('issuer','ClaimIssuer',[owner]);
 // Separate buyer and inventory identities, controlled by the PoC administration hub.
 await deploy('buyerIdentity','Identity',[state.addresses.hub,false]);
 await deploy('inventoryIdentity','Identity',[state.addresses.hub,false]);
 await deploy('cash','MockUSD',[owner]);
 await deploy('dvp','AtomicDvP',[state.addresses.cash]);
 state.expiresAt??=Math.floor(Date.now()/1000)+30*86400;persist(state);
 for(const batch of ['codex','claude']){
  await deploy(batch+'Compliance','CreditCompliance',[state.expiresAt]);
  await deploy(batch,'Token',[],['init',[state.addresses.registry,state.addresses[batch+'Compliance'],batch==='codex'?'Codex Service Voucher MOCK':'Claude Service Voucher MOCK',batch==='codex'?'CX-MOCK':'CL-MOCK',0,ZeroAddress]]);
 }
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
   push('dvp','AtomicDvP','list',[state.addresses[batch],batch==='codex'?500000n:700000n]);
  }
  await record(await hub.execute(targets,calls),'設定資格、資產與市場');state.configured=true;persist(state);
 }
 return state;
}
export async function trade(signer,state,batch,units=10n){
 if(!state.configured)throw Error('Deploy and configure first');
 const network=await signer.provider.getNetwork();if(Number(network.chainId)!==state.chainId)throw Error('Wrong network');
 const buyer=await signer.getAddress();const dvp=contract('AtomicDvP',state.addresses.dvp,signer);const cash=contract('MockUSD',state.addresses.cash,signer);const token=contract('Token',state.addresses[batch],signer);
 const price=await dvp.unitPrice(state.addresses[batch]);const payment=price*units;
 if(await cash.allowance(buyer,state.addresses.dvp)<payment)await (await cash.approve(state.addresses.dvp,payment)).wait();
 const before={cash:await cash.balanceOf(buyer),asset:await token.balanceOf(buyer)};
 const block=await signer.provider.getBlock('latest');
 const r=await(await dvp.buy(state.addresses[batch],units,payment,block.timestamp+600)).wait();
 const after={cash:await cash.balanceOf(buyer),asset:await token.balanceOf(buyer)};
 if(before.cash-after.cash!==payment||after.asset-before.asset!==units)throw Error('Balance verification failed');
 const event=r.logs.map(l=>{try{return dvp.interface.parseLog(l)}catch{return null}}).find(e=>e?.name==='Settled');
 if(!event||event.args.buyer.toLowerCase()!==buyer.toLowerCase())throw Error('Missing settlement event');
 return {batch,units:String(units),payment:String(payment),transactionHash:r.hash,blockNumber:r.blockNumber,chainId:Number(network.chainId),verified:true,buyer,balances:{before:{cash:String(before.cash),asset:String(before.asset)},after:{cash:String(after.cash),asset:String(after.asset)}}};
}
