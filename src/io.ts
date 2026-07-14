import * as XLSX from 'xlsx';
import type {ModuleKey,Sample} from './types';
export interface ParsedImport{data:Record<string,unknown>[];inferredSamples:Sample[];format:string;messages:string[]}
const sample=(id:string,group:string):Sample=>({id,group,animalId:id,sex:'',batch:'B1',tissue:'',timepoint:'',included:true});
const clean=(x:unknown)=>String(x??'').trim();
function parse(wb:XLSX.WorkBook,module:ModuleKey,fileName:string):ParsedImport{
 const ws=wb.Sheets[wb.SheetNames[0]],matrix=XLSX.utils.sheet_to_json<unknown[]>(ws,{header:1,defval:'',raw:true});
 if(!matrix.length)return {data:[],inferredSamples:[],format:'empty',messages:['工作表为空']};
 if(module==='phenotype')return phenotype(matrix,fileName.replace(/\.(xlsx?|csv|tsv)$/i,''));
 const data=XLSX.utils.sheet_to_json<Record<string,unknown>>(ws,{defval:'',raw:true});
 if(['proteomics','metabolomics','transcriptomics'].includes(module))return omics(data);
 return {data,inferredSamples:[],format:'table',messages:[]};
}
function phenotype(rows:unknown[][],metric:string):ParsedImport{
 const head=rows[0]??[],nonempty=head.map((v,i)=>[clean(v),i] as const).filter(x=>x[0]),cohort=metric.replace(/[^A-Za-z0-9\u4e00-\u9fa5]+/g,'_');
 if(nonempty.length>=2&&nonempty.length===head.length){
  const data:Record<string,unknown>[]=[],samples:Sample[]=[];
  for(const [group,c] of nonempty)for(let r=1;r<rows.length;r++){const value=rows[r]?.[c];if(value===''||value==null)continue;const id=`${cohort}_${group}_${String(r).padStart(2,'0')}`;data.push({Sample_ID:id,[metric]:value});samples.push(sample(id,group))}
  return {data,inferredSamples:samples,format:'group-columns',messages:['已将按组分列工作表转换为动物级数据']};
 }
 const starts=nonempty.filter(([,i])=>i>0);if(starts.length>=2){
  const data=new Map<string,Record<string,unknown>>(),samples:Sample[]=[];
  starts.forEach(([group,start],gi)=>{const end=(starts[gi+1]?.[1]??head.length)-1;for(let c=start;c<=end;c++){const id=`${cohort}_${group}_${String(c-start+1).padStart(2,'0')}`;samples.push(sample(id,group));const rec:Record<string,unknown>={Sample_ID:id};for(let r=1;r<rows.length;r++){const tp=clean(rows[r]?.[0])||String(r-1),v=rows[r]?.[c];if(v!==''&&v!=null)rec[`${metric}_T${tp}`]=v}data.set(id,rec)}});
  return {data:[...data.values()],inferredSamples:samples,format:'repeated-group-blocks',messages:['已还原合并组表头，并按动物保留重复测量时间点']};
 }
 return {data:XLSX.utils.sheet_to_json<Record<string,unknown>>(XLSX.utils.aoa_to_sheet(rows),{defval:''}),inferredSamples:[],format:'table',messages:['未能自动识别行为学版式，请检查表头']};
}
function omics(data:Record<string,unknown>[]):ParsedImport{
 const cols=Object.keys(data[0]??{}),annotation=/\.(?:vs\.|FC$|Pvalue$|log2FC$|UP\.DOWN$)|^(?:GO_|KEGG_|KO$|KO_|KOG|IPR_|Subcellular_|TF_)/i;
 const identity=new Set(['Protein','Description','Gene','Gene_ID','Protein_ID','Feature_ID','ID','Name']);
 const numeric=cols.filter(c=>!identity.has(c)&&!annotation.test(c)&&data.slice(0,30).filter(r=>Number.isFinite(Number(r[c]))).length>=Math.min(3,data.length));
 const inferred=numeric.map(id=>sample(id,inferGroup(id))),hasStats=cols.some(c=>/\.Pvalue$/i.test(c));
 const messages=[`识别到${numeric.length}个定量样本列`];if(hasStats)messages.push('同时检测到既有FC/P值与功能注释；重新统计仅使用样本定量列，原列原样保留');
 return {data,inferredSamples:inferred,format:hasStats?'matrix-with-published-results':'quantitative-matrix',messages};
}
function inferGroup(id:string){const m=id.match(/^([A-Za-z]+?)(?=\d|[._-])/);return (m?.[1]??'待确认').toUpperCase()}
export function parseWorkbook(bytes:string,module:ModuleKey,fileName:string){const raw=Uint8Array.from(atob(bytes),c=>c.charCodeAt(0));return parse(XLSX.read(raw,{type:'array'}),module,fileName)}
export function parseBrowserFile(file:File,module:ModuleKey):Promise<ParsedImport>{return file.arrayBuffer().then(b=>parse(XLSX.read(b),module,file.name))}
