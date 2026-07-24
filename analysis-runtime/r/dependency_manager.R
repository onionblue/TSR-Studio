args <- commandArgs(trailingOnly=TRUE)
esc <- function(x) gsub('"','\\\\"',gsub('\\\\','\\\\\\\\',as.character(x),fixed=TRUE),fixed=TRUE)
json_vec <- function(x) paste0('[',paste(sprintf('"%s"',esc(x)),collapse=','),']')

catalog <- list(
  core=c("DESeq2","limma","edgeR","jsonlite"),
  enrichment=c("clusterProfiler","org.Mm.eg.db","org.Rn.eg.db","org.Hs.eg.db"),
  wgcna=c("WGCNA"),
  integrative=c("MOFA2","mixOmics","basilisk")
)
all_packages <- unique(unlist(catalog, use.names=FALSE))
selected <- if (length(args) >= 2 && nzchar(args[2])) unique(strsplit(args[2], ",", fixed=TRUE)[[1]]) else all_packages
selected <- intersect(selected, all_packages)

status_table <- function() {
  data.frame(
    package=all_packages,
    installed=vapply(all_packages, requireNamespace, logical(1), quietly=TRUE),
    version=vapply(all_packages, function(x) if(requireNamespace(x,quietly=TRUE)) as.character(utils::packageVersion(x)) else "", character(1)),
    category=vapply(all_packages, function(x) names(catalog)[vapply(catalog,function(z)x %in% z,logical(1))][1], character(1)),
    stringsAsFactors=FALSE
  )
}

if (identical(args[1], "install")) {
  options(repos=c(CRAN="https://cloud.r-project.org"))
  dir.create(Sys.getenv("R_LIBS_USER"), recursive=TRUE, showWarnings=FALSE)
  .libPaths(unique(c(Sys.getenv("R_LIBS_USER"), .libPaths())))
  if (!requireNamespace("BiocManager", quietly=TRUE)) utils::install.packages("BiocManager", quiet=FALSE)
  before <- status_table()
  missing <- intersect(selected, before$package[!before$installed])
  if (length(missing)) BiocManager::install(missing, ask=FALSE, update=FALSE, quiet=FALSE)
  after <- status_table()
  failed <- intersect(selected, after$package[!after$installed])
  if (!requireNamespace("jsonlite", quietly=TRUE)) {
    cat(sprintf('{"ok":%s,"installedCount":%d,"failed":[%s]}',if(length(failed))'false' else 'true',sum(after$installed)-sum(before$installed),paste(sprintf('"%s"',failed),collapse=',')))
  } else {
    cat(jsonlite::toJSON(list(ok=!length(failed),installedCount=sum(after$installed)-sum(before$installed),requested=selected,failed=failed,packages=after),auto_unbox=TRUE,dataframe="rows"))
  }
  quit(status=if(length(failed)) 3 else 0)
}

st <- status_table()
modules <- lapply(names(catalog), function(n) {
  p <- catalog[[n]]; z <- st[match(p,st$package),,drop=FALSE]
  list(id=n, required=p, installed=z$package[z$installed], missing=z$package[!z$installed], ready=all(z$installed))
})
names(modules) <- names(catalog)
package_json <- paste(vapply(seq_len(nrow(st)),function(i)sprintf('{"package":"%s","installed":%s,"version":"%s","category":"%s"}',esc(st$package[i]),if(st$installed[i])'true' else 'false',esc(st$version[i]),esc(st$category[i])),character(1)),collapse=',')
module_json <- paste(vapply(names(modules),function(n){m<-modules[[n]];sprintf('"%s":{"id":"%s","required":%s,"installed":%s,"missing":%s,"ready":%s}',esc(n),esc(n),json_vec(m$required),json_vec(m$installed),json_vec(m$missing),if(m$ready)'true' else 'false')},character(1)),collapse=',')
cat(sprintf('{"ok":true,"rVersion":"%s","libraryPaths":%s,"packages":[%s],"modules":{%s}}',esc(R.version.string),json_vec(.libPaths()),package_json,module_json))
