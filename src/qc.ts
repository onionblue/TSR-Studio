import type {DataAsset,ModuleKey,Sample} from './types';
export function assess(module:ModuleKey,fileName:string,data:Record<string,unknown>[],samples:Sample[],sourceFormat='table',importMessages:string[]=[]):DataAsset{
 const messages:string[]=[...importMessages];const cols=Object.keys(data[0]??{});let missing=0,total=0;for(const row of data)for(const v of Object.values(row)){total++;if(v===''||v==null||Number.isNaN(v))missing++}
 const sampleIds=new Set(samples.map(s=>s.id));const sampleColumns=cols.filter(c=>sampleIds.has(c));if(!data.length)messages.push('文件没有可读取的数据行');if(!samples.length)messages.push('尚未建立样本关系表');if(samples.length&&sampleColumns.length===0&&!['chemistry','phenotype','scfa'].includes(module))messages.push('未发现与样本表匹配的表达列');
 const missingRate=total?missing/total:1; if(missingRate>.3)messages.push('总体缺失率超过30%');const blocked=!data.length||(samples.length>0&&sampleColumns.length===0&&!['chemistry','phenotype','scfa'].includes(module));
 return {id:crypto.randomUUID(),module,fileName,importedAt:new Date().toISOString(),rows:data.length,columns:cols.length,sampleColumns,missingRate,status:blocked?'blocked':messages.length?'warning':'ready',messages,data,sourceFormat};
}
