const LIMIT=5_000000n;
// The contract calculates the actual principal + accrued interest at execution.
// The cap only reserves room for interest while wallet confirmations are pending.
export async function fullRepayment({pool,cash,owner,id,approve,pay,onProgress=()=>{}}){
 const loan=await pool.loans(id);
 if(loan.status!==1n)throw Error('這筆借款已結清或已清算，請重新讀取欠款');
 if(loan.borrower.toLowerCase()!==owner.toLowerCase())throw Error('請使用這筆借款的錢包還款');
 const debt=await pool.debt(id);
 const buffer=(loan.principal*1200n+365n*10000n-1n)/(365n*10000n)+1n;
 const cap=debt+buffer;
 if(cap>LIMIT)throw Error('還款授權超過 5 USDC，停止交易');
 if(await cash.balanceOf(owner)<debt)throw Error('餘額不足以還本金與利息，請補充測試 USDC');
 const poolAddress=await pool.getAddress();
 if(await cash.allowance(owner,poolAddress)<cap){
  onProgress({stage:'approval',debt,cap});
  await approve(poolAddress,cap);
  if(await cash.allowance(owner,poolAddress)<cap)throw Error('錢包授權金額不足。系統已帶入還款額，請勿改成 0；請重新按全額還款');
 }
 onProgress({stage:'payment',debt:await pool.debt(id),cap});
 return pay(id,cap);
}
