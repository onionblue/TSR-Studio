import sys,json,traceback,math
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.model_selection import StratifiedKFold,GridSearchCV,permutation_test_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler,label_binarize
from sklearn.impute import SimpleImputer
from sklearn.feature_selection import SelectKBest,f_classif
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier,HistGradientBoostingClassifier
from sklearn.svm import SVC
from sklearn.metrics import balanced_accuracy_score,roc_auc_score,average_precision_score,confusion_matrix,f1_score,precision_score,recall_score,brier_score_loss
from sklearn.inspection import permutation_importance

def finite(x):
    if isinstance(x,dict): return {k:finite(v) for k,v in x.items()}
    if isinstance(x,list): return [finite(v) for v in x]
    if isinstance(x,(np.integer,)): return int(x)
    if isinstance(x,(np.floating,float)): return float(x) if np.isfinite(x) else None
    return x
def bh(p):
    p=np.asarray([v if np.isfinite(v) else 1 for v in p],float); order=np.argsort(p); out=np.ones(len(p)); last=1
    for i in range(len(p)-1,-1,-1): last=min(last,p[order[i]]*len(p)/(i+1));out[order[i]]=last
    return out
def sample_map(payload): return {str(s['id']):s for s in payload.get('samples',[]) if s.get('included',True)}
def matrix(asset,smap,max_features=500,impute=True):
    data=pd.DataFrame(asset.get('data',[])); cols=[c for c in data.columns if c in smap]
    if len(cols)<4:return None,None,None
    ids=next((c for c in ['Gene_ID','Protein_ID','Protein','Feature_ID','Taxon','ASV_ID','ID','Name'] if c in data.columns),data.columns[0])
    x=data[cols].apply(pd.to_numeric,errors='coerce').T
    x=x.loc[:,x.notna().mean()>=.5]
    if impute:x=x.fillna(x.median())
    if max_features and x.shape[1]>max_features:x=x.loc[:,x.var().sort_values(ascending=False).head(max_features).index]
    x.columns=[f"{asset.get('module')}::{str(v)}" for v in data.loc[x.columns,ids]] if all(isinstance(v,(int,np.integer)) for v in x.columns) else [f"{asset.get('module')}::{c}" for c in x.columns]
    return x,cols,ids
