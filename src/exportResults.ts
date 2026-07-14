import * as XLSX from 'xlsx';import {buildDiscovery} from './discovery';import {publicationGate} from './publication';import type {AnalysisResult,DataAsset,DifferentialRow,Project} from './types';

export function exportResults(project:Project){
 const wb=XLSX.utils.book_new();
 add(wb,'00_说明',[{项目:project.meta.name,导出版本:project.schema,导出时间:new Date().toISOString(),完整性声明:'全量结果保留；重点摘要不替代全量表',严格显著:'BH-FDR < 0.05',探索性候选:'P < 0.05但FDR ≥ 0.05',逆转候选:'模型相对空白发生变化，给药相对模型方向相反；分别报告P与FDR',重要限制:'零值/低丰度驱动结果必须复核，不把未通过FDR结果表述为严格显著'}]);
 add(wb,'01_项目设计',[{...project.meta,treatmentGroups:project.meta.treatmentGroups.join(';')}]);add(wb,'02_样本关系',project.samples);
 const gate=publicationGate(project);add(wb,'03_发表就绪总览',[{状态:gate.status,评分:gate.score,阻断项:gate.blocks,警告项:gate.warnings,通过项:gate.passes,生成时间:gate.generatedAt,声明:'软件检查通过不等同于期刊接收或科学结论确证'}]);add(wb,'04_发表就绪明细',gate.items);
 project.assets.forEach((a,i)=>add(wb,`${10+i}_${short(a.module)}_原始导入`,a.data));
 for(const result of project.results)exportModule(wb,project,result,project.assets.find(a=>a.module===result.module));
 const discovery=buildDiscovery(project);add(wb,'80_候选活性成分',discovery.compounds.map(x=>({...x,flags:x.flags.join('；')})));add(wb,'81_候选活性靶标',discovery.targets.map(x=>({...x,modules:x.modules.join('；'),evidence:x.evidence.join('；')})));add(wb,'82_成分靶标证据对',discovery.pairs.map(x=>({...x,evidence:x.evidence.join('；')})));
 add(wb,'83_分子对接运行',discovery.docking.map(x=>({Run_ID:x.id,成分:x.compoundId,靶标:x.targetId,引擎:x.engine,受体:x.receptor,配体:x.ligand,构象文件:x.poseFile,最佳亲和力:x.scores[0]?.affinity,构象数:x.scores.length,参数:JSON.stringify(x.parameters),状态:x.status,时间:x.createdAt})));
 add(wb,'84_分子对接全部构象',discovery.docking.flatMap(x=>x.scores.map(s=>({Run_ID:x.id,成分:x.compoundId,靶标:x.targetId,...s}))));
 add(wb,'85_动力学运行',discovery.md.map(x=>({Run_ID:x.id,成分:x.compoundId,靶标:x.targetId,引擎:x.engine,拓扑:x.topology,轨迹:x.trajectory,输出目录:x.outputDirectory,曲线:x.series.map(s=>s.name).join('；'),状态:x.status,时间:x.createdAt})));
 add(wb,'86_动力学全部时间序列',discovery.md.flatMap(x=>x.series.flatMap(s=>s.points.map(p=>({Run_ID:x.id,成分:x.compoundId,靶标:x.targetId,指标:s.name,X:p.x,Y:p.y,X单位:s.unitX,Y单位:s.unitY,源文件:s.sourceFile})))));
 add(wb,'87_疾病靶点证据',discovery.diseaseEvidence);add(wb,'88_发现流程限制',discovery.warnings.map(x=>({限制:x,疾病证据更新时间:discovery.diseaseEvidenceUpdatedAt??'未同步'})));
 for(const [i,run] of (project.deepAnalysis?.runs??[]).entries()){
  add(wb,`${90+i*4}_${shortDeep(run.method)}_说明`,[{方法:run.method,状态:run.status,引擎:run.engine,运行时间:run.createdAt,参数:JSON.stringify(run.settings),摘要:JSON.stringify(run.summary),提示:run.messages.join('；')}]);
  Object.entries(run.tables).forEach(([name,rows],j)=>add(wb,`${91+i*4+j}_${shortDeep(run.method)}_${name}`,rows));
 }
 XLSX.writeFile(wb,`${safe(project.meta.name)}_TSR_Studio_Complete_Results.xlsx`);
}
function exportModule(wb:XLSX.WorkBook,project:Project,r:AnalysisResult,asset?:DataAsset){
 const tag=short(r.module),base=30+project.results.indexOf(r)*8,lookup=new Map<string,Record<string,unknown>>();
 const idCandidates=['Gene_ID','Protein_ID','Protein','Feature_ID','Taxon','ASV_ID','ID','id','Name'];const idCol=idCandidates.find(c=>c in (asset?.data[0]??{}))??Object.keys(asset?.data[0]??{})[0];
 for(const row of asset?.data??[])lookup.set(String(row[idCol]),row);
 const enriched=r.differential.map(d=>enrich(d,lookup.get(d.featureId),asset));
 add(wb,`${base}_${tag}_QC`,[flatten({engine:r.engineVersion,status:r.status,createdAt:r.createdAt,...r.qc,messages:r.messages.join('；')})]);
 add(wb,`${base+1}_${tag}_方法参数`,[flatten(r.parameters)]);add(wb,`${base+2}_${tag}_描述统计`,r.summaries);
 add(wb,`${base+3}_${tag}_全部比较`,enriched);add(wb,`${base+4}_${tag}_FDR严格显著`,enriched.filter(x=>Number(x.FDR)<.05));
 add(wb,`${base+5}_${tag}_P值探索候选`,enriched.filter(x=>Number(x.P值)<.05&&Number(x.FDR)>=.05));
 add(wb,`${base+6}_${tag}_方向逆转`,reversals(project,r,lookup,asset));if(r.pca.length)add(wb,`${base+7}_${tag}_PCA源数据`,r.pca);
}
function enrich(d:DifferentialRow,raw?:Record<string,unknown>,asset?:DataAsset){
 const annotations:Record<string,unknown>={};for(const [k,v] of Object.entries(raw??{}))if(!asset?.sampleColumns.includes(k))annotations[k]=v;
 const level=d.fdr<.05?'严格显著(FDR<0.05)':d.pValue<.05?'探索性(P<0.05,FDR未通过)':Math.abs(d.effectSize)>=.8?'大效应趋势':'未达到候选阈值';
 const zeros=raw&&asset?asset.sampleColumns.filter(c=>Number(raw[c])===0).length:0;
 return {Feature_ID:d.featureId,...annotations,比较:d.comparison,比较层级:d.comparisonScope??'primary',均值_A:d.meanA,均值_B:d.meanB,差值_log2FC:d.log2FC,t值:d.t,P值:d.pValue,FDR:d.fdr,Hedges_g:d.effectSize,恢复率:d.recovery,证据等级:level,零值样本数:zeros,质量提示:zeros?'含零值，需检查检出限/缺失机制':'',筛选说明:level==='未达到候选阈值'?'保留在全量表；未进入重点候选表':''};
}
function reversals(project:Project,r:AnalysisResult,lookup:Map<string,Record<string,unknown>>,asset?:DataAsset){
 const by=new Map<string,Map<string,DifferentialRow>>();for(const d of r.differential){if(!by.has(d.featureId))by.set(d.featureId,new Map());by.get(d.featureId)!.set(d.comparison,d)}
 const out:Record<string,unknown>[]=[];for(const [id,m] of by){const model=m.get(`${project.meta.modelGroup}_vs_${project.meta.controlGroup}`);if(!model)continue;for(const treatment of project.meta.treatmentGroups){const tx=m.get(`${treatment}_vs_${project.meta.modelGroup}`);if(!tx)continue;const reverse=model.log2FC*tx.log2FC<0;if(!reverse)continue;const strict=model.fdr<.05&&tx.fdr<.05,explore=model.pValue<.05&&tx.pValue<.05;out.push({Feature_ID:id,...annotation(lookup.get(id),asset),给药组:treatment,模型变化:model.log2FC,模型P值:model.pValue,模型FDR:model.fdr,给药变化:tx.log2FC,给药P值:tx.pValue,给药FDR:tx.fdr,恢复率:tx.recovery,逆转等级:strict?'严格逆转（两阶段FDR<0.05）':explore?'探索性逆转（两阶段P<0.05）':'方向逆转趋势',纳入重点候选:strict||explore?'是':'否'})}}
 return out;
}
function annotation(raw?:Record<string,unknown>,asset?:DataAsset){const x:Record<string,unknown>={};for(const [k,v] of Object.entries(raw??{}))if(!asset?.sampleColumns.includes(k))x[k]=v;return x}
function flatten(x:Record<string,unknown>){return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,typeof v==='object'?JSON.stringify(v):v]))}
function add(wb:XLSX.WorkBook,name:string,rows:object[]){const ws=XLSX.utils.json_to_sheet(rows.length?rows:[{提示:'无符合条件的结果；请查看全量结果表'}]);ws['!autofilter']={ref:ws['!ref']??'A1'};ws['!freeze']={xSplit:0,ySplit:1};ws['!cols']=Array.from({length:Math.min(80,Object.keys(rows[0]??{}).length)},(_,i)=>({wch:i<4?22:16}));XLSX.utils.book_append_sheet(wb,ws,name.slice(0,31))}
const short=(s:string)=>({proteomics:'蛋白组',phenotype:'行为学',metabolomics:'代谢组',microbiome:'菌群',scfa:'短链脂肪酸',chemistry:'化学成分',transcriptomics:'转录组'}[s]??s);
const shortDeep=(s:string)=>({go:'GO',kegg:'KEGG',gsea:'GSEA',wgcna:'WGCNA',correlation:'表型相关',machine_learning:'机器学习',overlap:'集合交叠',multiomics:'跨组学'}[s]??s);
const safe=(s:string)=>s.replace(/[\\/:*?"<>|\s]+/g,'_');
