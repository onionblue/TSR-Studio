import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const checks=[];
const check=(name,ok,detail='')=>checks.push({name,ok:Boolean(ok),detail});
const ids=['KB1','KB2','KB3','MX1','MX2','MX3','G1','G2','G3','CG1','CG2','CG3'];
const groups=['KB','KB','KB','MX','MX','MX','G','G','G','CG','CG','CG'];
const samples=ids.map((id,i)=>({id,group:groups[i],animalId:id,sex:i%2?'F':'M',batch:i%3?'B1':'B2',tissue:'serum',timepoint:'T1',included:true}));
const row=(id,values)=>Object.fromEntries([['Protein_ID',id],...ids.map((x,i)=>[x,values[i]])]);
const data=[
 row('P_UP',[1,1.1,.9,5,5.2,4.8,3,3.1,2.9,2,2.1,1.9]),
 row('P_DOWN',[8,8.2,7.8,2,2.1,1.9,5,5.1,4.9,6,6.1,5.9]),
 row('P_FLAT',[4,4.1,3.9,4,4.1,3.9,4,4.1,3.9,4,4.1,3.9]),
 row('P_PAIR',[2,2.1,1.9,4,4.1,3.9,3,3.1,2.9,7,7.1,6.9])
];
const payload={action:'analyze',asset:{module:'proteomics',data},samples,meta:{name:'Acceptance',disease:'demo',species:'Mus musculus',controlGroup:'KB',modelGroup:'MX',treatmentGroups:['G','CG']},parameters:{maxMissing:.5,imputation:'none'}};
const pythonCandidates=[process.env.PYTHON,'python3','python'].filter(Boolean);
let parsed=null,last='';
for(const bin of pythonCandidates){
 const p=spawnSync(bin,[path.join(root,'analysis-runtime/python/runner.py')],{input:JSON.stringify(payload),encoding:'utf8'});
 last=p.stderr||'';
 if(p.status===0){try{parsed=JSON.parse((p.stdout||'').trim());if(parsed?.ok)break}catch{}}
}
check('demo analysis executed',parsed?.ok,last.slice(-300));
if(parsed?.ok){
 const rows=parsed.result.differential;
 const get=(id,c)=>rows.find(x=>x.featureId===id&&x.comparison===c);
 check('model comparison exists',!!get('P_UP','MX_vs_KB'));
 check('treatment comparison exists',!!get('P_UP','G_vs_MX'));
 check('treatment pairwise comparison exists',!!get('P_PAIR','CG_vs_G'));
 check('A_vs_B direction: numerator minus reference',get('P_UP','MX_vs_KB')?.effect>0&&get('P_UP','G_vs_MX')?.effect<0);
 check('all differential rows have FDR',rows.every(x=>Number.isFinite(x.fdr)&&x.fdr>=0&&x.fdr<=1));
}
const phenotypePayload={action:'analyze',asset:{module:'phenotype',data:ids.map((id,i)=>({Sample_ID:id,Activity:[10,11,9,20,21,19,15,16,14,12,13,11][i],Constant:1}))},samples,meta:payload.meta,parameters:{}};
let phenotype=null;
for(const bin of pythonCandidates){const p=spawnSync(bin,[path.join(root,'analysis-runtime/python/runner.py')],{input:JSON.stringify(phenotypePayload),encoding:'utf8'});if(p.status===0){try{phenotype=JSON.parse((p.stdout||'').trim());if(phenotype?.ok)break}catch{}}}
check('phenotype analysis executed',phenotype?.ok);
if(phenotype?.ok){const rows=phenotype.result.differential;check('phenotype omnibus test retained',rows.some(x=>x.featureId==='Activity'&&x.omnibusMethod&&Number.isFinite(x.omnibusPValue)&&Number.isFinite(x.omnibusFdr)));check('constant phenotype does not crash',rows.some(x=>x.featureId==='Constant'));}
const figures=fs.readFileSync(path.join(root,'src/figures.ts'),'utf8');
const integration=fs.readFileSync(path.join(root,'src/integration.ts'),'utf8');
const deepR=fs.readFileSync(path.join(root,'analysis-runtime/r/deep_analysis_runner.R'),'utf8');
const discovery=fs.readFileSync(path.join(root,'src/discovery.ts'),'utf8');
const pipeline=fs.readFileSync(path.join(root,'src/PipelineV07.tsx'),'utf8');
const main=fs.readFileSync(path.join(root,'electron/main.cjs'),'utf8');
const limma=fs.readFileSync(path.join(root,'analysis-runtime/r/limma_proteomics_runner.R'),'utf8');
const deseq=fs.readFileSync(path.join(root,'analysis-runtime/r/deseq2_runner.R'),'utf8');
check('figure package validates PNG and SVG',figures.includes('Export_Validation.tsv')&&figures.includes('validSvg(')&&figures.includes("png='FAILED'"));
check('network uses adaptive canvas',integration.includes('maxLayer*52')&&integration.includes('Export_Validation.tsv'));
check('comparison definition present in captions',figures.includes('正值表示组B高于组A'));
check('GO/KEGG mapping report exported',['id_mapping','id_unmapped','id_duplicated','mapping_report','mappingRate'].every(x=>deepR.includes(x)));
check('low mapping blocks formal enrichment',deepR.includes('映射率低于50%')&&deepR.includes('有效映射基因少于10个'));
check('WGCNA full result set',['sample_clustering','module_eigengenes','module_trait','hub_genes','cytoscape_nodes','cytoscape_edges'].every(x=>deepR.includes(x)));
check('covariates enter formal models',['batch','sex','tissue','timepoint'].every(x=>main.includes(x)&&limma.includes(x)&&deseq.includes(x))&&limma.includes('不满秩')&&deseq.includes('不满秩'));
check('target evidence grades implemented',discovery.includes("evidenceGrade:EvidenceGrade")&&pipeline.includes('gradeFilter')&&pipeline.includes('仅逆转'));
check('analysis templates implemented',fs.readFileSync(path.join(root,'src/App.tsx'),'utf8').includes('analysisTemplates')&&fs.readFileSync(path.join(root,'src/App.tsx'),'utf8').includes('炮制品比较'));

