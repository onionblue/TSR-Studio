# 上传GitHub并生成Windows/macOS程序

## 上传源码

1. 在GitHub新建空仓库，例如 `TSR-Studio`。
2. 解压 `TSR_Studio_1.0.0_GitHub_Repository.zip`。
3. 在仓库网页选择 **Add file → Upload files**。
4. 将解压目录中的全部文件和目录拖入网页，包括隐藏目录 `.github`。
5. 提交上传。

如果网页无法上传隐藏目录，推荐使用GitHub Desktop：选择 **Add an Existing
Repository from your Hard Drive**，再发布仓库。

## 手动生成安装程序

1. 打开仓库的 **Actions** 页面。
2. 选择 **Build Windows and macOS installers**。
3. 点击 **Run workflow**。
4. 等待三个构建任务完成。
5. 在该次运行页面底部下载 Artifacts：
   - `TSR-Studio-1.0-Windows-x64-unsigned`
   - `TSR-Studio-1.0-macOS-Intel-x64-unsigned`
   - `TSR-Studio-1.0-macOS-Apple-Silicon-arm64-unsigned`

## 自动建立Release

在GitHub网页创建并推送形如 `v1.0.0` 的标签后，工作流会构建三个平台并自动
创建GitHub Release，将安装程序放入Release下载区。

## 重要说明

生成的是未签名研究版本。Windows可能显示SmartScreen提示；macOS首次需按住
Control点击应用并选择“打开”。消除提示需要Windows代码签名证书、Apple
Developer ID证书及Apple公证，不能通过普通GitHub Actions伪造。

R、AutoDock Vina和GROMACS属于外部科学运行时，不会自动封装进Electron安装包。
安装软件后仍需按README部署对应运行时。
