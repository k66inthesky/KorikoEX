export const POLICY={ltvBps:3000,aprBps:1200,yearDays:365,disagreementLimit:.30};
export function validateSubscription(input,now=Math.floor(Date.now()/1000)){
 if(!input||!['codex','claude'].includes(input.provider))throw Error('Unsupported provider');
 if(typeof input.plan!=='string'||input.plan.length<1||input.plan.length>50)throw Error('Invalid plan');
 if(!Number.isSafeInteger(input.paidMicros)||input.paidMicros<1||input.paidMicros>10_000*1e6)throw Error('Invalid paid amount');
 if(!Number.isSafeInteger(input.startsAt)||!Number.isSafeInteger(input.expiresAt)||input.startsAt>now||input.expiresAt<=now||input.expiresAt<=input.startsAt||input.expiresAt-input.startsAt>366*86400)throw Error('Invalid subscription dates');
 return {...input,remainingValueMicros:Math.floor(input.paidMicros*(input.expiresAt-now)/(input.expiresAt-input.startsAt)),now};
}
export function mockValuation(input,now=Math.floor(Date.now()/1000)){
 const s=validateSubscription(input,now);
 const agent=(provider,discount,reason)=>({provider,mode:'mock',valueMicros:Math.floor(s.remainingValueMicros*discount),confidence:.65,reason});
 return combineValuations(s,[agent('openai',.65,'模擬折價35%，考慮剩餘期限與履約風險'),agent('claude',.60,'模擬折價40%，採更保守的回收假設')]);
}
export function combineValuations(input,agents){
 const s=validateSubscription(input,input.now);
 if(!Array.isArray(agents)||agents.length!==2||agents[0].provider!=='openai'||agents[1].provider!=='claude')throw Error('Two independent agent results required');
 for(const a of agents)if(!Number.isSafeInteger(a.valueMicros)||a.valueMicros<0||a.valueMicros>s.remainingValueMicros||!Number.isFinite(a.confidence)||a.confidence<0||a.confidence>1||!['mock','live'].includes(a.mode)||typeof a.reason!=='string'||a.reason.length>1500)throw Error('Invalid agent valuation');
 const low=Math.min(...agents.map(a=>a.valueMicros)),high=Math.max(...agents.map(a=>a.valueMicros));
 const disagreement=high===0?0:(high-low)/high;
 const reviewRequired=disagreement>POLICY.disagreementLimit||agents.some(a=>a.confidence<.5)||agents.some(a=>a.mode!==agents[0].mode);
 // Ordinary Codex/Claude subscriptions have no established transferable liquidation right.
 // A live model may estimate utility value, but production lending remains ineligible.
 return {mode:agents[0].mode,agents,residualMicros:low,prepaidCeilingMicros:s.remainingValueMicros,demoMaxBorrowMicros:reviewRequired?0:Math.floor(low*POLICY.ltvBps/10000),productionMaxBorrowMicros:0,productionEligible:false,reviewRequired,disagreement,issuedAt:s.now,validUntil:s.now+900,subscription:s,policy:POLICY,restriction:'模擬抵押。未取得可轉讓權利與供應商授權，實際可清算抵押價值為0。'};
}
export function accruedInterest(principalMicros,seconds){if(!Number.isSafeInteger(principalMicros)||principalMicros<0||!Number.isSafeInteger(seconds)||seconds<0)throw Error('Invalid interest input');const numerator=BigInt(principalMicros)*BigInt(POLICY.aprBps)*BigInt(seconds),den=10000n*365n*86400n;return numerator===0n?0n:(numerator-1n)/den+1n;}
