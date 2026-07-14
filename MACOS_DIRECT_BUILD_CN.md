# macOS直接运行版生成说明

当前源码所在构建环境是Linux，不能在这里真实编译或验收macOS二进制。

在Mac上：

1. 解压源码包。
2. 如果系统阻止脚本执行，在终端运行：
   `chmod +x Build-TSR-Studio-macOS.command`
3. 双击 `Build-TSR-Studio-macOS.command`。
4. 完成后，桌面目录会出现与本机架构对应的DMG和ZIP。

Apple Silicon生成arm64版本，Intel Mac生成x64版本。当前为未签名研究构建，首次
启动需Control+点击后选择“打开”。要消除Gatekeeper提示，必须使用有效的Apple
Developer ID证书完成代码签名，并通过Apple公证服务；证书不能伪造或包含在源码中。
