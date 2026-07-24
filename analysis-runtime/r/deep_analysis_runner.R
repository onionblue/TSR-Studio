args <- commandArgs(trailingOnly=TRUE)
if(length(args)<2) stop('usage: deep_analysis_runner.R input.json output.json')
if(!requireNamespace('jsonlite',quietly=TRUE)) stop('缺少R包jsonlite')
p <- jsonlite::fromJSON(args[1],simplifyVector=FALSE); method <- p$method
pack <- function(method,engine,summary,tables,messages=character()) list(id=paste0('deep-',method,'-',as.integer(Sys.time())),method=method,createdAt=format(Sys.time(),'%Y-%m-%dT%H:%M:%SZ',tz='UTC'),status=if(length(messages))'warning' else 'completed',engine=engine,settings=p$settings,summary=summary,tables=tables,messages=as.list(messages))
norm_rows <- function(x) {
 if(is.null(x)||!length(x)) return(data.frame())
 keys <- unique(unlist(lapply(x,names),use.names=FALSE))
 rows <- lapply(x,function(z){
  z <- z[keys]
  z <- lapply(z,function(v){
   if(is.null(v)||length(v)==0) return(NA_character_)
   if(is.list(v)||length(v)>1) return(paste(unlist(v),collapse=';'))
   v
  })
  as.data.frame(z,stringsAsFactors=FALSE,optional=TRUE)
 })
 out <- do.call(rbind,rows);rownames(out)<-NULL;out
}
species_db <- function(species){if(grepl('musculus',species,ignore.case=TRUE))'org.Mm.eg.db' else if(grepl('norvegicus',species,ignore.case=TRUE))'org.Rn.eg.db' else 'org.Hs.eg.db'}
species_kegg <- function(species){if(grepl('musculus',species,ignore.case=TRUE))'mmu' else if(grepl('norvegicus',species,ignore.case=TRUE))'rno' else 'hsa'}
enrich <- function(){
 if(!requireNamespace('clusterProfiler',quietly=TRUE))stop('缺少clusterProfiler；请运行3.0.2依赖安装器')
 dbn<-species_db(p$meta$species);if(!requireNamespace(dbn,quietly=TRUE))stop(paste0('缺少物种注释包',dbn))
 db<-getExportedValue(dbn,dbn); rows<-norm_rows(p$results);if(!nrow(rows))stop('没有差异结果')
 rows$fdr<-as.numeric(rows$fdr);rows$log2FC<-as.numeric(rows$log2FC);ids<-unique(as.character(rows$featureId[rows$fdr<as.numeric(p$settings$fdr %||% .05)]));allids<-unique(as.character(rows$featureId))
 ids<-sub('\\.[0-9]+$','',ids);allids<-sub('\\.[0-9]+$','',allids)
 from<-if(all(grepl('^(ENSMUSP|ENSP|ENSRNOP)',allids)))'ENSEMBLPROT' else if(all(grepl('^ENS',allids)))'ENSEMBL' else if(all(grepl('^[0-9]+$',allids)))'ENTREZID' else if(all(grepl('^[A-Z0-9]+_[A-Z]+$',allids)))'UNIPROT' else 'SYMBOL'
 conv<-unique(clusterProfiler::bitr(ids,fromType=from,toType='ENTREZID',OrgDb=db));universe<-unique(clusterProfiler::bitr(allids,fromType=from,toType='ENTREZID',OrgDb=db))
 if(!nrow(conv))stop('基因ID无法映射；请确认物种及ID类型')
 mapped_input<-unique(as.character(conv[[from]]));mapped_background<-unique(as.character(universe[[from]]))
 unmapped<-data.frame(Input_ID=setdiff(ids,mapped_input),Reason='未在所选物种注释库中映射',stringsAsFactors=FALSE)
 unmapped_background<-data.frame(Input_ID=setdiff(allids,mapped_background),Reason='背景ID未在所选物种注释库中映射',stringsAsFactors=FALSE)
 duplicated<-conv[duplicated(conv[[from]])|duplicated(conv[[from]],fromLast=TRUE),,drop=FALSE]
 mapping_rate<-length(mapped_input)/max(1,length(ids));background_rate<-length(mapped_background)/max(1,length(allids))
 mapping_report<-data.frame(
  Metric=c('Species','Annotation_database','Detected_ID_type','Input_IDs','Mapped_input_IDs','Input_mapping_rate','Background_IDs','Mapped_background_IDs','Background_mapping_rate','One_to_many_rows','Unmapped_input_IDs'),
  Value=c(as.character(p$meta$species),dbn,from,length(ids),length(mapped_input),mapping_rate,length(allids),length(mapped_background),background_rate,nrow(duplicated),nrow(unmapped)),
  stringsAsFactors=FALSE)
 if(length(mapped_input)<10)stop(paste0('有效映射基因少于10个（',length(mapped_input),'），已停止富集'))
 if(mapping_rate<.5)stop(paste0('输入ID映射率低于50%（',round(mapping_rate*100,1),'%），已停止正式富集；请核对物种和ID类型'))
 if(method=='go')o<-clusterProfiler::enrichGO(conv$ENTREZID,OrgDb=db,keyType='ENTREZID',ont='ALL',universe=universe$ENTREZID,pAdjustMethod='BH',readable=TRUE)
 else if(method=='kegg')o<-clusterProfiler::enrichKEGG(conv$ENTREZID,organism=species_kegg(p$meta$species),universe=universe$ENTREZID,pAdjustMethod='BH')
 else {
  ranked<-as.numeric(rows$log2FC); ranked_ids<-sub('\\.[0-9]+$','',as.character(rows$featureId));
  keep_rank<-is.finite(ranked)&nzchar(ranked_ids); ranked<-ranked[keep_rank]; ranked_ids<-ranked_ids[keep_rank]
  ranked<-tapply(ranked,ranked_ids,mean,na.rm=TRUE); ranked<-sort(ranked[is.finite(ranked)],decreasing=TRUE)
  cv<-unique(clusterProfiler::bitr(names(ranked),fromType=from,toType='ENTREZID',OrgDb=db)[,c(from,'ENTREZID')])
  if(!nrow(cv))stop('GSEA基因ID无法映射；请检查物种和ID类型')
  score<-ranked[match(cv[[from]],names(ranked))]; names(score)<-cv$ENTREZID
  ranked<-sort(tapply(score,names(score),mean,na.rm=TRUE),decreasing=TRUE)
  ranked<-ranked[is.finite(ranked)]; if(length(ranked)<10)stop('GSEA可映射排序基因少于10个，已停止运行')
  o<-clusterProfiler::gseKEGG(ranked,organism=species_kegg(p$meta$species),pAdjustMethod='BH',verbose=FALSE)
 }
 tab<-as.data.frame(o);messages<-character();if(mapping_rate<.8)messages<-c(messages,paste0('输入ID映射率为',round(mapping_rate*100,1),'%，低于建议值80%，结果需谨慎解释'))
 pack(method,paste('clusterProfiler',as.character(packageVersion('clusterProfiler'))),list(inputGenes=length(ids),mappedGenes=length(mapped_input),mappingRate=mapping_rate,backgroundGenes=length(allids),mappedBackground=length(mapped_background),backgroundMappingRate=background_rate,terms=nrow(tab),idType=from,speciesDatabase=dbn),list(enrichment=tab,id_mapping=conv,id_unmapped=unmapped,id_duplicated=duplicated,background_mapping=universe,background_unmapped=unmapped_background,mapping_report=mapping_report),messages)
}
`%||%` <- function(a,b)if(is.null(a))b else a
wgcna <- function(){
 if(!requireNamespace('WGCNA',quietly=TRUE))stop('缺少WGCNA；请运行3.0.2依赖安装器')
 asset<-p$asset;d<-norm_rows(asset$data);samples<-norm_rows(p$samples);samples<-samples[samples$included!=FALSE,,drop=FALSE];sc<-intersect(colnames(d),samples$id)
 if(length(sc)<15)stop('WGCNA至少需要15个可匹配独立样本；当前样本量不足，已阻止运行')
 idc<-intersect(c('Gene_ID','Protein_ID','Protein','Feature_ID','ID','Name'),colnames(d))[1];if(is.na(idc))idc<-colnames(d)[1]
 x<-t(sapply(sc,function(z)as.numeric(d[[z]])));colnames(x)<-make.unique(as.character(d[[idc]]));rownames(x)<-sc
 keep<-colMeans(is.finite(x))>=.8;x<-x[,keep,drop=FALSE];for(j in seq_len(ncol(x)))x[!is.finite(x[,j]),j]<-median(x[,j],na.rm=TRUE)
 vars<-apply(x,2,var);x<-x[,order(vars,decreasing=TRUE)[seq_len(min(5000,ncol(x)))],drop=FALSE]
 good<-WGCNA::goodSamplesGenes(x,verbose=0);x<-x[good$goodSamples,good$goodGenes,drop=FALSE]
 powers<-c(1:10,seq(12,20,2));sft<-WGCNA::pickSoftThreshold(x,powerVector=powers,verbose=0);fit<-sft$fitIndices;chosen<-fit$Power[which(fit$SFT.R.sq>=.8)[1]];if(is.na(chosen))chosen<-fit$Power[which.max(fit$SFT.R.sq)]
 net<-WGCNA::blockwiseModules(x,power=chosen,TOMType='signed',minModuleSize=30,mergeCutHeight=.25,numericLabels=FALSE,pamRespectsDendro=FALSE,verbose=0,maxBlockSize=6000)
 mm<-WGCNA::signedKME(x,net$MEs);genes<-data.frame(feature=colnames(x),module=net$colors,connectivity=apply(abs(mm),1,max,na.rm=TRUE),stringsAsFactors=FALSE)
 sample_index<-match(rownames(x),samples$id);traits<-model.matrix(~0+factor(samples$group[sample_index]));colnames(traits)<-sub('factor\\(samples\\$group\\[sample_index\\])','',colnames(traits))
 phenotype_index<-which(vapply(p$assets,function(a)identical(a$module,'phenotype'),logical(1)));phenotype<-if(length(phenotype_index))p$assets[[phenotype_index[1]]] else NULL
 if(!is.null(phenotype)){ph<-norm_rows(phenotype$data);sid<-intersect(c('Sample_ID','sample_id','SampleID','ID'),colnames(ph))[1];requested<-unlist(p$settings$indicators %||% list(),use.names=FALSE);if(!is.na(sid)&&length(requested))for(k in intersect(requested,colnames(ph))){v<-as.numeric(ph[[k]][match(rownames(x),ph[[sid]])]);if(sum(is.finite(v))>=max(6,ceiling(.7*length(v)))&&sd(v,na.rm=TRUE)>0){v[!is.finite(v)]<-median(v,na.rm=TRUE);traits<-cbind(traits,v);colnames(traits)[ncol(traits)]<-k}}}
 corv<-WGCNA::cor(net$MEs,traits,use='p');pv<-WGCNA::corPvalueStudent(corv,nrow(x));mt<-expand.grid(module=rownames(corv),trait=colnames(corv),stringsAsFactors=FALSE);mt$correlation<-as.vector(corv);mt$pValue<-as.vector(pv);mt$fdr<-p.adjust(mt$pValue,'BH')
 eigengenes<-data.frame(sample=rownames(x),net$MEs,check.names=FALSE,stringsAsFactors=FALSE);hc<-hclust(dist(x));sample_clustering<-data.frame(order=seq_along(hc$order),sample=rownames(x)[hc$order],stringsAsFactors=FALSE)
 hubs<-do.call(rbind,lapply(split(genes,genes$module),function(z)head(z[order(z$connectivity,decreasing=TRUE),,drop=FALSE],20)));hubs$hubRank<-ave(-hubs$connectivity,hubs$module,FUN=function(v)rank(v,ties.method='first'))
 module_summary<-aggregate(feature~module,genes,length);names(module_summary)[2]<-'featureCount';module_summary$topHub<-vapply(module_summary$module,function(m){v<-hubs$feature[hubs$module==m];if(length(v))v[1] else ''},character(1))
 node_pool<-unique(unlist(lapply(split(genes,genes$module),function(z)head(z[order(z$connectivity,decreasing=TRUE),'feature'],min(40,nrow(z))))));nodes<-genes[match(node_pool,genes$feature),,drop=FALSE];edges<-data.frame(source=character(),target=character(),weight=numeric(),module=character(),stringsAsFactors=FALSE)
 for(mod in unique(nodes$module)){g<-nodes$feature[nodes$module==mod];if(length(g)<2)next;cm<-cor(x[,g,drop=FALSE],use='pairwise.complete.obs');ij<-which(upper.tri(cm)&abs(cm)>=.7,arr.ind=TRUE);if(nrow(ij)){e<-data.frame(source=colnames(cm)[ij[,1]],target=colnames(cm)[ij[,2]],weight=cm[ij],module=mod,stringsAsFactors=FALSE);edges<-rbind(edges,e)}};if(nrow(edges)>5000)edges<-head(edges[order(abs(edges$weight),decreasing=TRUE),,drop=FALSE],5000)
 pack('wgcna',paste('WGCNA',as.character(packageVersion('WGCNA'))),list(samples=nrow(x),features=ncol(x),softPower=chosen,modules=length(unique(net$colors)),traits=ncol(traits),networkNodes=nrow(nodes),networkEdges=nrow(edges)),list(soft_threshold=fit,sample_clustering=sample_clustering,module_membership=genes,module_eigengenes=eigengenes,module_trait=mt,module_summary=module_summary,hub_genes=hubs,cytoscape_nodes=nodes,cytoscape_edges=edges),if(nrow(x)<30)'样本量少于30，结果标记为探索性并需重采样验证' else character())
}
omics_blocks <- function(max_features=1000){
 samples<-norm_rows(p$samples);samples<-samples[samples$included!=FALSE,,drop=FALSE];out<-list()
 for(a in p$assets){if(a$module%in%c('phenotype','chemistry'))next;d<-norm_rows(a$data);sc<-intersect(colnames(d),samples$id);if(length(sc)<6)next;idc<-intersect(c('Gene_ID','Protein_ID','Protein','Feature_ID','Taxon','ASV_ID','ID','Name'),colnames(d))[1];if(is.na(idc))idc<-colnames(d)[1];x<-sapply(sc,function(z)as.numeric(d[[z]]));rownames(x)<-make.unique(paste0(a$module,'::',as.character(d[[idc]])));colnames(x)<-sc;keep<-rowMeans(is.finite(x))>=.7;x<-x[keep,,drop=FALSE];if(nrow(x)<2)next;for(i in seq_len(nrow(x)))x[i,!is.finite(x[i,])]<-median(x[i,],na.rm=TRUE);v<-apply(x,1,var);v[!is.finite(v)]<-0;take<-head(order(v,decreasing=TRUE),min(max_features,nrow(x)));x<-x[take,,drop=FALSE];out[[a$module]]<-x}
 if(length(out)<2)stop('高级多组学整合至少需要两个具有共同样本的定量矩阵');shared<-Reduce(intersect,lapply(out,colnames));if(length(shared)<10)stop('高级多组学整合要求至少10个跨组学共同样本');lapply(out,function(x)x[,shared,drop=FALSE])
}
mofa2 <- function(){
 if(!requireNamespace('MOFA2',quietly=TRUE))stop('缺少MOFA2；请运行3.0.2依赖安装器，并确认mofapy2可用')
 blocks<-omics_blocks(as.integer(p$settings$maxFeatures %||% 1000));model<-MOFA2::create_mofa(blocks);data_opts<-MOFA2::get_default_data_options(model);data_opts$scale_views<-TRUE;model_opts<-MOFA2::get_default_model_options(model);model_opts$num_factors<-max(2,min(as.integer(p$settings$factors %||% 10),length(colnames(blocks[[1]]))-1));train_opts<-MOFA2::get_default_training_options(model);train_opts$seed<-as.integer(p$settings$seed %||% 20260714);train_opts$convergence_mode<-'medium';model<-MOFA2::prepare_mofa(model,data_options=data_opts,model_options=model_opts,training_options=train_opts);outfile<-tempfile(fileext='.hdf5');model<-MOFA2::run_mofa(model,outfile=outfile,use_basilisk=TRUE)
 factors<-as.data.frame(MOFA2::get_factors(model,factors='all',as.data.frame=TRUE));weights<-as.data.frame(MOFA2::get_weights(model,views='all',factors='all',as.data.frame=TRUE));variance<-as.data.frame(MOFA2::get_variance_explained(model)$r2_per_factor);variance$view<-rownames(variance);rownames(variance)<-NULL
 top_weights<-do.call(rbind,lapply(split(weights,list(weights$view,weights$factor),drop=TRUE),function(z)head(z[order(abs(z$value),decreasing=TRUE),,drop=FALSE],50)))
 pack('mofa2',paste('MOFA2',as.character(packageVersion('MOFA2'))),list(samples=length(colnames(blocks[[1]])),views=length(blocks),factors=model_opts$num_factors),list(factors=factors,variance_explained=variance,top_feature_weights=top_weights),character())
}
diablo <- function(){
 if(!requireNamespace('mixOmics',quietly=TRUE))stop('缺少mixOmics；请运行3.0.2依赖安装器')
 blocks0<-omics_blocks(as.integer(p$settings$maxFeatures %||% 500));blocks<-lapply(blocks0,t);samples<-norm_rows(p$samples);shared<-rownames(blocks[[1]]);y<-factor(samples$group[match(shared,samples$id)]);if(any(is.na(y)))stop('DIABLO样本分组映射失败');if(min(table(y))<5)stop('DIABLO要求每组至少5个独立样本')
 ncomp<-max(1,min(as.integer(p$settings$components %||% 2),length(levels(y))-1,3));design<-matrix(.1,length(blocks),length(blocks),dimnames=list(names(blocks),names(blocks)));diag(design)<-0;keep_n<-max(5,as.integer(p$settings$diabloKeepX %||% 20));keepX<-lapply(blocks,function(x)rep(min(keep_n,ncol(x)),ncomp));set.seed(as.integer(p$settings$seed %||% 20260714));model<-mixOmics::block.splsda(X=blocks,Y=y,ncomp=ncomp,keepX=keepX,design=design);perf<-mixOmics::perf(model,validation='Mfold',folds=min(5,min(table(y))),nrepeat=as.integer(p$settings$repeats %||% 10),progressBar=FALSE)
 loadings<-do.call(rbind,lapply(names(model$loadings),function(view)do.call(rbind,lapply(seq_len(ncomp),function(k){v<-model$loadings[[view]][,k];ix<-head(order(abs(v),decreasing=TRUE),min(100,length(v)));data.frame(view=view,component=k,feature=names(v)[ix],loading=v[ix],stringsAsFactors=FALSE)}))));err<-as.data.frame(as.table(perf$error.rate$overall));names(err)<-c('component','distance','errorRate')
 score_block<-model$variates[[names(blocks)[1]]];if(is.null(score_block)&&!is.null(model$variates$X))score_block<-model$variates$X[[1]];if(is.null(score_block))score_block<-matrix(NA_real_,nrow=length(shared),ncol=ncomp);score_block<-as.data.frame(score_block);names(score_block)<-paste0('component_',seq_len(ncol(score_block)))
 pack('diablo',paste('mixOmics',as.character(packageVersion('mixOmics'))),list(samples=length(y),views=length(blocks),groups=length(levels(y)),components=ncomp,keepXPerViewComponent=keep_n,repeats=as.integer(p$settings$repeats %||% 10),seed=as.integer(p$settings$seed %||% 20260714)),list(selected_loadings=loadings,cv_error=err,sample_components=data.frame(sample=shared,group=as.character(y),score_block,check.names=FALSE)),if(length(y)<50)'样本少于50，DIABLO结果标记为探索性' else character())
}
consensus_wgcna <- function(){
 if(!requireNamespace('WGCNA',quietly=TRUE))stop('缺少WGCNA；请运行3.0.2依赖安装器');a<-p$asset;if(is.null(a))stop('共识WGCNA需要选择一个转录组或蛋白组矩阵');d<-norm_rows(a$data);samples<-norm_rows(p$samples);samples<-samples[samples$included!=FALSE,,drop=FALSE];sc<-intersect(colnames(d),samples$id);idc<-intersect(c('Gene_ID','Protein_ID','Protein','Feature_ID','ID','Name'),colnames(d))[1];if(is.na(idc))idc<-colnames(d)[1];x<-t(sapply(sc,function(z)as.numeric(d[[z]])));colnames(x)<-make.unique(as.character(d[[idc]]));rownames(x)<-sc;keep<-colMeans(is.finite(x))>=.8;x<-x[,keep,drop=FALSE];for(j in seq_len(ncol(x)))x[!is.finite(x[,j]),j]<-median(x[,j],na.rm=TRUE);v<-apply(x,2,var);take<-head(order(v,decreasing=TRUE),min(3000,ncol(x)));x<-x[,take,drop=FALSE];g<-samples$group[match(rownames(x),samples$id)];sets<-split(seq_len(nrow(x)),g);sets<-sets[vapply(sets,length,integer(1))>=10];if(length(sets)<2)stop('共识WGCNA至少需要两个组且每组不少于10个独立样本');multi<-lapply(sets,function(ix)list(data=x[ix,,drop=FALSE]));power<-as.integer(p$settings$power %||% 6);net<-WGCNA::blockwiseConsensusModules(multi,power=power,TOMType='signed',minModuleSize=30,mergeCutHeight=.25,numericLabels=FALSE,pamRespectsDendro=FALSE,verbose=0);genes<-data.frame(feature=colnames(x),module=net$colors,stringsAsFactors=FALSE);summary<-aggregate(feature~module,genes,length);names(summary)[2]<-'featureCount';group_summary<-do.call(rbind,lapply(names(sets),function(n)data.frame(group=n,samples=length(sets[[n]]),modules=length(unique(net$colors)),stringsAsFactors=FALSE)));messages<-character();preservation_stats<-data.frame();nperm<-max(20,as.integer(p$settings$preservationPermutations %||% 50));preservation_error<-''
 tryCatch({mp<-WGCNA::modulePreservation(multi,multiColor=list(reference=net$colors),referenceNetworks=1,nPermutations=nperm,randomSeed=as.integer(p$settings$seed %||% 20260714),verbose=0);zsets<-mp$preservation$Z$ref.1;if(length(zsets)){preservation_stats<-do.call(rbind,lapply(names(zsets),function(n){z<-as.data.frame(zsets[[n]]);z$module<-rownames(z);z$comparison<-n;rownames(z)<-NULL;z}));}},error=function(e){preservation_error<<-conditionMessage(e);messages<<-c(messages,paste0('模块保留统计未完成：',preservation_error))})
 if(any(vapply(sets,length,integer(1))<20))messages<-c(messages,'部分组样本少于20，共识模块及保留统计需独立数据验证');audit<-data.frame(metric=c('reference_group','permutations','preservation_rows','error'),value=c(names(sets)[1],nperm,nrow(preservation_stats),preservation_error),stringsAsFactors=FALSE);pack('consensus_wgcna',paste('WGCNA',as.character(packageVersion('WGCNA'))),list(groups=length(sets),features=ncol(x),power=power,modules=length(unique(net$colors)),preservationPermutations=nperm),list(consensus_membership=genes,module_summary=summary,group_summary=group_summary,module_preservation=preservation_stats,preservation_audit=audit),messages)
}
out<-if(method%in%c('go','kegg','gsea'))enrich() else if(method=='wgcna')wgcna() else if(method=='mofa2')mofa2() else if(method=='diablo')diablo() else if(method=='consensus_wgcna')consensus_wgcna() else stop('未知R高级分析方法')
jsonlite::write_json(out,args[2],auto_unbox=TRUE,pretty=TRUE,na='null',dataframe='rows')
