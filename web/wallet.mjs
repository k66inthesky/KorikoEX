import {BrowserProvider} from 'ethers';
export const SEPOLIA_CHAIN_ID='0xaa36a7';
export async function ensureSepolia(wallet){
 const current=await wallet.request({method:'eth_chainId'});
 if(current!==SEPOLIA_CHAIN_ID){
  try{await wallet.request({method:'wallet_switchEthereumChain',params:[{chainId:SEPOLIA_CHAIN_ID}]});}
  catch(e){if(Number(e.code??e.data?.originalError?.code)!==4902)throw e;await wallet.request({method:'wallet_addEthereumChain',params:[{chainId:SEPOLIA_CHAIN_ID,chainName:'Sepolia',nativeCurrency:{name:'Sepolia Ether',symbol:'ETH',decimals:18},rpcUrls:['https://ethereum-sepolia-rpc.publicnode.com'],blockExplorerUrls:['https://sepolia.etherscan.io']}]});await wallet.request({method:'wallet_switchEthereumChain',params:[{chainId:SEPOLIA_CHAIN_ID}]});}
 }
 if(await wallet.request({method:'eth_chainId'})!==SEPOLIA_CHAIN_ID)throw Error('錢包仍未切換至 Sepolia，停止交易。');
}
export function discoverWallets(select,scope=window){
 const wallets=new Map();
 function add(id,name,wallet){if(!wallet?.request||wallets.has(id))return;wallets.set(id,wallet);const option=document.createElement('option');option.value=id;option.textContent=name;select.append(option);select.hidden=false;}
 scope.addEventListener('eip6963:announceProvider',e=>{const d=e.detail;if(d?.info?.uuid)add(d.info.uuid,d.info.name||'EVM 錢包',d.provider);});
 scope.dispatchEvent(new Event('eip6963:requestProvider'));
 if(scope.ethereum&&!wallets.size)add('injected','瀏覽器錢包',scope.ethereum);
 return ()=>wallets.get(select.value)||scope.ethereum;
}
export async function connectSepolia(wallet){
 if(!wallet)throw Error('此瀏覽器未偵測到錢包。請在已安裝 MetaMask／EVM 錢包的 Chrome 或 Edge 開啟此頁，再連接；不需提供私鑰。');
 await wallet.request({method:'eth_requestAccounts'});await ensureSepolia(wallet);
 const provider=new BrowserProvider(wallet,undefined,{cacheTimeout:-1});const signer=await provider.getSigner();
 if((await provider.getNetwork()).chainId!==11155111n)throw Error('非 Sepolia 網路，停止交易。');
 return {provider,signer};
}
export function watchWallet(wallet){wallet.on?.('accountsChanged',()=>location.reload());wallet.on?.('chainChanged',()=>location.reload());}
