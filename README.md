# TSR Studio 1.0.0 Research Release

1.0把真实数据统计、成分身份、活性靶标、疾病证据、对接、动力学、发表门控和论文交付收拢为同一条可审计研究管线。

## 本版完成

- 原始组名到研究设计组的批量映射
- 行为学与蛋白组真实Excel自动整形
- 蛋白组四组全比较、PCA、效应量、BH-FDR和逆转分层
- 代谢组定量矩阵基础入口；缺失率、log₂转换、PCA和基础差异统计
- Electron—R—DESeq2桌面路由；显式生成模型vs空白及给药vs模型contrast，缺失依赖时禁止用普通t检验替代
- raw counts整数检查；TPM/FPKM阻断；NA padj按未显著处理，避免假阳性
- Python/R运行环境一键检测
- 全量Excel、论文图包、多组学候选网络与Markdown自动报告
- 项目设计、QC、方法、结果、限制和文件审计记录
- Windows NSIS/portable与macOS DMG/ZIP未签名构建工作流
- Windows与macOS分别部署R/DESeq2/limma/edgeR的原生脚本
- Windows、Intel macOS、Apple Silicon macOS的自动构建矩阵
- “成分确认—多组学—靶标筛选—成分靶标排序—对接—动力学—论文交付”条件门控页面
- PubChem CAS/CID/SMILES身份补全，并保存查询来源
- Open Targets疾病实体检索及前500条靶标关联同步；只对本研究候选交叉加权
- 可解释的活性成分和活性靶标评分，不产生无证据全排列网络
- AutoDock Vina实际任务、PDBQT构象保存、所有模式评分解析
- GROMACS生产期`mdrun`、CPT断点续算以及RMSD/RMSF/Rg/SASA/氢键解析
- 对接与动力学Excel全量源数据、SVG、600 dpi PNG和逐图图注
- 蛋白组R/limma经验贝叶斯正式统计路由；转录组保持R/DESeq2计数模型
- 发表就绪门控：研究设计、重复数、样本追溯、QC、模型、分析完整性、成分身份、数据库时间戳、活性靶标与结构验证
- 发表门控明细同时进入界面、完整Excel和自动研究报告
- 0.1—0.5项目迁移到0.6

## 尚未宣称完成

- Windows/macOS原生脚本已提供，但仍须在对应操作系统运行并验收；当前环境不能替代原生验收
- 代谢组QC-RLSC漂移校正和注释置信度尚未实现
- 蛋白组limma/MSstats模型尚未封装，当前为Python Welch Beta流程
- Windows代码签名、macOS签名与公证未执行
- Python/R仍使用系统运行时，未封装进安装包
- ID统一目前基于Gene/Protein/Feature字段，尚无在线数据库版本化映射
- 受体、配体、力场、电荷、溶剂、离子和平衡流程仍需研究者审查；软件不会替研究者自动选择这些关键方法
- 当前Vina为单个候选对验证流程，尚未加入大规模批量队列与暂停恢复
- 疾病证据来源与查询时间已记录，但跨数据库去重和文献全文人工复核仍需继续完善

因此0.6是可测试Beta源码，不是已验证的临床或商业发布版。
