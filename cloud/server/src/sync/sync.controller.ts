import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import { syncRateMiddleware, syncQuotaMiddleware } from './sync.middleware';
import * as syncService from './sync.service';
import { validateSyncPath } from '../utils/validator';

const router = Router();
router.use(authMiddleware);

// 上传文件
router.post('/upload', syncRateMiddleware, syncQuotaMiddleware, async (req: Request, res: Response) => {
  const { filePath, content } = req.body;
  const userId = (req as any).userId;

  if (!filePath || !content) {
    res.status(400).json({ error: 'filePath 和 content 为必填项' });
    return;
  }
  if (!validateSyncPath(filePath as string)) {
    res.status(400).json({ error: '文件路径包含非法字符' });
    return;
  }

  try {
    const buffer = Buffer.from(content, 'base64');
    await syncService.uploadFile(userId, filePath as string, buffer);
    res.json({ message: '上传成功', path: filePath });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '上传失败' });
  }
});

// 下载文件
router.get('/download', async (req: Request, res: Response) => {
  const filePath = req.query.path as string;
  const userId = (req as any).userId;

  if (!filePath || !validateSyncPath(filePath)) {
    res.status(400).json({ error: '文件路径为空或包含非法字符' });
    return;
  }

  try {
    const content = await syncService.downloadFile(userId, filePath);
    if (!content) {
      res.status(404).json({ error: '文件不存在' });
      return;
    }
    res.json({ path: filePath, content: content.toString('base64') });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '下载失败' });
  }
});

// 文件列表
router.get('/files', (req: Request, res: Response) => {
  const userId = (req as any).userId;
  syncService.listFiles(userId)
    .then(files => res.json(files))
    .catch(() => res.status(500).json({ error: '获取文件列表失败' }));
});

// 删除文件
router.delete('/files', async (req: Request, res: Response) => {
  const filePath = req.body.filePath as string;
  const userId = (req as any).userId;

  if (!filePath || !validateSyncPath(filePath)) {
    res.status(400).json({ error: '文件路径为空或包含非法字符' });
    return;
  }

  try {
    await syncService.deleteFile(userId, filePath);
    res.json({ message: '删除成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '删除失败' });
  }
});

export { router as syncRoutes };