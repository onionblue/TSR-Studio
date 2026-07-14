import sys,json,math,traceback
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.decomposition import PCA

def bh(p):
    p=np.asarray([x if np.isfinite(x) else 1 for x in p],float);o=np.argsort(p);q=np.ones(len(p));prev=1
    for rank in range(len(p)-1,-1,-1):
        prev=min(prev,p[o[rank]]*len(p)/(rank+1));q[o[rank]]=min(1,prev)
    return q.tolist()
def welch(a,b):
    a=np.asarray(a,float);b=np.asarray(b,float);r=stats.ttest_ind(b,a,equal_var=False,nan_policy='omit');va=np.nanvar(a,ddof=1);vb=np.nanvar(b,ddof=1);pooled=math.sqrt(max(0,((len(a)-1)*va+(len(b)-1)*vb)/max(1,len(a)+len(b)-2)));d=(np.nanmean(b)-np.nanmean(a))/pooled if pooled else 0
    correction=1-3/max(1,4*(len(a)+len(b))-9);t=float(r.statistic) if np.isfinite(r.statistic) else 0;p=float(r.pvalue) if np.isfinite(r.pvalue) else 1;g=float(d*correction) if np.isfinite(d) else 0;return t,p,g
def samples_map(payload): return {s['id']:s for s in payload['samples'] if s.get('included',True)}
def validate_groups(payload,smap):
    present=sorted(set(s.get('group','') for s in smap.values()));meta=payload['meta'];required=[meta.get('controlGroup',''),meta.get('modelGroup','')]
    missing=[g for g in required if g not in present]
    if missing:raise ValueError(f"分组映射不完整：数据中未找到 {', '.join(missing)}；当前组别为 {', '.join(present)}")
def pairs(feature,by,meta,all_pairwise=False):
    out=[];control=by.get(meta['controlGroup'],[]);model=by.get(meta['modelGroup'],[])
    primary=[(meta['controlGroup'],meta['modelGroup'],control,model)]+[(meta['modelGroup'],t,model,by.get(t,[])) for t in meta.get('treatmentGroups',[])]
    comparisons=list(primary)
    if all_pairwise:
        groups=[g for g in [meta.get('controlGroup'),meta.get('modelGroup'),*meta.get('treatmentGroups',[])] if g in by]
        seen={tuple(sorted((a,b))) for a,b,_,_ in comparisons}
        for i,ga in enumerate(groups):
            for gb in groups[i+1:]:
                if tuple(sorted((ga,gb))) not in seen:comparisons.append((ga,gb,by.get(ga,[]),by.get(gb,[])))
    primary_names={f'{gb}_vs_{ga}' for ga,gb,_,_ in primary}
    for ga,gb,a,b in comparisons:
        if len(a)<2 or len(b)<2: continue
        t,p,g=welch(a,b);rec=None
        if ga==meta['modelGroup'] and len(control):
            den=np.mean(model)-np.mean(control);rec=(np.mean(model)-np.mean(b))/den if abs(den)>1e-12 else 0
        name=f'{gb}_vs_{ga}';out.append({'featureId':feature,'comparison':name,'comparisonScope':'primary' if name in primary_names else 'exploratory_pairwise','meanA':float(np.mean(a)),'meanB':float(np.mean(b)),'effect':float(np.mean(b)-np.mean(a)),'t':t,'pValue':p,'hedgesG':g,'recovery':rec})
    return out
def individual(payload):
    data=pd.DataFrame(payload['asset']['data']);smap=samples_map(payload);validate_groups(payload,smap);sid=next((x for x in ['Sample_ID','sample_id','Sample','sample'] if x in data.columns),None)
    if not sid: raise ValueError('需要Sample_ID列')
    data=data[data[sid].astype(str).isin(smap)].copy();numeric=[c for c in data.columns if c!=sid and pd.to_numeric(data[c],errors='coerce').notna().sum()>=2];summ=[];diff=[]
    for col in numeric:
        data[col]=pd.to_numeric(data[col],errors='coerce');by={}
        for _,r in data.iterrows():
            g=smap[str(r[sid])]['group'];v=r[col]
            if pd.notna(v):by.setdefault(g,[]).append(float(v))
        for g,x in by.items():summ.append({'feature':col,'group':g,'n':len(x),'mean':float(np.mean(x)),'sd':float(np.std(x,ddof=1)) if len(x)>1 else None,'median':float(np.median(x))})
        diff+=pairs(col,by,payload['meta'])
    add_fdr(diff);return {'engine':'Python scipy 0.3','module':payload['asset']['module'],'status':'completed','qc':{'matchedSamples':len(data),'numericFeatures':len(numeric)},'summaries':summ,'differential':diff,'pca':[],'messages':[]}
