const {execFileSync}=require('child_process');
module.exports=async context=>{
  if(context.electronPlatformName!=='darwin')return;
  const appPath=`${context.appOutDir}/${context.packager.appInfo.productFilename}.app`;
  execFileSync('/usr/bin/codesign',['--force','--deep','--sign','-',appPath],{stdio:'inherit'});
  execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',appPath],{stdio:'inherit'});
};
