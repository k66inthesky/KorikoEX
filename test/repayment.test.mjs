import test from 'node:test';
import assert from 'node:assert/strict';
import {fullRepayment} from '../web/repayment.mjs';
const owner='0xabc';
function setup(allowance=0n){let allowed=allowance;const calls=[];return {calls,args:{owner,id:'1',pool:{loans:async()=>({status:1n,borrower:owner,principal:100000n}),debt:async()=>100001n,getAddress:async()=>'pool'},cash:{balanceOf:async()=>1000000n,allowance:async()=>allowed},approve:async(spender,amount)=>{calls.push(['approve',spender,amount]);allowed=amount},pay:async(id,cap)=>{calls.push(['repay',id,cap]);return {status:1}}}};}
test('one click supplies full debt and finite nonzero approval without amount input',async()=>{const {args,calls}=setup();await fullRepayment(args);assert.deepEqual(calls,[['approve','pool',100035n],['repay','1',100035n]]);});
test('existing sufficient approval skips amount selection and sends repayment',async()=>{const {args,calls}=setup(100035n);await fullRepayment(args);assert.deepEqual(calls,[['repay','1',100035n]]);});
test('wallet overriding approval to zero prevents repayment',async()=>{const {args,calls}=setup();args.approve=async()=>{};await assert.rejects(fullRepayment(args),/授權金額不足/);assert.equal(calls.length,0);});
