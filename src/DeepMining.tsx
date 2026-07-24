import {useMemo,useState} from 'react';
import * as XLSX from 'xlsx';
import {exportDeepFigures} from './deepFigures';
import type {DeepAnalysisRun,DeepAnalysisState,DeepMethod,ModuleKey,Project} from './types';

const methodInfo:{id:DeepMethod;name:string;engine:'r'|'python';desc:string}[]=[
 {id:'go',name:'GO富集',engine:'r',desc:'clusterProfiler ORA；报告ID映射率、背景与BH-FDR'},
 {id:'kegg',name:'KEGG富集',engine:'r',desc:'物种专属背景的KEGG过度富集分析'},
 {id:'gsea',name:'GSEA',engine:'r',desc:'使用全量排序分子，不依赖任意差异阈值'},
 {id:'wgcna',name:'WGCNA',engine:'r',desc:'软阈值、模块、模块—性状关联和Hub分子'},
 {id:'consensus_wgcna',name:'共识WGCNA',engine:'r',desc:'在至少两个独立组中识别稳定的共识共表达模块'},
 {id:'mofa2',name:'MOFA2无监督整合',engine:'r',desc:'多组学潜在因子、视图解释率和关键载荷'},
 {id:'diablo',name:'DIABLO监督整合',engine:'r',desc:'mixOmics多数据块判别、交叉验证和特征载荷'},
 {id:'correlation',name:'分子—表型关联',engine:'python',desc:'选择行为/生化指标，Spearman与BH-FDR'},
 {id:'machine_learning',name:'嵌套交叉验证机器学习',engine:'python',desc:'Elastic Net、随机森林、SVM、梯度提升及可选XGBoost；支持独立验证和SHAP'},
 {id:'overlap',name:'Venn/花瓣/UpSet源数据',engine:'python',desc:'比较不同组学和处理的严格显著集合'},
 {id:'multiomics',name:'跨组学相关网络',engine:'python',desc:'共同样本上的跨数据块相关及FDR控制'}
];