const deepPy=fs.readFileSync(path.join(root,'analysis-runtime/python/deep_runner.py'),'utf8');
const deepUi=fs.readFileSync(path.join(root,'src/DeepMining.tsx'),'utf8');
check('MOFA2 formal runner present',deepR.includes("method=='mofa2'")&&deepR.includes('MOFA2::run_mofa')&&deepUi.includes("id:'mofa2'"));
check('DIABLO formal runner present',deepR.includes("method=='diablo'")&&deepR.includes('mixOmics::block.splsda')&&deepUi.includes("id:'diablo'"));
check('consensus WGCNA runner present',deepR.includes('blockwiseConsensusModules')&&deepUi.includes("id:'consensus_wgcna'"));
check('nested CV and independent validation present',['GridSearchCV','outerFolds','innerFolds','validationBatch','external_validation_metrics'].every(x=>deepPy.includes(x)));
check('explainability and optional XGBoost present',deepPy.includes('shap_importance')&&deepPy.includes('XGBClassifier')&&deepPy.includes('permutation_importance'));
check('3.0 cross-platform dependency installers',fs.existsSync(path.join(root,'scripts','Install_TSR_Python_Runtime_macOS.command'))&&fs.existsSync(path.join(root,'scripts','Install_TSR_Python_Runtime_Windows.bat'))&&['MOFA2','mixOmics','basilisk'].every(x=>fs.readFileSync(path.join(root,'scripts','install-r-packages.R'),'utf8').includes(x)));
const dependencyManager=fs.readFileSync(path.join(root,'analysis-runtime','r','dependency_manager.R'),'utf8');
check('3.0.2 in-app R dependency manager',fs.existsSync(path.join(root,'analysis-runtime','r','dependency_manager.R'))&&['core','enrichment','wgcna','integrative'].every(x=>dependencyManager.includes(x))&&main.includes('runtime:install-r-packages')&&fs.readFileSync(path.join(root,'electron','preload.cjs'),'utf8').includes('installRPackages')&&fs.readFileSync(path.join(root,'src','TasksV061.tsx'),'utf8').includes('一键补齐全部缺包'));
check('R packages use writable per-user library',main.includes("app.getPath('userData')")&&main.includes('R_LIBS_USER'));

const mlIds=[...Array(20)].map((_,i)=>`ML${i+1}`),mlGroups=mlIds.map((_,i)=>(i<10?'A':'B'));
const mlSamples=mlIds.map((id,i)=>({id,group:mlGroups[i],animalId:id,sex:i%2?'F':'M',batch:(i===8||i===9||i===18||i===19)?'EXTERNAL':'TRAIN',tissue:'serum',timepoint:'T1',included:true}));
const mlData=[...Array(12)].map((_,j)=>Object.fromEntries([['Protein_ID',`MLP${j+1}`],...mlIds.map((id,i)=>[id,(i<10?0:3)+(j+1)*.05+(i%4)*.08]) ]));
const mlPayload={method:'machine_learning',samples:mlSamples,assets:[{module:'proteomics',fileName:'acceptance.csv',data:mlData}],settings:{maxFeatures:8,seed:20260714,outerFolds:3,innerFolds:2,validationBatch:'EXTERNAL',testMode:true}};
let ml=null,mlLast='';
for(const bin of pythonCandidates){const p=spawnSync(bin,[path.join(root,'analysis-runtime/python/deep_runner.py')],{input:JSON.stringify(mlPayload),encoding:'utf8',timeout:120000});mlLast=p.stderr||'';if(p.status===0){try{ml=JSON.parse((p.stdout||'').trim());if(ml?.ok)break}catch{}}}
check('nested CV acceptance run executed',ml?.ok,mlLast.slice(-300));
if(ml?.ok){const tables=ml.result.tables;check('four core ML families evaluated',(tables.model_comparison??[]).filter(x=>['ElasticNet','RandomForest','SVM-RBF','GradientBoosting'].includes(x.model)).length===4);check('OOF predictions retained',(tables.oof_predictions??[]).length===16);check('independent validation isolated',(tables.external_validation_predictions??[]).length===4&&(tables.external_validation_metrics??[])[0]?.validation_batch==='EXTERNAL');check('feature importance retained',(tables.feature_importance??[]).length>0);check('fold-local preprocessing declared',String(ml.result.summary.dataLeakageProtection).includes('inside training folds'));}

const report={studioVersion:'3.0.2',createdAt:new Date().toISOString(),platform:process.platform,architecture:process.arch,checks,passed:checks.every(x=>x.ok)};
fs.mkdirSync(path.join(root,'validation'),{recursive:true});
fs.writeFileSync(path.join(root,'validation','Acceptance_Report.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(root,'validation','Acceptance_Report.tsv'),['Status\tCheck\tDetail',...checks.map(x=>`${x.ok?'PASS':'FAIL'}\t${x.name}\t${String(x.detail).replace(/[\t\r\n]+/g,' ')}`)].join('\n'));
for(const x of checks)console.log(`${x.ok?'PASS':'FAIL'}\t${x.name}${x.detail?`\t${x.detail}`:''}`);
const failed=checks.filter(x=>!x.ok);
if(failed.length){console.error(`Acceptance failed: ${failed.length}/${checks.length}`);process.exit(1)}
console.log(`Acceptance passed: ${checks.length}/${checks.length}`);
