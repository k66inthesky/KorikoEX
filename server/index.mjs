import http from 'node:http';
import {evaluate} from './agents.mjs';
import {timingSafeEqual} from 'node:crypto';
const host='127.0.0.1',port=8788;
const limits=new Map();
function authorized(header){const expected=process.env.VALUATION_API_TOKEN;if(!expected)return process.env.VALUATION_MODE!=='live';const a=Buffer.from(header||''),b=Buffer.from('Bearer '+expected);return a.length===b.length&&timingSafeEqual(a,b);}
http.createServer(async(req,res)=>{
 res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
 if(req.method!=='POST'||req.url!=='/api/value'){res.writeHead(404);res.end('{"error":"Not found"}');return;}
 if(!authorized(req.headers.authorization)){res.writeHead(401);res.end('{"error":"Unauthorized"}');return;}
 const ip=req.socket.remoteAddress;const now=Date.now(),previous=limits.get(ip)||0;
 if(now-previous<1000){res.writeHead(429);res.end('{"error":"Rate limited"}');return;}limits.set(ip,now);
 let body='';try{for await(const part of req){body+=part;if(body.length>8192)throw Error('Input too large');}const input=JSON.parse(body);
 // Only metadata is forwarded. Credentials and arbitrary document content are rejected.
 if(Object.keys(input).some(k=>!['provider','plan','paidMicros','startsAt','expiresAt'].includes(k)))throw Error('Unexpected fields');
 res.end(JSON.stringify(await evaluate(input)));
 }catch(e){res.writeHead(400);res.end(JSON.stringify({error:e.message}));}
}).listen(port,host,()=>console.log('Valuation adapter listening on http://'+host+':'+port+'; mode='+(process.env.VALUATION_MODE||'mock')));
