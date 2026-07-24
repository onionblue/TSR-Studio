# TSR Studio 3.0.1 完善说明

本交付以用户提供的 TSR Studio 3.0.1 完整源码为唯一基线，未回退到 2.0.2 或其他旧版本。

## 本次修复

1. 统一界面、报告、Excel、论文图包、深度分析图包和调控网络包中的版本号为 3.0.1。
2. 合并 macOS 本地构建修复：构建过程转移到 Mac 内部临时目录，过滤 `._*` 与 `.DS_Store`，避免移动硬盘产生的 AppleDouble 文件导致封装阶段 ENOENT 或“应用已损坏”。
3. 保留完整 R 依赖安装范围：DESeq2、limma、edgeR、jsonlite、WGCNA、clusterProfiler 以及小鼠、大鼠和人类注释库。
4. 修复 GSEA 对带版本号 Ensembl ID 的处理，统一去除末尾版本号、去重并验证映射数量；不足时明确停止，不生成伪结果。
5. 论文图包和多组学调控网络包新增 `Export_Validation.tsv`，逐图记录 SVG、PNG、源数据、图注、画布宽高、节点和边数量；PNG失败不再静默隐藏。
6. 热图新增连续 Z-score 色标和样本分组色带，图注同步解释颜色含义。
7. 调控网络继续使用内容驱动的自适应高度，并保留用户可选的给药组、逆转分子数量、通路数量和 P/FDR 证据阈值。
8. 新增 `npm run validate:release` 发布前自动校验，检查版本、作者、隐藏文件过滤、R 依赖、图件校验清单、热图图例及网络自适应画布。

## 已验证

- `npm run build`：通过。
- `npm run validate:release`：11 项全部通过。
- macOS 双击构建脚本及 R 安装脚本语法检查：通过。

## 使用顺序

1. 解压到 Mac 内置磁盘普通文件夹，不要直接在 ZIP、DMG、U盘或移动硬盘内构建。
2. 双击 `Build-TSR-Studio-macOS.command`。脚本会自动在内部临时目录构建，再把 DMG 和 ZIP 输出到桌面。
3. 若 R 环境不完整，双击 `scripts/Install_TSR_R_Runtime_macOS.command`，完成后彻底退出并重开软件。
4. Windows 双击 `Build-TSR-Studio-Windows.bat` 构建安装包；如缺少 R 或统计依赖，双击 `scripts/Install_TSR_R_Runtime_Windows.bat` 自动安装并核验 DESeq2、limma、edgeR、jsonlite、WGCNA、clusterProfiler 及三套物种注释库。

## 双平台交付边界

- 源码、构建入口、资源路径和依赖安装入口已同时覆盖 macOS Apple Silicon（arm64）与 Windows x64。
- 已完成 Web 生产构建、13 项发布静态校验和 macOS Shell 语法校验。
- 由于当前构建环境不是实际 macOS/Windows 终端，DMG 与 EXE 的真实安装、首次启动、系统安全提示和完整分析运行仍须分别在目标电脑上完成验收；不得把静态校验等同于目标机验收。
5. 正式出图后先查看图包内 `Export_Validation.tsv`；状态为 `FAILED` 的 PNG 不应直接用于论文，应优先使用同名 SVG 并重新导出。
