import fs from 'node:fs/promises';
import {JsonRpcProvider,Interface,FetchRequest} from 'ethers';
const evidence=JSON.parse(await fs.readFile(new URL('../public/sepolia-evidence.json',import.meta.url)));
const artifacts=JSON.parse(await fs.readFile(new URL('../web/generated/contracts.json',import.meta.url)));
const request=new FetchRequest(process.env.SEPOLIA_RPC_URL||'https://ethereum-sepolia-rpc.publicnode.com');request.timeout=20000;const provider=new JsonRpcProvider(request,11155111,{staticNetwork:true,batchMaxCount:1});
if((await provider.getNetwork()).chainId!==11155111n)throw Error('Wrong chain');
const dvp=new Interface(artifacts.AtomicDvP.abi),erc20=new Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const same=(a,b)=>a.toLowerCase()===b.toLowerCase();
const checked=await Promise.all(evidence.trades.map(async trade=>{
 const receipt=await provider.getTransactionReceipt(trade.transactionHash);
 if(!receipt||receipt.status!==1)throw Error('Missing successful receipt');
 const settled=receipt.logs.filter(l=>same(l.address,evidence.addresses.dvp)).map(l=>{try{return dvp.parseLog(l)}catch{return null}}).find(e=>e?.name==='Settled');
 if(!settled||!same(settled.args.buyer,trade.buyer)||!same(settled.args.asset,evidence.addresses[trade.batch])||settled.args.payment!==BigInt(trade.payment)||settled.args.units!==BigInt(trade.units))throw Error('Settlement mismatch');
 const transfers=receipt.logs.map(l=>{try{return {address:l.address,event:erc20.parseLog(l)}}catch{return null}}).filter(Boolean);
 if(!transfers.some(l=>same(l.address,trade.paymentToken)&&same(l.event.args.from,trade.buyer)&&same(l.event.args.to,evidence.addresses.dvp)&&l.event.args.value===BigInt(trade.payment)))throw Error('USDC transfer mismatch');
 if(!transfers.some(l=>same(l.address,evidence.addresses[trade.batch])&&same(l.event.args.to,trade.buyer)&&l.event.args.value===BigInt(trade.units)))throw Error('Voucher transfer mismatch');
 return {batch:trade.batch,hash:receipt.hash,block:receipt.blockNumber,verified:true};
}));
console.log(JSON.stringify({chainId:11155111,checked},null,2));provider.destroy();
