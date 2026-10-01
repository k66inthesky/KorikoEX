import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateCash,SEPOLIA_USDC} from '../web/usdc.mjs';
test('Sepolia refuses an old mock payment token before any token call',async()=>{let called=false;await assert.rejects(validateCash({getNetwork:async()=>({chainId:11155111n}),getCode:async()=>{called=true;}},{chainId:11155111,addresses:{cash:'0x0000000000000000000000000000000000000001'}}),/舊付款代幣/);assert.equal(called,false);});
test('payment verification blocks a network switch',async()=>{await assert.rejects(validateCash({getNetwork:async()=>({chainId:1n})},{chainId:11155111,addresses:{cash:SEPOLIA_USDC}}),/錯誤網路/);});
