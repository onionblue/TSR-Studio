# TSR Studio 1.0.1 安装包审查与修复记录

## 原1.0.0安装包确认的问题

1. `runtime-manifest.json`明确标记R和Python均未内置；“一键版”不是完整离线计算包。
2. macOS与Windows构建流程只执行`npm ci/build/electron-builder`，没有部署R、Python及统计包。
3. 运行环境检测只探测R命令是否存在，不验证DESeq2、limma和edgeR。
4. R/Python分析脚本被列入应用归档，外部R/Python进程可能无法读取归档内路径。
5. 后端失败仍创建`failedResult`并进入结果页，因此出现“阻断、0条差异、0条描述统计”的假结果卡片。
6. macOS包没有Developer ID签名和Apple公证，下载后可能被Gatekeeper提示“已损坏”。
7. Vina与GROMACS没有内置；相关页面只是外部程序调用入口，不应描述为完整离线能力。
8. PubChem与Open Targets功能依赖网络，不属于离线功能。

## 1.0.1修复

1. R、Python和分析脚本通过`extraResources`放置于应用真实资源目录，不再封入ASAR。
2. 新增完整构建工作流：在对应架构运行器上安装并复制R 4.4、DESeq2、limma、edgeR、Python 3.11、pandas、SciPy和scikit-learn。
3. macOS使用GitHub官方`macos-14` Apple Silicon运行器，避免Intel运行时混入ARM64应用。
4. 启动检测同时验证运行时和正式统计依赖。
5. 后端失败时停留在任务页，不生成、不保存、不导出“0条结果”。
6. 构建后执行临时ad-hoc签名及`codesign --verify`；正式免提示分发仍需Developer ID及Apple公证。
7. 构建任务检查安装目录内确实存在Rscript，缺失则构建失败，不上传伪离线安装包。

## 能力边界

- 转录组与蛋白组：完整包内置R核心统计环境。
- 代谢组等Python模块：完整包内置Python科学计算环境。
- 分子对接与分子动力学：仍需另行封装Vina/GROMACS，1.0.1不冒充已内置。
- PubChem/Open Targets：需要网络。
- 未使用Apple Developer ID的构建：首次打开仍可能需要右键“打开”或移除隔离属性。
