required <- c("DESeq2", "edgeR", "limma", "ANCOMBC", "ALDEx2")
status <- vapply(required, requireNamespace, quietly=TRUE, FUN.VALUE=logical(1))
items <- paste(sprintf('"%s":%s', names(status), ifelse(status, 'true', 'false')), collapse=',')
cat(paste0('{', items, '}'))