export function DeepMining({project,save}:{project:Project;save:(state:DeepAnalysisState)=>void}){
 const comparisons=[...new Set(project.results.flatMap(r=>r.differential.map(d=>d.comparison)))];
 const [modules,setModules]=useState<ModuleKey[]>(project.deepAnalysis?.selectedModules??project.assets.map(a=>a.module));
 const [indicators,setIndicators]=useState<string[]>(project.deepAnalysis?.selectedIndicators??[]);
 const [comparison,setComparison]=useState(project.deepAnalysis?.selectedComparison??comparisons[0]??'');
 const [validationBatch,setValidationBatch]=useState('');
 const [seed,setSeed]=useState(20260714);
 const [outerFolds,setOuterFolds]=useState(5);
 const [innerFolds,setInnerFolds]=useState(3);
 const [factors,setFactors]=useState(10);
 const [components,setComponents]=useState(2);
 const [repeats,setRepeats]=useState(10);
 const [diabloKeepX,setDiabloKeepX]=useState(20);
 const [preservationPermutations,setPreservationPermutations]=useState(50);
 const [busy,setBusy]=useState('');
 const [notice,setNotice]=useState('');
 const runs=project.deepAnalysis?.runs??[];
 const traits=useMemo(()=>{const a=project.assets.find(x=>x.module==='phenotype'),first=a?.data[0]??{};return Object.keys(first).filter(k=>!['Sample_ID','sample_id','Sample','Group','group'].includes(k)&&a?.data.some(r=>Number.isFinite(Number(r[k]))))},[project.assets]);
 const batches=[...new Set(project.samples.map(s=>s.batch).filter(Boolean))];
 const included=project.samples.filter(s=>s.included);
 const groupSizes=Object.fromEntries([...new Set(included.map(s=>s.group))].map(g=>[g,included.filter(s=>s.group===g).length]));
 const toggle=<T,>(x:T,list:T[],set:(v:T[])=>void)=>set(list.includes(x)?list.filter(v=>v!==x):[...list,x]);

 function blocked(m:DeepMethod){
  if(m==='wgcna'&&included.length<15)return '独立样本少于15个';
  if(m==='consensus_wgcna'&&Object.values(groupSizes).filter(n=>n>=10).length<2)return '至少需要两个组且每组不少于10个样本';
  if((m==='mofa2'||m==='diablo')&&modules.filter(x=>!['phenotype','chemistry'].includes(x)).length<2)return '至少选择两个定量组学';
  if(m==='diablo'&&Math.min(...Object.values(groupSizes))<5)return '每组至少需要5个独立样本';
  if(m==='machine_learning'&&Math.min(...Object.values(groupSizes))<5)return '训练集中每组至少需要5个独立样本';
  return '';
 }

 async function run(m:DeepMethod){
  if(!window.tsrDesktop)return setNotice('深度分析仅在桌面版调用正式R/Python运行时');
  const info=methodInfo.find(x=>x.id===m)!;
  if(!modules.length)return setNotice('请至少选择一个参与分析的组学模块');
  const reason=blocked(m);if(reason)return setNotice(`${info.name}已阻止：${reason}`);
  setBusy(m);setNotice(`${info.name}正在运行…`);const started=Date.now();
  const chosenAssets=project.assets.filter(a=>modules.includes(a.module));
  const chosenResults=project.results.filter(r=>modules.includes(r.module));
  const settings={modules,indicators,comparison,fdr:.05,maxFeatures:1000,permutations:100,seed,outerFolds,innerFolds,validationBatch,factors,components,repeats,diabloKeepX,preservationPermutations,softwareVersion:'3.0.2'};
  const payload={method:m,meta:project.meta,samples:project.samples,assets:chosenAssets,asset:chosenAssets.find(a=>['transcriptomics','proteomics'].includes(a.module)),results:m==='go'||m==='kegg'||m==='gsea'?chosenResults.flatMap(r=>r.differential.filter(d=>!comparison||d.comparison===comparison).map(d=>({...d,module:r.module}))):chosenResults,settings};
  const response=info.engine==='r'?await window.tsrDesktop.runDeepR(payload):await window.tsrDesktop.runDeepPython(payload);
  setBusy('');
  if(!response.ok||!response.result)return setNotice(`${info.name}未执行：${response.error??'运行时不可用'}。未生成、未保存任何伪结果。${response.logs?.filter(Boolean).join('；')}`);
  const result=response.result as DeepAnalysisRun;
  result.settings={...settings,durationMs:Date.now()-started,inputAssets:chosenAssets.map(a=>({module:a.module,fileName:a.fileName,rows:a.data.length})),includedSamples:included.length,groupSizes};
  result.summary={...result.summary,softwareVersion:'3.0.2',randomSeed:seed,durationMs:Date.now()-started};
  save({selectedModules:modules,selectedIndicators:indicators,selectedComparison:comparison,runs:[...runs.filter(x=>!(x.method===m&&String(x.settings.comparison??'')===comparison)),result]});
  setNotice(`${info.name}完成：${Object.values(result.tables).reduce((n,x)=>n+x.length,0)}条结果已保存`);
 }

 function exportExcel(){const wb=XLSX.utils.book_new();for(const r of runs){XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{方法:r.method,引擎:r.engine,状态:r.status,时间:r.createdAt,...r.summary,参数:JSON.stringify(r.settings),提示:r.messages.join('；')}]),safe(`${r.method}_说明`).slice(0,31));for(const [name,rows] of Object.entries(r.tables))XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),safe(`${r.method}_${name}`).slice(0,31))}XLSX.writeFile(wb,`${safe(project.meta.name)}_TSR_Studio_3.0.2_Deep_Mining.xlsx`)}

 return <>
  <section><div className="sectionHead"><div><h2>深度生物信息学与机器学习 3.0</h2><p>正式任务保存输入、参数、随机种子、运行时间、全量结果和限制；条件不足时停止，不生成伪结果。</p></div><button disabled={!runs.length} onClick={exportExcel}>导出深度分析Excel</button><button disabled={!runs.length} onClick={()=>exportDeepFigures(project)}>导出深度论文图包</button></div>{notice&&<div className="notice">{notice}</div>}
   <h3>1. 参与分析的组学</h3><div className="checkGrid">{project.assets.map(a=><label key={`${a.module}-${a.fileName}`}><input type="checkbox" checked={modules.includes(a.module)} onChange={()=>toggle(a.module,modules,setModules)}/>{a.module} · {a.fileName}</label>)}</div>
   <h3>2. 比较与表型</h3><label>富集比较<select value={comparison} onChange={e=>setComparison(e.target.value)}>{comparisons.map(c=><option key={c} value={c}>{c}</option>)}</select></label><div className="checkGrid">{traits.map(x=><label key={x}><input type="checkbox" checked={indicators.includes(x)} onChange={()=>toggle(x,indicators,setIndicators)}/>{x}</label>)}</div>
   <h3>3. 高级验证参数</h3><div className="formGrid"><label>随机种子<input type="number" value={seed} onChange={e=>setSeed(Number(e.target.value))}/></label><label>外层交叉验证折数<input type="number" min="3" max="10" value={outerFolds} onChange={e=>setOuterFolds(Number(e.target.value))}/></label><label>内层调参折数<input type="number" min="2" max="10" value={innerFolds} onChange={e=>setInnerFolds(Number(e.target.value))}/></label><label>独立验证批次<select value={validationBatch} onChange={e=>setValidationBatch(e.target.value)}><option value="">不设置</option>{batches.map(x=><option key={x} value={x}>{x}</option>)}</select></label><label>MOFA2因子数<input type="number" min="2" max="30" value={factors} onChange={e=>setFactors(Number(e.target.value))}/></label><label>DIABLO成分数<input type="number" min="1" max="3" value={components} onChange={e=>setComponents(Number(e.target.value))}/></label><label>DIABLO每组学/成分保留特征<input type="number" min="5" max="200" value={diabloKeepX} onChange={e=>setDiabloKeepX(Number(e.target.value))}/></label><label>DIABLO重复交叉验证次数<input type="number" min="3" max="100" value={repeats} onChange={e=>setRepeats(Number(e.target.value))}/></label><label>模块保留置换次数<input type="number" min="20" max="1000" value={preservationPermutations} onChange={e=>setPreservationPermutations(Number(e.target.value))}/></label></div>
  </section>
  <section><h2>4. 正式分析方法</h2><div className="methodGrid">{methodInfo.map(m=>{const old=runs.find(x=>x.method===m.id),reason=blocked(m.id);return <article key={m.id}><h3>{m.name}</h3><p>{m.desc}</p><small>{reason?`阻断：${reason}`:old?`${old.status} · ${old.engine}`:`调用${m.engine==='r'?'R/Bioconductor':'Python/scikit-learn'}`}</small><button disabled={!!busy||!!reason} onClick={()=>run(m.id)}>{busy===m.id?'运行中…':old?'重新运行':'运行'}</button></article>})}</div></section>
  {runs.length>0&&<section><h2>5. 已保存结果与审计</h2><table><thead><tr><th>方法</th><th>状态</th><th>引擎</th><th>结果表</th><th>耗时</th><th>提示</th></tr></thead><tbody>{runs.map(r=><tr key={r.id}><td>{methodInfo.find(x=>x.id===r.method)?.name??r.method}</td><td>{r.status}</td><td>{r.engine}</td><td>{Object.entries(r.tables).map(([k,v])=>`${k}:${v.length}`).join('；')}</td><td>{Math.round(Number(r.settings.durationMs??0)/1000)} s</td><td>{r.messages.join('；')||'—'}</td></tr>)}</tbody></table></section>}
 </>;
}

function safe(s:string){return String(s).replace(/[^A-Za-z0-9\u4e00-\u9fa5_.-]+/g,'_')}
