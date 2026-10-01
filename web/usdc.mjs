import {Contract} from 'ethers';
export const SEPOLIA_USDC='0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
export const ERC20_ABI=['function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)','function transfer(address,uint256) returns(bool)'];
export const cashContract=(address,runner)=>new Contract(address,ERC20_ABI,runner);
export async function validateCash(provider,state){
 const chain=Number((await provider.getNetwork()).chainId);
 if(chain!==state.chainId||![31337,11155111].includes(chain))throw Error('錯誤網路，停止交易');
 if(chain===11155111&&state.addresses.cash?.toLowerCase()!==SEPOLIA_USDC.toLowerCase())throw Error('此環境使用舊付款代幣，請重新建立 Sepolia USDC 環境');
 if(await provider.getCode(state.addresses.cash)==='0x'||await cashContract(state.addresses.cash,provider).decimals()!==6n)throw Error('付款合約無效');
}