def machine_learning(payload):
    smap=sample_map(payload);settings=payload.get('settings',{});blocks=[]
    for a in payload.get('assets',[]):
        x,_,_=matrix(a,smap,None,False)
        if x is not None:blocks.append(x)
    if not blocks:raise ValueError('没有可用于机器学习的矩阵数据')
    shared=sorted(set.intersection(*[set(x.index) for x in blocks]));X=pd.concat([x.loc[shared] for x in blocks],axis=1);y=np.array([smap[s]['group'] for s in shared]);seed=int(settings.get('seed',20260714));validation_batch=str(settings.get('validationBatch','')).strip()
    external=np.array([bool(validation_batch) and str(smap[s].get('batch',''))==validation_batch for s in shared]);train_mask=~external
    if external.any() and len(set(y[external]))<2:raise ValueError('独立验证批次必须至少包含两个结局组')
    Xtrain=X.iloc[train_mask];ytrain=y[train_mask];counts=pd.Series(ytrain).value_counts();classes=sorted(counts.index)
    if len(counts)<2 or counts.min()<5:raise ValueError('嵌套交叉验证要求训练集中至少2组且每组至少5个独立样本')
    outer_n=min(int(settings.get('outerFolds',5)),int(counts.min()));inner_n=min(int(settings.get('innerFolds',3)),int(counts.min())-1)
    if outer_n<3 or inner_n<2:raise ValueError('样本量不足以建立至少3折外层和2折内层交叉验证')
    outer=StratifiedKFold(outer_n,shuffle=True,random_state=seed)
    test_mode=bool(settings.get('testMode',False));trees=40 if test_mode else 500;boost_trees=40 if test_mode else 300;k=min(int(settings.get('maxFeatures',1000)),Xtrain.shape[1]);prep=[('impute',SimpleImputer(strategy='median')),('select',SelectKBest(f_classif,k=k))]
    small=[1] if test_mode else [.1,1,10]
    specs={
      'ElasticNet':(Pipeline(prep+[('scale',StandardScaler()),('model',LogisticRegression(penalty='elasticnet',solver='saga',max_iter=8000,class_weight='balanced',random_state=seed))]),{'model__C':small,'model__l1_ratio':[.5] if test_mode else [.1,.5,.9]}),
      'RandomForest':(Pipeline(prep+[('model',RandomForestClassifier(n_estimators=trees,class_weight='balanced',random_state=seed,n_jobs=1))]),{'model__max_features':['sqrt'],'model__min_samples_leaf':[1] if test_mode else [1,2,4]}),
      'SVM-RBF':(Pipeline(prep+[('scale',StandardScaler()),('model',SVC(probability=True,class_weight='balanced',random_state=seed))]),{'model__C':small,'model__gamma':['scale'] if test_mode else ['scale',.01,.1]}),
      'GradientBoosting':(Pipeline(prep+[('model',HistGradientBoostingClassifier(random_state=seed))]),{'model__learning_rate':[.1] if test_mode else [.03,.1],'model__max_leaf_nodes':[7] if test_mode else [7,15,31],'model__l2_regularization':[0] if test_mode else [0,1]})}
    try:
        from xgboost import XGBClassifier
        specs['XGBoost']=(Pipeline(prep+[('model',XGBClassifier(n_estimators=boost_trees,eval_metric='logloss',random_state=seed,n_jobs=1))]),{'model__max_depth':[2] if test_mode else [2,4],'model__learning_rate':[.1] if test_mode else [.03,.1],'model__subsample':[1] if test_mode else [.7,1]})
    except Exception: pass
    scores=[];oof_tables={};fitted={}
    for name,(base,grid) in specs.items():
        pred=np.empty(len(ytrain),dtype=object);proba=np.zeros((len(ytrain),len(classes)));fold_rows=[]
        for fold,(tr,te) in enumerate(outer.split(Xtrain,ytrain),1):
            inner=StratifiedKFold(inner_n,shuffle=True,random_state=seed+fold);search=GridSearchCV(base,grid,cv=inner,scoring='balanced_accuracy',n_jobs=1,refit=True);search.fit(Xtrain.iloc[tr],ytrain[tr]);pred[te]=search.predict(Xtrain.iloc[te]);proba[te]=search.predict_proba(Xtrain.iloc[te]);fold_rows.append({'model':name,'fold':fold,'train_n':len(tr),'test_n':len(te),'best_params':json.dumps(search.best_params_,ensure_ascii=False),'inner_score':search.best_score_})
        bal=balanced_accuracy_score(ytrain,pred);f1=f1_score(ytrain,pred,average='macro');precision=precision_score(ytrain,pred,average='macro',zero_division=0);recall=recall_score(ytrain,pred,average='macro',zero_division=0)
        try:auc=roc_auc_score(ytrain,proba[:,1]) if len(classes)==2 else roc_auc_score(label_binarize(ytrain,classes=classes),proba,multi_class='ovr',average='macro')
        except Exception:auc=None
        try:pr=average_precision_score((ytrain==classes[1]).astype(int),proba[:,1]) if len(classes)==2 else average_precision_score(label_binarize(ytrain,classes=classes),proba,average='macro')
        except Exception:pr=None
        row={'model':name,'balanced_accuracy':bal,'macro_f1':f1,'macro_precision':precision,'macro_recall':recall,'roc_auc':auc,'pr_auc':pr,'outer_folds':outer_n,'inner_folds':inner_n,'training_n':len(ytrain),'features':X.shape[1]};scores.append(row)
        oof_tables[name]=[{'sample':Xtrain.index[i],'actual':ytrain[i],'predicted':pred[i],**{f'probability_{c}':proba[i,j] for j,c in enumerate(classes)}} for i in range(len(ytrain))]
        final=GridSearchCV(base,grid,cv=StratifiedKFold(inner_n,shuffle=True,random_state=seed),scoring='balanced_accuracy',n_jobs=1,refit=True);final.fit(Xtrain,ytrain);fitted[name]=(final.best_estimator_,fold_rows,final.best_params_)
    best_name=max(scores,key=lambda z:z['balanced_accuracy'])['model'];model,fold_rows,best_params=fitted[best_name];pred=np.array([r['predicted'] for r in oof_tables[best_name]]);cm=confusion_matrix(ytrain,pred,labels=classes);conf=[{'actual':a,'predicted':b,'count':int(cm[i,j])} for i,a in enumerate(classes) for j,b in enumerate(classes)]
    perm=permutation_importance(model,Xtrain,ytrain,scoring='balanced_accuracy',n_repeats=3 if test_mode else 20,random_state=seed,n_jobs=1);imp=np.asarray(perm.importances_mean);importance=[{'feature':X.columns[i],'importance':float(imp[i]),'stability_sd':float(perm.importances_std[i])} for i in np.argsort(imp)[::-1][:100]]
    external_rows=[];external_metrics=[]
    if external.any():
        Xe=X.iloc[external];ye=y[external];ep=model.predict(Xe);eproba=model.predict_proba(Xe);external_metrics=[{'model':best_name,'n':len(ye),'balanced_accuracy':balanced_accuracy_score(ye,ep),'macro_f1':f1_score(ye,ep,average='macro'),'roc_auc':roc_auc_score(ye,eproba[:,1]) if len(classes)==2 else None,'validation_batch':validation_batch}];external_rows=[{'sample':Xe.index[i],'actual':ye[i],'predicted':ep[i],**{f'probability_{c}':eproba[i,j] for j,c in enumerate(classes)}} for i in range(len(ye))]
    shap_rows=[];messages=[]
    try:
        import shap
        core=model.named_steps.get('model') if hasattr(model,'named_steps') else model;Xs=Xtrain;selected_names=np.asarray(X.columns)
        if hasattr(model,'named_steps'):
            for step_name,step in model.steps[:-1]:
                Xs=step.transform(Xs)
                if step_name=='select':selected_names=selected_names[step.get_support()]
        else:Xs=Xtrain.values
        if hasattr(core,'feature_importances_'):sv=shap.TreeExplainer(core).shap_values(Xs)
        elif hasattr(core,'coef_'):sv=shap.LinearExplainer(core,Xs).shap_values(Xs)
        else:sv=None
        if sv is not None:
            arr=np.asarray(sv);arr=np.mean(np.abs(arr),axis=tuple(range(arr.ndim-1))) if arr.ndim>2 else np.mean(np.abs(arr),axis=0);shap_rows=[{'feature':selected_names[i],'mean_abs_shap':float(arr[i])} for i in np.argsort(arr)[::-1][:100]]
        else:messages.append('当前最佳模型不支持快速SHAP解释，已保留嵌套CV置换重要性')
    except Exception as e:messages.append('未生成SHAP：'+str(e))
    if len(ytrain)<50:messages.append('训练样本少于50，机器学习结果仅用于候选排序')
    return pack('machine_learning','scikit-learn nested CV + optional XGBoost/SHAP',{'trainingSamples':len(ytrain),'externalSamples':int(external.sum()),'groups':len(classes),'bestModel':best_name,'bestParameters':best_params,'seed':seed,'dataLeakageProtection':'imputation, feature selection, scaling and hyperparameter tuning are fitted inside training folds; external validation is never used for preprocessing or training'},{'model_comparison':scores,'nested_cv_folds':fold_rows,'oof_predictions':oof_tables[best_name],'external_validation_metrics':external_metrics,'external_validation_predictions':external_rows,'feature_importance':importance,'shap_importance':shap_rows,'confusion_matrix':conf},messages)
