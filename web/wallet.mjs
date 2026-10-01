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

// Passive discovery reads eth_accounts only; a new binding always asks the wallet.
export function mountWallet({onConnect,onDisconnect,onError,isBusy=()=>false}){
 const select=document.querySelector('#wallet-select'),button=document.querySelector('#connect'),disconnect=document.querySelector('#disconnect'),status=document.querySelector('#wallet-status');
 const records=new Map();let currentAddress,active,cleanup=()=>{},connecting=false,generation=0;
 const preference='korikoex-wallet';const read=()=>JSON.parse(localStorage.getItem(preference)||'null');
 function paint(address=currentAddress){currentAddress=address;button.textContent=address?address.slice(0,6)+'…'+address.slice(-4):'綁定錢包';disconnect.hidden=!address;status.textContent=address?'已綁定 · Sepolia':'已偵測 '+records.size+' 個錢包';}
 async function reset(revoke=false){generation++;cleanup();cleanup=()=>{};const old=active;active=undefined;currentAddress=undefined;localStorage.setItem(preference,JSON.stringify({disconnected:true}));paint();await onDisconnect();if(revoke&&old){try{await old.request({method:'wallet_revokePermissions',params:[{eth_accounts:{}}]});}catch{status.textContent='已斷開網站連線；錢包授權可於錢包內撤銷';}}}
 async function bind(passive=false){if(connecting||isBusy())return;const entry=records.get(select.value);if(!entry){onError(Error('未偵測到錢包，請在已安裝 EVM 錢包的瀏覽器開啟'));return;}connecting=true;const ticket=++generation;button.disabled=true;select.disabled=true;disconnect.disabled=true;
 try{let connection;if(passive){const accounts=await entry.provider.request({method:'eth_accounts'});if(!accounts.length||await entry.provider.request({method:'eth_chainId'})!==SEPOLIA_CHAIN_ID)return;const provider=new BrowserProvider(entry.provider,undefined,{cacheTimeout:-1});connection={provider,signer:await provider.getSigner()};}else connection=await connectSepolia(entry.provider);
 if(ticket!==generation)return;cleanup();active=entry.provider;const address=await connection.signer.getAddress();await onConnect(connection);localStorage.setItem(preference,JSON.stringify({rdns:entry.rdns,disconnected:false}));paint(address);
 const changed=()=>{if(isBusy()){location.reload();return;}reset(false).catch(onError);};active.on?.('accountsChanged',changed);active.on?.('chainChanged',changed);cleanup=()=>{entry.provider.removeListener?.('accountsChanged',changed);entry.provider.removeListener?.('chainChanged',changed);};
 }catch(e){await reset(false);onError(e);}finally{connecting=false;button.disabled=false;select.disabled=false;disconnect.disabled=false;}}
 function add(id,name,provider,rdns=id){if(!provider?.request||records.has(id))return;records.set(id,{provider,rdns});const option=document.createElement('option');option.value=id;option.textContent=name;select.append(option);select.hidden=false;paint();const pref=read();if(pref?.rdns===rdns&&!pref.disconnected){select.value=id;bind(true).catch(onError);}}
 window.addEventListener('eip6963:announceProvider',e=>{const d=e.detail;if(d?.info?.uuid)add(d.info.uuid,d.info.name||'EVM 錢包',d.provider,d.info.rdns);});window.dispatchEvent(new Event('eip6963:requestProvider'));
 if(window.ethereum&&!records.size)add('injected','瀏覽器錢包',window.ethereum);
 button.onclick=()=>bind(false);select.onchange=async()=>{if(isBusy()||connecting)return;await reset(false);await bind(false);};disconnect.onclick=()=>{if(!isBusy()&&!connecting)reset(true).catch(onError);};paint();return {disconnect:reset};
}