def matrix(payload):
    data=pd.DataFrame(payload['asset']['data']);smap=samples_map(payload);validate_groups(payload,smap);sample_cols=[c for c in data.columns if c in smap];id_col=next((x for x in ['Gene_ID','Protein_ID','Protein','Feature_ID','Taxon','ASV_ID','ID','id','Name'] if x in data.columns),data.columns[0]);X=data[sample_cols].apply(pd.to_numeric,errors='coerce');module=payload['asset']['module'];messages=[]
    missing=X.isna().mean(axis=1);keep=missing<=float(payload.get('parameters',{}).get('maxMissing',0.5));data=data.loc[keep].reset_index(drop=True);X=X.loc[keep].reset_index(drop=True)
    if module=='microbiome':
        pos=X.where(X>0);pseudo=float(np.nanmin(pos.values))/2 if np.isfinite(np.nanmin(pos.values)) else 1e-6;X=np.log(X.fillna(0)+pseudo);X=X.sub(X.mean(axis=0),axis=1);messages.append(f'CLR转换，伪计数={pseudo:g}')
    else:
        positive=np.nanmin(X.values)>=0
        if positive and np.nanmax(X.values)>100:X=np.log2(X+1);messages.append('已执行log2(x+1)转换')
        strategy=payload.get('parameters',{}).get('imputation','none')
        if strategy=='feature_median':X=X.T.fillna(X.median(axis=1)).T;messages.append('按特征中位数填补；正式蛋白组需进一步判断MAR/MNAR')
    diff=[];summ=[]
    for i,row in X.iterrows():
        feature=str(data.loc[i,id_col]);by={}
        for sid in sample_cols:
            v=row[sid]
            if pd.notna(v):by.setdefault(smap[sid]['group'],[]).append(float(v))
        rows=pairs(feature,by,payload['meta'],module=='proteomics');label=next((str(data.loc[i,c]) for c in ['Gene','Description','Name'] if c in data.columns and pd.notna(data.loc[i,c]) and str(data.loc[i,c]).strip()),feature)
        for x in rows:x['label']=label
        diff+=rows
    add_fdr(diff);Xp=X.T.copy();Xp=Xp.fillna(Xp.mean(axis=0));pca=[];variance=[]
    if Xp.shape[0]>=3 and Xp.shape[1]>=2:
        model=PCA(n_components=2);scores=model.fit_transform(Xp);variance=model.explained_variance_ratio_.tolist();pca=[{'sampleId':sid,'group':smap[sid]['group'],'pc1':float(scores[i,0]),'pc2':float(scores[i,1])} for i,sid in enumerate(sample_cols)]
    return {'engine':'Python scipy/sklearn 0.4','module':module,'status':'warning' if messages else 'completed','qc':{'inputFeatures':len(keep),'retainedFeatures':int(keep.sum()),'matchedSamples':len(sample_cols),'medianMissingRate':float(missing.median()),'pcaVariance':variance},'summaries':summ,'differential':diff,'pca':pca,'messages':messages}
def add_fdr(rows):
    for comp in sorted(set(r['comparison'] for r in rows)):
        sub=[r for r in rows if r['comparison']==comp];q=bh([r['pValue'] for r in sub])
        for r,v in zip(sub,q):r['fdr']=v
def environment():
    import scipy,sklearn
    return {'python':sys.version.split()[0],'numpy':np.__version__,'pandas':pd.__version__,'scipy':scipy.__version__,'sklearn':sklearn.__version__,'r':'not checked by Python runner'}
def finite_json(x):
    if isinstance(x,dict):return {k:finite_json(v) for k,v in x.items()}
    if isinstance(x,list):return [finite_json(v) for v in x]
    if isinstance(x,(float,np.floating)) and not np.isfinite(x):return None
    return x
def main():
    payload=json.load(sys.stdin);action=payload.get('action','analyze')
    if action=='environment':result=environment()
    elif payload['asset']['module'] in ['phenotype','scfa']:result=individual(payload)
    elif payload['asset']['module']=='transcriptomics':raise RuntimeError('转录组正式模型需要DESeq2运行时；0.4不使用普通t检验替代')
    else:result=matrix(payload)
    print(json.dumps({'ok':True,'result':finite_json(result)},ensure_ascii=False,allow_nan=False))
if __name__=='__main__':
    try:main()
    except Exception as e:
        traceback.print_exc(file=sys.stderr);print(json.dumps({'ok':False,'error':str(e)},ensure_ascii=False));sys.exit(0)