def correlations(payload):
    smap=sample_map(payload);ind=set(payload.get('settings',{}).get('indicators',[]));phen=next((a for a in payload.get('assets',[]) if a.get('module')=='phenotype'),None)
    if not phen:raise ValueError('相关分析需要行为学/生化表型数据')
    p=pd.DataFrame(phen['data']);sid=next((c for c in ['Sample_ID','sample_id','Sample'] if c in p.columns),None)
    if not sid:raise ValueError('表型数据缺少Sample_ID列')
    traits=[c for c in p.columns if c!=sid and (not ind or c in ind) and pd.to_numeric(p[c],errors='coerce').notna().sum()>=4]
    rows=[]
    for a in payload.get('assets',[]):
        if a.get('module') in ['phenotype','chemistry']:continue
        d=pd.DataFrame(a['data']);sample_cols=[c for c in d.columns if c in smap];idc=next((c for c in ['Gene_ID','Protein_ID','Protein','Feature_ID','ID','Name'] if c in d.columns),d.columns[0])
        for _,r in d.iterrows():
            for trait in traits:
                vals=[]
                for s in sample_cols:
                    q=p[p[sid].astype(str)==s]
                    if len(q):vals.append((pd.to_numeric(pd.Series([r[s]]),errors='coerce').iloc[0],pd.to_numeric(q[trait],errors='coerce').iloc[0]))
                vals=[v for v in vals if np.isfinite(v[0]) and np.isfinite(v[1])]
                if len(vals)>=5:
                    rho,pv=stats.spearmanr([v[0] for v in vals],[v[1] for v in vals]);rows.append({'module':a['module'],'feature':str(r[idc]),'indicator':trait,'n':len(vals),'spearman_r':rho,'pValue':pv})
    q=bh([r['pValue'] for r in rows]) if rows else []
    for r,v in zip(rows,q):r['fdr']=v
    rows.sort(key=lambda r:(r['fdr'],-abs(r['spearman_r'])))
    return pack('correlation','scipy Spearman + BH-FDR',{'tests':len(rows),'indicators':traits},{'correlations':rows},[])
