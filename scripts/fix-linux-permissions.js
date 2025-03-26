import fs from 'node:fs';
import path from 'node:path';

export default async function fixLinuxPermissions(context) {
  const { packager } = context;
  const platform = packager.platform.nodeName;
  if (platform !== 'linux') {
    return;
  }

  const { appOutDir } = context;
  const ffprobePath = path.join(
    appOutDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
    '@ffprobe-installer',
    'linux-x64',
    'ffprobe'
  );

  try {
    // 检查文件是否存在
    if (fs.existsSync(ffprobePath)) {
      // 添加执行权限
      fs.chmodSync(ffprobePath, '755');
      console.info('Successfully added execute permission to ffprobe');
    } else {
      console.warn('ffprobe not found in resources directory');
    }
  } catch (error) {
    console.error('Error fixing ffprobe permissions:', error);
  }
} 