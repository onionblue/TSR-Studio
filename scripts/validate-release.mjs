import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=(name)=>fs.readFileSync(path.join(root,name),'utf8');
const pkg=JSON.parse(read('package.json'));
const checks=[];
const check=(name,ok,detail='')=>checks.push({name,ok:Boolean(ok),detail});

check('package version',pkg.version==='3.0.2',pkg.version);
check('application author',String(pkg.author).includes('河北中医药大学药学院 张丹'),String(pkg.author));
check('AppleDouble exclusion',JSON.stringify(pkg.build?.extraResources).includes('._*'));
check('compiled index',fs.existsSync(path.join(root,'dist','index.html')));
check('UI version',read('src/App.tsx').includes('V3.0.2'));
check('figure validation manifest',read('src/figures.ts').includes('Export_Validation.tsv'));
check('network validation manifest',read('src/integration.ts').includes('Export_Validation.tsv'));
check('adaptive network canvas',read('src/integration.ts').includes('maxLayer*52'));
check('heatmap continuous legend',read('src/figures.ts').includes('heatLegend'));
check('complete R dependency set',['jsonlite','WGCNA','clusterProfiler','org.Mm.eg.db','org.Rn.eg.db','org.Hs.eg.db'].every(x=>read('scripts/install-r-packages.R').includes(x)));
check('in-app dependency manager packaged',read('analysis-runtime/r/dependency_manager.R').includes('status_table')&&read('electron/main.cjs').includes('runtime:install-r-packages')&&read('src/TasksV061.tsx').includes('R 包依赖管理器'));
check('macOS staged builder',read('Build-TSR-Studio-macOS.command').includes('mktemp -d')&&read('Build-TSR-Studio-macOS.command').includes("--exclude '._*'"));
check('Windows builder',read('Build-TSR-Studio-Windows.bat').includes('electron-builder --win nsis portable'));
check('Windows R installer',fs.existsSync(path.join(root,'scripts','Install_TSR_R_Runtime_Windows.bat'))&&read('scripts/deploy-r-windows.ps1').includes('clusterProfiler'));
check('end-to-end acceptance test',fs.existsSync(path.join(root,'scripts','acceptance-test.mjs'))&&pkg.scripts?.verify?.includes('test:acceptance'));
check('GO KEGG mapping audit',['id_mapping','id_unmapped','id_duplicated','mapping_report','mappingRate'].every(x=>read('analysis-runtime/r/deep_analysis_runner.R').includes(x)));
check('comparison direction definition',read('src/figures.ts').includes('组B − 组A')&&read('analysis-runtime/python/runner.py').includes("effect':float(np.mean(b)-np.mean(a))"));
check('acceptance report generated',fs.existsSync(path.join(root,'validation','Acceptance_Report.json')));
check('3.0 integrative methods',['MOFA2::run_mofa','mixOmics::block.splsda','blockwiseConsensusModules'].every(x=>read('analysis-runtime/r/deep_analysis_runner.R').includes(x)));
check('3.0 nested validation',['GridSearchCV','outerFolds','innerFolds','external_validation_metrics','shap_importance'].every(x=>read('analysis-runtime/python/deep_runner.py').includes(x)));
check('Python setup helpers',fs.existsSync(path.join(root,'scripts','Install_TSR_Python_Runtime_macOS.command'))&&fs.existsSync(path.join(root,'scripts','Install_TSR_Python_Runtime_Windows.bat')));

for(const item of checks)console.log(`${item.ok?'PASS':'FAIL'}\t${item.name}${item.detail?`\t${item.detail}`:''}`);
const failed=checks.filter(x=>!x.ok);
if(failed.length){console.error(`Release validation failed: ${failed.length} check(s)`);process.exit(1)}
console.log(`Release validation passed: ${checks.length} checks`);
