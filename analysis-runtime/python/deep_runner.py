import sys,json,traceback,math
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.model_selection import StratifiedKFold,cross_val_predict,permutation_test_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler,label_binarize
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.svm import SVC
from sklearn.metrics import balanced_accuracy_score,roc_auc_score,confusion_matrix

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
def matrix(asset,smap,max_features=500):
    data=pd.DataFrame(asset.get('data',[])); cols=[c for c in data.columns if c in smap]
    if len(cols)<4:return None,None,None
    ids=next((c for c in ['Gene_ID','Protein_ID','Protein','Feature_ID','Taxon','ASV_ID','ID','Name'] if c in data.columns),data.columns[0])
    x=data[cols].apply(pd.to_numeric,errors='coerce').T
    x=x.loc[:,x.notna().mean()>=.5];x=x.fillna(x.median())
    if x.shape[1]>max_features:x=x.loc[:,x.var().sort_values(ascending=False).head(max_features).index]
    x.columns=[f"{asset.get('module')}::{str(v)}" for v in data.loc[x.columns,ids]] if all(isinstance(v,(int,np.integer)) for v in x.columns) else [f"{asset.get('module')}::{c}" for c in x.columns]
    return x,cols,ids
def machine_learning(payload):
    smap=sample_map(payload);settings=payload.get('settings',{});blocks=[]
    for a in payload.get('assets',[]):
        x,_,_=matrix(a,smap,int(settings.get('maxFeatures',300)))
        if x is not None:blocks.append(x)
    if not blocks:raise ValueError('没有可用于机器学习的矩阵数据')
    shared=sorted(set.intersection(*[set(x.index) for x in blocks]));X=pd.concat([x.loc[shared] for x in blocks],axis=1);y=np.array([smap[s]['group'] for s in shared]);counts=pd.Series(y).value_counts()
    if len(counts)<2 or counts.min()<3:raise ValueError('机器学习要求至少2组且每组至少3个独立样本')
    folds=min(5,int(counts.min()));cv=StratifiedKFold(folds,shuffle=True,random_state=20260714)
    models={
      'ElasticNet':Pipeline([('scale',StandardScaler()),('model',LogisticRegression(penalty='elasticnet',solver='saga',l1_ratio=.5,C=.5,max_iter=5000,class_weight='balanced'))]),
      'RandomForest':RandomForestClassifier(n_estimators=500,min_samples_leaf=2,max_features='sqrt',class_weight='balanced',random_state=20260714),
      'SVM-RBF':Pipeline([('scale',StandardScaler()),('model',SVC(C=1,kernel='rbf',probability=True,class_weight='balanced',random_state=20260714))])}
    scores=[];best=None
    for name,model in models.items():
        pred=cross_val_predict(model,X,y,cv=cv,method='predict');proba=cross_val_predict(model,X,y,cv=cv,method='predict_proba');bal=balanced_accuracy_score(y,pred)
        try:auc=roc_auc_score(y,proba[:,1]) if len(counts)==2 else roc_auc_score(label_binarize(y,classes=sorted(counts.index)),proba,multi_class='ovr',average='macro')
        except:auc=None
        perm=permutation_test_score(model,X,y,cv=cv,scoring='balanced_accuracy',n_permutations=int(settings.get('permutations',100)),random_state=20260714,n_jobs=1)
        row={'model':name,'balanced_accuracy':bal,'roc_auc':auc,'permutation_p':perm[2],'folds':folds,'n':len(y),'features':X.shape[1]};scores.append(row)
        if best is None or bal>best[0]:best=(bal,name,model,pred)
    model=best[2];model.fit(X,y);core=model.named_steps.get('model') if hasattr(model,'named_steps') else model
    if hasattr(core,'feature_importances_'):imp=np.asarray(core.feature_importances_)
    elif hasattr(core,'coef_'):imp=np.mean(np.abs(np.atleast_2d(core.coef_)),axis=0)
    else:imp=np.zeros(X.shape[1])
    importance=[{'feature':X.columns[i],'importance':float(imp[i])} for i in np.argsort(imp)[::-1][:100]]
    cm=confusion_matrix(y,best[3],labels=sorted(counts.index));conf=[{'actual':a,'predicted':b,'count':int(cm[i,j])} for i,a in enumerate(sorted(counts.index)) for j,b in enumerate(sorted(counts.index))]
    warning='小样本机器学习仅用于候选排序，不作为独立验证' if len(y)<50 else ''
    return pack('machine_learning','scikit-learn nested-safe CV core',{'samples':len(y),'groups':len(counts),'bestModel':best[1],'warning':warning},{'model_comparison':scores,'feature_importance':importance,'confusion_matrix':conf},[warning] if warning else [])
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
