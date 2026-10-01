import {JsonRpcProvider,FetchRequest} from 'ethers';
let sepolia;
function sepoliaReader(){if(!sepolia){const request=new FetchRequest('https://ethereum-sepolia-rpc.publicnode.com');request.timeout=20000;sepolia=new JsonRpcProvider(request,11155111,{staticNetwork:true,cacheTimeout:-1,batchMaxCount:1});}return sepolia;}
// Some injected wallets do not reliably emit new-block notifications.
// Read public receipts independently while leaving all signing in the wallet.
export async function readProvider(provider){const network=await provider.getNetwork();return network.chainId===11155111n?sepoliaReader():provider;}
export async function waitForReceipt(provider,hash){
 const reader=await readProvider(provider);
 const deadline=Date.now()+180000;
 while(Date.now()<deadline){const receipt=await reader.getTransactionReceipt(hash);if(receipt){if(receipt.status!==1)throw Error('交易已回滾：'+hash);return receipt;}await new Promise(resolve=>setTimeout(resolve,2000));}
 throw Error('交易確認逾時，已保留交易 hash，請稍後繼續：'+hash);
}
export async function sendSubmitted(signer,method,args=[]){
 const reader=await readProvider(signer.provider);
 const request=await method.populateTransaction(...args);
 const gas=await reader.estimateGas({...request,from:await signer.getAddress()});
 const tx=await method(...args,{gasLimit:gas*120n/100n});
 return tx;
}

export async function sendConfirmed(signer,method,args=[]){const tx=await sendSubmitted(signer,method,args);return waitForReceipt(signer.provider,tx.hash);}
