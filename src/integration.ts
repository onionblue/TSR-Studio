import JSZip from 'jszip';import type {AnalysisResult,DataAsset,DifferentialRow,Project} from './types';
interface Node{id:string;label:string;type:'treatment'|'feature'|'pathway'|'phenotype';module:string;evidence:string;score:number}
interface Edge{source:string;target:string;relation:string;direction:string;evidenceLevel:string;sourceDetail:string;pValue?:number;fdr?:number;effect?:number}
export interface IntegrationOptions{featureCount:10|20|24|30|50;pathwayCount:5|10|15|20|30;treatment:string;evidence:'pvalue'|'fdr'}
const defaultOptions:IntegrationOptions={featureCount:24,pathwayCount:15,treatment:'all',evidence:'pvalue'};
const W=1800,MIN_H=1100,colors={treatment:'#7B3294',feature:'#008837',pathway:'#E66101',phenotype:'#0571B0'};
export async function exportIntegrationPackage(project:Project,options:IntegrationOptions=defaultOptions){
 const {nodes,edges,warnings}=buildIntegratedNetwork(project);
 if(!edges.length)throw new Error('尚无满足条件的跨层调控关系；至少需要模型对照和一个给药比较');
 const shown=selectForFigure(nodes,edges,options);
 if(!shown.edges.length)throw new Error('当前网络筛选条件下没有可显示的关系，请放宽FDR条件或选择其他给药组');
 const figure=networkSvg(shown.nodes,shown.edges),zip=new JSZip();
 zip.file('SVG/MultiOmics_Upstream_Downstream.svg',figure.svg);
 zip.file('Source_Data/All_Nodes.tsv',tsv(nodes));zip.file('Source_Data/All_Edges.tsv',tsv(edges));
 zip.file('Source_Data/Figure_Nodes.tsv',tsv(shown.nodes));zip.file('Source_Data/Figure_Edges.tsv',tsv(shown.edges));
 zip.file('Source_Data/Plot_Parameters.tsv',tsv([{Treatment:options.treatment,Feature_count:options.featureCount,Pathway_count:options.pathwayCount,Evidence:options.evidence,Studio_version:'3.0.2'}]));
 zip.file('Figure_Legend_图注.txt',caption(project,shown.nodes,shown.edges,warnings));
 let pngStatus='OK',pngMessage='';
 try{zip.file('PNG_600dpi/MultiOmics_Upstream_Downstream.png',await svgPng(figure.svg,figure.width,figure.height,3.34))}
 catch(e){pngStatus='FAILED';pngMessage=e instanceof Error?e.message:String(e)}
 const svgStatus=figure.svg.includes(`viewBox="0 0 ${figure.width} ${figure.height}"`)&&figure.svg.trimEnd().endsWith('</svg>')?'OK':'FAILED';
 zip.file('Export_Validation.tsv',tsv([{Figure:'MultiOmics_Upstream_Downstream',SVG:svgStatus,PNG:pngStatus,Nodes:shown.nodes.length,Edges:shown.edges.length,Width:figure.width,Height:figure.height,Message:pngMessage}]));
 if(svgStatus!=='OK'||pngStatus!=='OK')zip.file('导出警告.txt',`网络图导出校验：SVG=${svgStatus}；PNG=${pngStatus}；${pngMessage}\nSVG为正式可编辑图，请优先核对SVG。`);
 zip.file('README.txt','TSR Studio 3.0.2 multi-omics integration package\n全量节点和边保存在Source_Data。论文主图按用户选择的分子数、通路数、给药组和证据阈值生成；筛选不会删除全量结果。Export_Validation.tsv记录画布、节点、边和PNG导出状态。');
 download(await zip.generateAsync({type:'blob'}),`${safe(project.meta.name)}_TSR_Studio_3.0.2_Integration.zip`)
}
export function buildIntegratedNetwork(project:Project){const nodes=new Map<string,Node>(),edges:Edge[]=[],warnings:string[]=[];const labels=new Map<string,Set<string>>();
 for(const r of project.results)for(const d of r.differential){const key=norm(d.label||d.featureId);if(!labels.has(key))labels.set(key,new Set());labels.get(key)!.add(r.module)}
 for(const r of project.results){const asset=project.assets.find(a=>a.module===r.module),lookup=assetLookup(asset),model=`${project.meta.modelGroup}_vs_${project.meta.controlGroup}`,base=new Map(r.differential.filter(d=>d.comparison===model).map(d=>[d.featureId,d]));
  for(const treatment of project.meta.treatmentGroups){const tx=r.differential.filter(d=>d.comparison===`${treatment}_vs_${project.meta.modelGroup}`);if(!tx.length)continue;put(nodes,{id:`T:${treatment}`,label:treatment,type:'treatment',module:'design',evidence:'研究设计',score:10});
   for(const d of tx){const m=base.get(d.featureId);if(!m||m.log2FC*d.log2FC>=0||m.pValue>=.05||d.pValue>=.05)continue;const label=d.label||d.featureId,fid=`F:${r.module}:${d.featureId}`,cross=(labels.get(norm(label))?.size??0)>1,level=(m.fdr<.05&&d.fdr<.05)?'本研究直接证据（两阶段FDR）':cross?'跨组学一致＋本研究探索性':'本研究探索性（两阶段P值）',score=-Math.log10(Math.max(m.pValue*d.pValue,1e-20));put(nodes,{id:fid,label,type:'feature',module:r.module,evidence:level,score});edges.push({source:`T:${treatment}`,target:fid,relation:'模型异常的反向调节',direction:d.log2FC>0?'上调':'下调',evidenceLevel:level,sourceDetail:`${model}; ${treatment}_vs_${project.meta.modelGroup}`,pValue:d.pValue,fdr:d.fdr,effect:d.log2FC});
    const raw=lookup.get(d.featureId);for(const path of pathways(raw).slice(0,8)){const pid=`P:${path}`;put(nodes,{id:pid,label:path,type:'pathway',module:'annotation',evidence:'数据库/原文件功能注释',score:2});edges.push({source:fid,target:pid,relation:'功能注释关联',direction:'已知注释；非本研究因果方向',evidenceLevel:'数据库/原文件注释',sourceDetail:'GO_Description/KO_Description/KOGs_Function_Description'})}
   }
  }
 }
 if(!project.results.some(r=>r.module==='transcriptomics'))warnings.push('未提供转录组：不推断TF—mRNA层');if(!project.results.some(r=>r.module==='metabolomics'))warnings.push('未提供代谢组：不构造代谢物—酶反应层');if(!project.results.some(r=>r.module==='microbiome'))warnings.push('未提供菌群：不构造菌群—代谢物层');if(!project.results.some(r=>r.module==='scfa'))warnings.push('未提供SCFA：不构造短链脂肪酸层');warnings.push('行为学与蛋白组缺少统一动物编号时，不计算逐动物分子—表型相关边');return {nodes:[...nodes.values()],edges,warnings};
}
function selectForFigure(nodes:Node[],edges:Edge[],options:IntegrationOptions){
 const tx=edges.filter(e=>e.relation==='模型异常的反向调节'&&(options.treatment==='all'||e.source===`T:${options.treatment}`)&&(options.evidence==='pvalue'||e.evidenceLevel.includes('FDR'))).sort((a,b)=>score(b)-score(a)).slice(0,options.featureCount),features=new Set(tx.map(e=>e.target));
 const available=edges.filter(e=>features.has(e.source)&&e.relation==='功能注释关联'),degree=new Map<string,number>();available.forEach(e=>degree.set(e.target,(degree.get(e.target)??0)+1));
 const pathways=new Set([...degree].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,options.pathwayCount).map(x=>x[0])),anno=available.filter(e=>pathways.has(e.target)),all=[...tx,...anno],ids=new Set(all.flatMap(e=>[e.source,e.target]));
 return {nodes:nodes.filter(n=>ids.has(n.id)),edges:all}
}
function networkSvg(nodes:Node[],edges:Edge[]){
 const layers:{[k:string]:Node[]}={treatment:[],feature:[],pathway:[],phenotype:[]};nodes.forEach(n=>layers[n.type].push(n));
 const maxLayer=Math.max(1,...Object.values(layers).map(x=>x.length)),height=Math.max(MIN_H,180+maxLayer*52),xpos={treatment:170,feature:700,pathway:1370,phenotype:1650},pos=new Map<string,{x:number,y:number}>();
 for(const [type,list] of Object.entries(layers)){list.sort((a,b)=>b.score-a.score);list.forEach((n,i)=>pos.set(n.id,{x:xpos[type as keyof typeof xpos],y:110+(i+1)*(height-210)/(list.length+1)}))}
 let body='<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#777"/></marker></defs>';
 for(const e of edges){const a=pos.get(e.source),b=pos.get(e.target);if(!a||!b)continue;body+=`<path d="M${a.x+145},${a.y} C${(a.x+b.x)/2},${a.y} ${(a.x+b.x)/2},${b.y} ${b.x-175},${b.y}" fill="none" stroke="${e.evidenceLevel.includes('FDR')?'#333':'#B5B5B5'}" stroke-opacity=".72" stroke-width="${e.evidenceLevel.includes('FDR')?2.6:1.1}" marker-end="url(#arrow)"/>`}
 for(const n of nodes){const p=pos.get(n.id)!,path=n.type==='pathway',w=path?350:290,x=p.x-w/2;body+=`<rect x="${x}" y="${p.y-19}" width="${w}" height="38" rx="6" fill="${colors[n.type]}" fill-opacity=".94"/><text x="${p.x}" y="${p.y+5}" text-anchor="middle" font-size="${path?12.5:13.5}" fill="white">${esc(trim(n.label,path?46:32))}</text>`}
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}"><rect width="100%" height="100%" fill="white"/><style>text{font-family:Arial,'Noto Sans CJK SC',sans-serif}</style><text x="70" y="48" font-size="30" font-weight="700">多组学上下游调控候选网络</text><text x="170" y="86" text-anchor="middle" font-size="19">干预</text><text x="700" y="86" text-anchor="middle" font-size="19">差异/逆转分子</text><text x="1370" y="86" text-anchor="middle" font-size="19">功能与通路（Top ${layers.pathway.length}）</text>${body}</svg>`;
 return {svg,width:W,height}
}
function caption(project:Project,n:Node[],e:Edge[],w:string[]){return `图：${project.meta.name}多组学上下游调控候选网络。左侧为干预组，中间为在模型中异常且经给药反向调节的分子，右侧为原数据所附GO/KO/KOG功能注释。粗深色边表示两阶段比较均达到FDR<0.05；细灰边表示探索性证据或数据库注释。主图为保证可读性仅显示得分最高的${n.length}个节点和${e.length}条边；完整网络见All_Nodes.tsv和All_Edges.tsv。本图表示证据支持的候选调控链，不证明因果关系。\n\n数据限制：${w.join('；')}。`}
function assetLookup(a?:DataAsset){const m=new Map<string,Record<string,unknown>>();if(!a)return m;const ids=['Gene_ID','Protein_ID','Protein','Feature_ID','ID','Name'],id=ids.find(x=>x in (a.data[0]??{}))??Object.keys(a.data[0]??{})[0];a.data.forEach(r=>m.set(String(r[id]),r));return m}
function pathways(r?:Record<string,unknown>){const keys=['GO_Description','KO_Description','KOGs_Function_Description','KOGs_Class_Description'],out:string[]=[];for(const k of keys){const v=String(r?.[k]??'');for(const x of v.split(/[;|]+/).map(x=>x.trim()).filter(x=>x&&x.toLowerCase()!=='nan'))if(!out.includes(x))out.push(x)}return out}
function put(m:Map<string,Node>,n:Node){const old=m.get(n.id);if(!old||n.score>old.score)m.set(n.id,n)}const score=(e:Edge)=>-Math.log10(Math.max((e.pValue??1)*(e.fdr??1),1e-20));
function tsv(rows:object[]){if(!rows.length)return '';const k=[...new Set(rows.flatMap(r=>Object.keys(r)))];return [k.join('\t'),...rows.map(r=>k.map(x=>String((r as Record<string,unknown>)[x]??'').replace(/[\t\r\n]+/g,' ')).join('\t'))].join('\n')}
function svgPng(svg:string,w:number,h:number,s:number):Promise<Blob>{return new Promise((ok,no)=>{const img=new Image(),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));img.onload=()=>{const c=document.createElement('canvas');c.width=Math.round(w*s);c.height=Math.round(h*s);const x=c.getContext('2d');if(!x)return no(new Error('Canvas不可用'));x.drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);c.toBlob(b=>b?ok(b):no(new Error('PNG失败')),'image/png')};img.onerror=no;img.src=url})}
function download(b:Blob,n:string){const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
const norm=(s:string)=>s.trim().toUpperCase(),trim=(s:string,n:number)=>s.length>n?s.slice(0,n-1)+'…':s,esc=(s:string)=>s.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[m]!)),safe=(s:string)=>s.replace(/[^A-Za-z0-9\u4e00-\u9fa5_.-]+/g,'_');
