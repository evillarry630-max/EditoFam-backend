const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

// Initialize SQLite database
const db = new sqlite3.Database(path.join(__dirname, 'editofam.db'), (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      caption TEXT,
      fileName TEXT NOT NULL,
      filePath TEXT NOT NULL,
      uploader TEXT NOT NULL,
      isPublic INTEGER DEFAULT 1,
      views INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      videoId TEXT NOT NULL,
      author TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (videoId) REFERENCES videos(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS likes (
      id TEXT PRIMARY KEY,
      videoId TEXT NOT NULL,
      userName TEXT NOT NULL,
      FOREIGN KEY (videoId) REFERENCES videos(id)
    )
  `);
}

// Routes

// Get all videos
app.get('/api/videos', (req, res) => {
  db.all('SELECT * FROM videos WHERE isPublic = 1 ORDER BY uploadedAt DESC', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get user's videos
app.get('/api/videos/user/:userName', (req, res) => {
  const { userName } = req.params;
  db.all('SELECT * FROM videos WHERE uploader = ? ORDER BY uploadedAt DESC', [userName], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get single video
app.get('/api/videos/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM videos WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Video not found' });
    }
    res.json(row);
  });
});

// Upload video
app.post('/api/videos/upload', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  const { title, caption, uploader, isPublic } = req.body;
  const videoId = uuidv4();
  const filePath = `/uploads/${req.file.filename}`;

  db.run(
    'INSERT INTO videos (id, title, caption, fileName, filePath, uploader, isPublic) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [videoId, title, caption || '', req.file.originalname, filePath, uploader, isPublic === 'true' ? 1 : 0],
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: videoId, filePath });
    }
  );
});

// Stream video file
app.get('/uploads/:filename', (req, res) => {
  const filePath = path.join(uploadsDir, req.params.filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': 'video/mp4'
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4'
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// Like/Unlike video
app.post('/api/videos/:id/like', (req, res) => {
  const { id } = req.params;
  const { userName } = req.body;

  // Check if already liked
  db.get('SELECT * FROM likes WHERE videoId = ? AND userName = ?', [id, userName], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (row) {
      // Unlike
      db.run('DELETE FROM likes WHERE videoId = ? AND userName = ?', [id, userName], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.run('UPDATE videos SET likes = likes - 1 WHERE id = ?', [id], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ liked: false });
        });
      });
    } else {
      // Like
      const likeId = uuidv4();
      db.run('INSERT INTO likes (id, videoId, userName) VALUES (?, ?, ?)', [likeId, id, userName], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.run('UPDATE videos SET likes = likes + 1 WHERE id = ?', [id], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ liked: true });
        });
      });
    }
  });
});

// Add comment
app.post('/api/videos/:id/comments', (req, res) => {
  const { id } = req.params;
  const { author, text } = req.body;
  const commentId = uuidv4();

  db.run(
    'INSERT INTO comments (id, videoId, author, text) VALUES (?, ?, ?, ?)',
    [commentId, id, author, text],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: commentId });
    }
  );
});

// Get comments
app.get('/api/videos/:id/comments', (req, res) => {
  const { id } = req.params;
  db.all('SELECT * FROM comments WHERE videoId = ? ORDER BY timestamp DESC', [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Increment view count
app.post('/api/videos/:id/view', (req, res) => {
  const { id } = req.params;
  db.run('UPDATE videos SET views = views + 1 WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// Start server
app.listen(PORT, () => {
  console.log(`EditoFam backend running on http://localhost:${PORT}`);
});
