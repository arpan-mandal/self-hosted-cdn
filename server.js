require('dotenv').config();
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 104857600; // 100MB
const UPLOAD_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    httpOnly: true,
    maxAge: 86400000
  }
}));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${timestamp}-${random}-${sanitized}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: MAX_FILE_SIZE }
});

// Auth middleware
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

function calculateTotalStorage() {
  let totalSize = 0;
  
  const calculateSize = (dir) => {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          calculateSize(itemPath);
        } else {
          totalSize += stat.size;
        }
      }
    } catch (err) {
      console.error('Error calculating size:', err);
    }
  };
  
  calculateSize(UPLOAD_DIR);
  return totalSize;
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === process.env.ADMIN_USERNAME && 
      password === process.env.ADMIN_PASSWORD) {
    req.session.userId = 'admin';
    req.session.username = username;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/check-auth', (req, res) => {
  res.json({ authenticated: !!req.session.userId });
});

app.get('/api/files/*', requireAuth, async (req, res) => {
  let filePath = decodeURIComponent(req.params[0] || '');
  
  if (filePath.startsWith('/')) filePath = filePath.substring(1);
  if (filePath.includes('..')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  const fullPath = path.join(UPLOAD_DIR, filePath);
  
  try {
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Not found' });
    }
    
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      const files = fs.readdirSync(fullPath);
      const items = [];
      
      for (const file of files) {
        const itemPath = path.join(fullPath, file);
        const itemStat = fs.statSync(itemPath);
        const relativePath = filePath ? path.join(filePath, file) : file;
        
        items.push({
          name: file,
          path: relativePath,
          isDirectory: itemStat.isDirectory(),
          size: itemStat.size,
          modified: itemStat.mtime
        });
      }
      
      items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      
      const totalStorage = calculateTotalStorage();
      
      res.json({
        currentPath: filePath,
        items: items,
        totalStorage: totalStorage
      });
    } else {
      res.json({
        isFile: true,
        path: filePath,
        size: stat.size
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const targetPath = req.body.currentPath || '';
  const targetDir = path.join(UPLOAD_DIR, targetPath);
  const originalFilename = req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
  const targetFile = path.join(targetDir, originalFilename);
  
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  try {
    let finalPath = targetFile;
    let counter = 1;
    while (fs.existsSync(finalPath)) {
      const ext = path.extname(originalFilename);
      const basename = path.basename(originalFilename, ext);
      finalPath = path.join(targetDir, `${basename} (${counter})${ext}`);
      counter++;
    }
    
    fs.renameSync(req.file.path, finalPath);
    
    res.json({ 
      success: true, 
      file: {
        name: path.basename(finalPath),
        path: targetPath ? path.join(targetPath, path.basename(finalPath)) : path.basename(finalPath)
      }
    });
  } catch (error) {
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to save file' });
  }
});

app.get('/api/download/*', requireAuth, (req, res) => {
  let filePath = decodeURIComponent(req.params[0]);
  if (filePath.startsWith('/')) filePath = filePath.substring(1);
  if (filePath.includes('..')) {
    return res.status(403).send('Forbidden');
  }
  
  const fullPath = path.join(UPLOAD_DIR, filePath);
  
  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    return res.status(404).send('File not found');
  }
  
  res.download(fullPath, path.basename(fullPath));
});

app.get('/api/share/*', (req, res) => {
  let filePath = decodeURIComponent(req.params[0]);
  if (filePath.startsWith('/')) filePath = filePath.substring(1);
  if (filePath.includes('..')) {
    return res.status(403).send('Forbidden');
  }
  
  const fullPath = path.join(UPLOAD_DIR, filePath);
  
  if (!fs.existsSync(fullPath)) {
    return res.status(404).send('File not found');
  }
  
  if (fs.statSync(fullPath).isDirectory()) {
    return res.status(400).send('Cannot share directories');
  }
  
  res.download(fullPath, path.basename(fullPath));
});

app.post('/api/create-folder', requireAuth, async (req, res) => {
  const { currentPath, folderName } = req.body;
  
  if (!folderName || folderName.match(/[\\/]/) || folderName.includes('..')) {
    return res.status(400).json({ error: 'Invalid folder name' });
  }
  
  const folderPath = path.join(UPLOAD_DIR, currentPath || '', folderName);
  
  if (!folderPath.startsWith(UPLOAD_DIR)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  if (fs.existsSync(folderPath)) {
    return res.status(400).json({ error: 'Folder already exists' });
  }
  
  try {
    fs.mkdirSync(folderPath, { recursive: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

app.put('/api/rename', requireAuth, async (req, res) => {
  const { oldPath, newName, isDirectory } = req.body;
  
  if (!newName || newName.match(/[\\/]/) || newName.includes('..')) {
    return res.status(400).json({ error: 'Invalid name' });
  }
  
  const oldFullPath = path.join(UPLOAD_DIR, oldPath);
  const newFullPath = path.join(path.dirname(oldFullPath), newName);
  
  if (!oldFullPath.startsWith(UPLOAD_DIR) || !newFullPath.startsWith(UPLOAD_DIR)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  if (!fs.existsSync(oldFullPath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  if (fs.existsSync(newFullPath)) {
    return res.status(400).json({ error: 'Name already exists' });
  }
  
  try {
    fs.renameSync(oldFullPath, newFullPath);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Rename failed' });
  }
});

app.delete('/api/delete', requireAuth, async (req, res) => {
  const { path: itemPath, isDirectory } = req.body;
  
  if (itemPath.includes('..')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  const fullPath = path.join(UPLOAD_DIR, itemPath);
  
  if (!fullPath.startsWith(UPLOAD_DIR)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  const deleteRecursive = (p) => {
    if (fs.statSync(p).isDirectory()) {
      fs.readdirSync(p).forEach(file => {
        deleteRecursive(path.join(p, file));
      });
      fs.rmdirSync(p);
    } else {
      fs.unlinkSync(p);
    }
  };
  
  try {
    deleteRecursive(fullPath);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

setInterval(() => {
  try {
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(TEMP_DIR, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > 3600000) {
        fs.unlinkSync(filePath);
      }
    });
  } catch (err) {
    console.error('Temp cleanup error:', err);
  }
}, 3600000);

app.listen(PORT, () => {
  console.log(`Storage hosting server online!`);
});