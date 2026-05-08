const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'storage.db');

if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS file_metadata (
      path TEXT PRIMARY KEY,
      size INTEGER,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

async function updateFileCount(count) {
  return new Promise((resolve, reject) => {
    db.run('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)', 
      ['file_count', count.toString()], 
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

async function getTotalSize(uploadDir) {
  let totalSize = 0;
  
  const calculateSize = (dir) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        calculateSize(fullPath);
      } else {
        totalSize += stat.size;
      }
    }
  };
  
  calculateSize(uploadDir);
  return totalSize;
}

module.exports = {
  updateFileCount,
  getTotalSize
};