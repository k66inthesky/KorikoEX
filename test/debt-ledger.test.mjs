import test from 'node:test';
import assert from 'node:assert/strict';
import {debtTotals} from '../web/debt-ledger.mjs';
test('sum each outstanding loan, exclude repaid debt, retain liquidated loss',()=>{assert.deepEqual(debtTotals([{status:1,principal:1000000n,interest:329n},{status:1,principal:2000000n,interest:658n},{status:2,principal:3000000n,interest:987n},{status:3,principal:1000000n,interest:2302n}]),{outstanding:4003289n,unrecovered:1002302n,count:3});assert.deepEqual(debtTotals([]),{outstanding:0n,unrecovered:0n,count:0});});
