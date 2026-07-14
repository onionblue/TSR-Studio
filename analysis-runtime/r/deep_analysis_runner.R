args <- commandArgs(trailingOnly=TRUE)
if(length(args)<2) stop('usage: deep_analysis_runner.R input.json output.json')
if(!requireNamespace('jsonlite',quietly=TRUE)) stop('缺少R包jsonlite')
p <- jsonlite::fromJSON(args[1],simplifyVector=FALSE); method <- p$method
pack <- function(method,engine,summary,tables,messages=character()) list(id=paste0('deep-',method,'-',as.integer(Sys.time())),method=method,createdAt=format(Sys.time(),'%Y-%m-%dT%H:%M:%SZ',tz='UTC'),status=if(length(messages))'warning' else 'completed',engine=engine,settings=p$settings,summary=summary,tables=tables,messages=as.list(messages))
norm_rows <- function(x) if(is.null(x)||!length(x)) data.frame() else do.call(rbind,lapply(x,function(z)as.data.frame(z,stringsAsFactors=FALSE)))
species_db <- function(species){if(grepl('musculus',species,ignore.case=TRUE))'org.Mm.eg.db' else if(grepl('norvegicus',species,ignore.case=TRUE))'org.Rn.eg.db' else 'org.Hs.eg.db'}
species_kegg <- function(species){if(grepl('musculus',species,ignore.case=TRUE))'mmu' else if(grepl('norvegicus',species,ignore.case=TRUE))'rno' else 'hsa'}
enrich <- function(){
 if(!requireNamespace('clusterProfiler',quietly=TRUE))stop('缺少clusterProfiler；请运行2.0依赖安装器')
 dbn<-species_db(p$meta$species);if(!requireNamespace(dbn,quietly=TRUE))stop(paste0('缺少物种注释包',dbn))
 db<-getExportedValue(dbn,dbn); rows<-norm_rows(p$results);if(!nrow(rows))stop('没有差异结果')
 rows$fdr<-as.numeric(rows$fdr);rows$log2FC<-as.numeric(rows$log2FC);ids<-unique(as.character(rows$featureId[rows$fdr<as.numeric(p$settings$fdr %||% .05)]));allids<-unique(as.character(rows$featureId))
 from<-if(all(grepl('^ENS',allids)))'ENSEMBL' else if(all(grepl('^[0-9]+$',allids)))'ENTREZID' else 'SYMBOL'
 conv<-clusterProfiler::bitr(ids,fromType=from,toType='ENTREZID',OrgDb=db);universe<-clusterProfiler::bitr(allids,fromType=from,toType='ENTREZID',OrgDb=db)
 if(!nrow(conv))stop('基因ID无法映射；请确认物种及ID类型')
 if(method=='go')o<-clusterProfiler::enrichGO(conv$ENTREZID,OrgDb=db,keyType='ENTREZID',ont='ALL',universe=universe$ENTREZID,pAdjustMethod='BH',readable=TRUE)
 else if(method=='kegg')o<-clusterProfiler::enrichKEGG(conv$ENTREZID,organism=species_kegg(p$meta$species),universe=universe$ENTREZID,pAdjustMethod='BH')
 else {ranked<-rows$log2FC;names(ranked)<-rows$featureId;ranked<-sort(tapply(ranked,names(ranked),mean,na.rm=TRUE),decreasing=TRUE);cv<-clusterProfiler::bitr(names(ranked),fromType=from,toType='ENTREZID',OrgDb=db);ranked<-ranked[match(cv[[from]],names(ranked))];names(ranked)<-cv$ENTREZID;ranked<-sort(ranked[is.finite(ranked)],decreasing=TRUE);o<-clusterProfiler::gseKEGG(ranked,organism=species_kegg(p$meta$species),pAdjustMethod='BH',verbose=FALSE)}
 tab<-as.data.frame(o);pack(method,paste('clusterProfiler',as.character(packageVersion('clusterProfiler'))),list(inputGenes=length(ids),mappedGenes=nrow(conv),terms=nrow(tab),idType=from),list(enrichment=tab),if(nrow(conv)<length(ids)*.5)'基因ID映射率低于50%，需复核注释' else character())
}
`%||%` <- function(a,b)if(is.null(a))b else a
wgcna <- function(){
 if(!requireNamespace('WGCNA',quietly=TRUE))stop('缺少WGCNA；请运行2.0依赖安装器')
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
 traits<-model.matrix(~0+factor(samples$group[match(rownames(x),samples$id)]));colnames(traits)<-sub('factor\\(samples\\$group\\[match\\(rownames\\(x\\), samples\\$id\\)\\])','',colnames(traits))
 corv<-WGCNA::cor(net$MEs,traits,use='p');pv<-WGCNA::corPvalueStudent(corv,nrow(x));mt<-expand.grid(module=rownames(corv),trait=colnames(corv),stringsAsFactors=FALSE);mt$correlation<-as.vector(corv);mt$pValue<-as.vector(pv);mt$fdr<-p.adjust(mt$pValue,'BH')
 pack('wgcna',paste('WGCNA',as.character(packageVersion('WGCNA'))),list(samples=nrow(x),features=ncol(x),softPower=chosen,modules=length(unique(net$colors))),list(soft_threshold=fit,module_membership=genes,module_trait=mt),if(nrow(x)<30)'样本量少于30，结果标记为探索性并需重采样验证' else character())
}
out<-if(method%in%c('go','kegg','gsea'))enrich() else if(method=='wgcna')wgcna() else stop('未知R高级分析方法')
jsonlite::write_json(out,args[2],auto_unbox=TRUE,pretty=TRUE,na='null',dataframe='rows')
