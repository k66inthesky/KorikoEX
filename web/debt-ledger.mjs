// Repaid loans have zero outstanding debt. Liquidation alone does not recover cash.
export function debtTotals(rows){return rows.reduce((total,row)=>{const owed=row.status===2?0n:BigInt(row.principal)+BigInt(row.interest);if(row.status===1||row.status===3){total.outstanding+=owed;total.count++;if(row.status===3)total.unrecovered+=owed;}return total;},{outstanding:0n,unrecovered:0n,count:0});}