def overlap(payload):
    sets={}
    for r in payload.get('results',[]):
        for d in r.get('differential',[]):
            if float(d.get('fdr',1))<.05:sets.setdefault(f"{r['module']}::{d['comparison']}",set()).add(str(d.get('label') or d['featureId']))
    memberships={}
    for name,vals in sets.items():
        for v in vals:memberships.setdefault(v,[]).append(name)
    rows=[{'feature':k,'sets':';'.join(v),'degree':len(v)} for k,v in memberships.items()]
    rows.sort(key=lambda x:(-x['degree'],x['feature']))
    return pack('overlap','Exact set intersection',{'sets':len(sets),'uniqueFeatures':len(rows)},{'set_sizes':[{'set':k,'size':len(v)} for k,v in sets.items()],'memberships':rows},[])
def multiomics(payload):
    smap=sample_map(payload);blocks=[]
    for a in payload.get('assets',[]):
        if a.get('module') in ['phenotype','chemistry']:continue
        x,_,_=matrix(a,smap,100)
        if x is not None:blocks.append((a['module'],x))
    if len(blocks)<2:raise ValueError('多组学相关至少需要两个具有共同样本的矩阵')
    rows=[]
    for i,(ma,a) in enumerate(blocks):
        for mb,b in blocks[i+1:]:
            shared=sorted(set(a.index)&set(b.index))
            for ca in a.columns:
                for cb in b.columns:
                    rho,p=stats.spearmanr(a.loc[shared,ca],b.loc[shared,cb])
                    if np.isfinite(rho) and abs(rho)>=.7:rows.append({'moduleA':ma,'featureA':ca,'moduleB':mb,'featureB':cb,'n':len(shared),'spearman_r':rho,'pValue':p})
    q=bh([r['pValue'] for r in rows]) if rows else []
    for r,v in zip(rows,q):r['fdr']=v
    rows.sort(key=lambda r:(r['fdr'],-abs(r['spearman_r'])))
    return pack('multiomics','Cross-omics Spearman + BH-FDR',{'retainedEdges':len(rows)},{'cross_omics_edges':rows[:5000]},['仅保留|r|≥0.7的边；相关不等于因果'])
def pack(method,engine,summary,tables,messages):return {'id':f"deep-{method}",'method':method,'createdAt':pd.Timestamp.utcnow().isoformat(),'status':'warning' if messages else 'completed','engine':engine,'settings':{},'summary':summary,'tables':tables,'messages':[m for m in messages if m]}
def main():
    p=json.load(sys.stdin);m=p.get('method')
    out=machine_learning(p) if m=='machine_learning' else correlations(p) if m=='correlation' else overlap(p) if m=='overlap' else multiomics(p) if m=='multiomics' else (_ for _ in ()).throw(ValueError('该方法应由R高级分析引擎运行'))
    print(json.dumps({'ok':True,'result':finite(out)},ensure_ascii=False,allow_nan=False))
if __name__=='__main__':
    try:main()
    except Exception as e:traceback.print_exc(file=sys.stderr);print(json.dumps({'ok':False,'error':str(e)},ensure_ascii=False));sys.exit(0)
