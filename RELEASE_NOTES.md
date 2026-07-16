# TSR Studio 0.6 Beta

Adds bulk group mapping, automated Markdown research reports, runtime/audit manifests, and unsigned Windows/macOS build workflows while retaining comprehensive statistics, figure packages, and evidence-graded integration networks. R UI routing, bundled runtimes, advanced metabolomics QC, and platform signing remain explicit post-Beta work.
# TSR Studio 2.1.1

- 表型指标不再套用组学火山图；每个指标独立输出全组Tukey箱线图、个体散点和主要比较FDR括号。
- 每个表型指标新增两两比较效应图，明确标注组A、组B、均值、B−A方向、Hedges g、P值、FDR及是否为给药组间比较。
- 表型图均附逐样本源数据、全量比较表和可直接用于论文方法部分的图注。

# TSR Studio 2.1.0

- 调控网络支持选择给药组、Top 10/20/24/30/50 逆转分子、Top 5/10/15/20/30 功能通路。
- 网络证据可在探索性两阶段 P 值和严格两阶段 FDR 之间切换，导出包保留完整节点、完整边与作图参数。
- 论文图包新增差异数量汇总、跨比较效应矩阵和不同给药组恢复汇总图，并为每图附源数据和图注。
- GO、KEGG、GSEA、WGCNA和机器学习图仍只在相应深度分析真实运行后导出，避免生成伪结果。

# TSR Studio 2.0.3

- 火山图增加上调/下调/未达阈值分色、FDR金色描边和显著数量图例。
- 火山图增加 `P=0.05` 与 `|log₂FC|=0.58` 参考线，并对上下调候选名称自动避让和添加引线。
- 多组学上下游网络将功能/通路拆分为独立节点，默认显示 Top 15 通路和 Top 24 逆转分子。
- 网络图画布高度按最大节点层自适应，修复右侧文字堆叠、越界和 PNG 裁切。
