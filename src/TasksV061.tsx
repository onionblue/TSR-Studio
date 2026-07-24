import {useState} from 'react';
import type {ModuleKey,Project} from './types';
import type {RDependencyReport} from './env';

export interface AnalysisSettings{maxMissing:number;imputation:'none'|'feature_median'}
const moduleNames:Record<string,string>={core:'基础统计（DESeq2/limma/edgeR）',enrichment:'GO/KEGG/GSEA与物种注释',wgcna:'WGCNA网络分析',integrative:'MOFA2/DIABLO高级整合'};

export function TasksV061({project,run,settings,setSettings}:{project:Project;run:(m:ModuleKey)=>void;settings:AnalysisSettings;setSettings:(x:AnalysisSettings)=>void}){
 const modules:[ModuleKey,string][]=[['chemistry','实测化学成分'],['transcriptomics','转录组'],['proteomics','蛋白组'],['metabolomics','代谢组'],['microbiome','肠道菌群'],['scfa','短链脂肪酸'],['phenotype','药效与生化']];
 const [runtime,setRuntime]=useState<Record<string,unknown>|null>(null),[rDeps,setRDeps]=useState<RDependencyReport|null>(null),[installing,setInstalling]=useState(false),[depMessage,setDepMessage]=useState('');
 async function check(){if(!window.tsrDesktop){setRuntime({提示:'浏览器预览无法检测本机Python/R'});return}const x=await window.tsrDesktop.checkRuntime();setRuntime(x);setRDeps((x.rPackages as RDependencyReport)??await window.tsrDesktop.checkRPackages())}
 async function installR(){if(!window.tsrDesktop)return;const r=await window.tsrDesktop.installRRuntime();if(!r.ok)setRuntime({错误:r.error})}
 async function installPackages(packages:string[]){if(!window.tsrDesktop||!packages.length)return;setInstalling(true);setDepMessage(`正在安装：${packages.join('、')}。首次安装可能需要较长时间，请勿关闭软件。`);const r=await window.tsrDesktop.installRPackages(packages);setRDeps(r);setInstalling(false);setDepMessage(r.ok?`安装完成并已自动复检，新安装 ${r.installedCount??0} 个包。`:`安装未完成：${r.error??r.message??(r.failed||[]).join('、')}`)}
 const missing=rDeps?.packages?.filter(x=>!x.installed).map(x=>x.package)??[];
 return <section>
  <div className="sectionHead"><div><h2>本地分析任务与参数</h2><p>正式分析缺少依赖时阻断，不使用简化算法替代，也不生成伪结果。</p></div><div><button onClick={check}>检测运行环境与R包</button>{window.tsrDesktop?.platform==='darwin'&&<button onClick={installR}>安装/修复macOS R环境</button>}</div></div>
  {runtime&&<div className="qc warning"><b>运行环境概要</b><span>平台：{String(runtime.platform)} / {String(runtime.architecture)}；R包详细状态见下方依赖管理器。</span></div>}
  {rDeps&&<div className="card">
   <div className="sectionHead"><div><h3>R 包依赖管理器</h3><p className="muted">自动检查、只安装缺失项、完成后自动复检。依赖安装到软件用户目录，macOS与Windows无需手工寻找包名。</p></div><button disabled={installing||!missing.length} onClick={()=>installPackages(missing)}>{installing?'正在安装…':missing.length?`一键补齐全部缺包（${missing.length}）`:'全部依赖已就绪'}</button></div>
   {rDeps.ok?<><p className="muted">{rDeps.rVersion}<br/>R：{rDeps.rPath}<br/>用户包库：{rDeps.userLibrary}</p><div className="taskList">{Object.entries(rDeps.modules??{}).map(([id,m])=><div className="task" key={id}><i className={m.ready?'ready':'locked'}/><div><b>{moduleNames[id]??id}</b><span>{m.ready?`已就绪：${m.installed.join('、')}`:`缺少：${m.missing.join('、')}`}</span></div><button disabled={installing||m.ready} onClick={()=>installPackages(m.missing)}>{m.ready?'已安装':'安装缺失包'}</button></div>)}</div></>:<div className="qc warning"><b>R依赖检测失败</b><span>{rDeps.error??rDeps.message}</span></div>}
   {depMessage&&<div className={`qc ${rDeps.ok?'':'warning'}`}><b>安装状态</b><span>{depMessage}</span>{rDeps.logs?.length?<details><summary>查看安装日志</summary><pre style={{whiteSpace:'pre-wrap'}}>{rDeps.logs.join('\n')}</pre></details>:null}</div>}
  </div>}
  <div className="form form2"><label>特征最大缺失率<input type="number" min="0" max="0.9" step="0.05" value={settings.maxMissing} onChange={e=>setSettings({...settings,maxMissing:Math.min(.9,Math.max(0,Number(e.target.value)))})}/></label><label>缺失值策略<select value={settings.imputation} onChange={e=>setSettings({...settings,imputation:e.target.value as AnalysisSettings['imputation']})}><option value="none">不自动填补（推荐）</option><option value="feature_median">特征中位数填补（敏感性分析）</option></select></label></div>
  <p className="muted">蛋白组中位数填补不能自动解决MNAR；转录组仅接受raw counts。</p>
  <div className="taskList">{modules.map(([k,n])=>{const a=project.assets.find(x=>x.module===k),groups=new Set(project.samples.filter(s=>s.included).map(s=>s.group)),mapped=groups.has(project.meta.controlGroup)&&groups.has(project.meta.modelGroup),enabled=!!a&&a.status!=='blocked'&&project.samples.length>=4&&mapped;return <div className="task" key={k}><i className={enabled?'ready':'locked'}/><div><b>{n}数据处理</b><span>{!a?'尚未导入数据':!mapped?'空白组/模型组尚未完成映射':a.status==='blocked'?'数据质控阻断':k==='transcriptomics'?'调用R/DESeq2；TPM/FPKM会被拒绝':k==='proteomics'?'调用R/limma经验贝叶斯模型':enabled?'可运行并记录参数':'样本数不足'}</span></div><button disabled={!enabled} onClick={()=>run(k)}>{enabled?'运行':'未启用'}</button></div>})}</div>
 </section>
}
