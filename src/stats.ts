import {jStat} from 'jstat';
export const finite=(xs:unknown[])=>xs.map(Number).filter(Number.isFinite);
export const mean=(x:number[])=>x.length?x.reduce((a,b)=>a+b,0)/x.length:NaN;
export const variance=(x:number[])=>x.length>1?x.reduce((s,v)=>s+(v-mean(x))**2,0)/(x.length-1):NaN;
export const sd=(x:number[])=>Math.sqrt(variance(x));
export function quantile(x:number[],q:number){if(!x.length)return NaN;const a=[...x].sort((m,n)=>m-n),p=(a.length-1)*q,i=Math.floor(p),f=p-i;return a[i]+(a[i+1]===undefined?0:f*(a[i+1]-a[i]))}
export function welch(a:number[],b:number[]){const ma=mean(a),mb=mean(b),va=variance(a),vb=variance(b),se2=va/a.length+vb/b.length,t=se2>0?(mb-ma)/Math.sqrt(se2):0,df=se2>0?se2**2/((va/a.length)**2/(a.length-1)+(vb/b.length)**2/(b.length-1)):Math.max(1,a.length+b.length-2),p=2*(1-jStat.studentt.cdf(Math.abs(t),df)),pooled=Math.sqrt(((a.length-1)*va+(b.length-1)*vb)/Math.max(1,a.length+b.length-2)),effect=pooled>0?(mb-ma)/pooled:0;return {t,df,p:Math.min(1,Math.max(0,p)),effect}}
export function anova(groups:number[][]){const clean=groups.filter(g=>g.length),all=clean.flat(),grand=mean(all),ssb=clean.reduce((s,g)=>s+g.length*(mean(g)-grand)**2,0),ssw=clean.reduce((s,g)=>s+g.reduce((z,v)=>z+(v-mean(g))**2,0),0),df1=clean.length-1,df2=all.length-clean.length,F=df1>0&&df2>0?(ssb/df1)/(ssw/df2):0,p=df1>0&&df2>0?1-jStat.centralF.cdf(F,df1,df2):1;return {F,df1,df2,p}}
export function bh(p:number[]){const order=p.map((v,i)=>({v:Number.isFinite(v)?v:1,i})).sort((a,b)=>a.v-b.v),out=Array(p.length).fill(1);let prev=1;for(let k=order.length-1;k>=0;k--){prev=Math.min(prev,order[k].v*order.length/(k+1));out[order[k].i]=Math.min(1,prev)}return out}
