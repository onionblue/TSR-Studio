# TSR Studio 1.0.1 完整离线安装包构建

1. 将本压缩包全部内容上传到GitHub仓库根目录。
2. 打开仓库的 **Actions**。
3. 左侧选择 **Build TSR Studio 1.0.1 full offline installers**。
4. 点击 **Run workflow**。
5. 等待macOS和Windows两个任务均显示绿色对勾。
6. 在运行页面底部 **Artifacts** 下载：
   - `TSR-Studio-1.0.1-macOS-Apple-Silicon-arm64-full-offline`
   - `TSR-Studio-1.0.1-Windows-x64-full-offline`

不要再运行旧的`Build Windows and macOS installers`工作流；旧流程不会内置R和Python。

安装后先进入“分析任务”，点击“检测运行环境”。R显示`available:true`、`dependencies:true`后才运行转录组/蛋白组分析。若macOS显示R不可用，点击“安装/修复macOS R环境”，完成后完全退出并重新打开应用再检测。
