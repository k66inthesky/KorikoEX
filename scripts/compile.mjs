import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
const roots={
 Exchange:'contracts/Exchange.sol',
 Lending:'contracts/Lending.sol',
 Token:'@tokenysolutions/t-rex/contracts/token/Token.sol',
 IdentityRegistry:'@tokenysolutions/t-rex/contracts/registry/implementation/IdentityRegistry.sol',
 IdentityRegistryStorage:'@tokenysolutions/t-rex/contracts/registry/implementation/IdentityRegistryStorage.sol',
 ClaimTopicsRegistry:'@tokenysolutions/t-rex/contracts/registry/implementation/ClaimTopicsRegistry.sol',
 TrustedIssuersRegistry:'@tokenysolutions/t-rex/contracts/registry/implementation/TrustedIssuersRegistry.sol',
 BasicCompliance:'@tokenysolutions/t-rex/contracts/compliance/legacy/BasicCompliance.sol',
 Identity:'@onchain-id/solidity/contracts/Identity.sol',
 ClaimIssuer:'@onchain-id/solidity/contracts/ClaimIssuer.sol'
};
function read(p){return fs.readFileSync(p.startsWith('@')?path.join('node_modules',p):p,'utf8');}
const sources=Object.fromEntries(Object.values(roots).map(p=>[p,{content:read(p)}]));
const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:100},outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}}),{import:p=>{try{return {contents:read(p)}}catch(e){return {error:e.message}}}}));
for(const e of output.errors||[])if(e.severity==='error')throw new Error(e.formattedMessage);
const artifacts={};
for(const [source,contracts] of Object.entries(output.contracts))for(const [name,a] of Object.entries(contracts))if([...Object.keys(roots),'DeploymentHub','MockUSD','AtomicDvP','CreditCompliance','MockSubscription','MockUSDC','ValuationOracle','SubscriptionLending'].includes(name)){
 artifacts[name]={abi:a.abi,bytecode:'0x'+a.evm.bytecode.object};
 if(a.evm.deployedBytecode.object.length/2>24576)throw new Error(name+' exceeds EIP-170');
}
fs.mkdirSync('web/generated',{recursive:true});fs.writeFileSync('web/generated/contracts.json',JSON.stringify(artifacts));
console.log('Compiled official T-REX + ONCHAINID and DvP:',Object.keys(artifacts).join(', '));
