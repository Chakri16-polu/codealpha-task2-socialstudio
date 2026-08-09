const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbFile = path.join(__dirname, 'social.db');
const db = new sqlite3.Database(dbFile);

db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA journal_mode = WAL');

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    displayName TEXT NOT NULL,
    passwordHash TEXT NOT NULL,
    bio TEXT DEFAULT ''
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    content TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    postId INTEGER NOT NULL,
    userId INTEGER NOT NULL,
    content TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(postId) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    followerId INTEGER NOT NULL,
    followeeId INTEGER NOT NULL,
    UNIQUE(followerId, followeeId),
    FOREIGN KEY(followerId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(followeeId) REFERENCES users(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    postId INTEGER NOT NULL,
    UNIQUE(userId, postId),
    FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(postId) REFERENCES posts(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    actorId INTEGER NOT NULL,
    type TEXT NOT NULL,
    postId INTEGER,
    message TEXT NOT NULL,
    readAt TEXT,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(actorId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(postId) REFERENCES posts(id) ON DELETE CASCADE
  )`);

  // Helpful indexes keep the feed responsive as the database grows.
  db.run('CREATE INDEX IF NOT EXISTS idx_posts_createdAt ON posts(createdAt)');
  db.run('CREATE INDEX IF NOT EXISTS idx_comments_postId ON comments(postId)');
  db.run('CREATE INDEX IF NOT EXISTS idx_notifications_userId ON notifications(userId)');

  // Keep the demo account available even when a database already contains real users.
  db.get('SELECT username FROM users WHERE username = ?', ['arjun.dev'], async (err, row) => {
    if (err || row) return;
    const passwordHash = await bcrypt.hash('Demo@1234', 12);
    const demoUsers = [
      ['maya.design', 'Maya Chen', 'Product designer building calm, useful digital experiences.'],
      ['arjun.dev', 'Arjun Rao', 'Full-stack developer • coffee • clean code.'],
      ['sara.codes', 'Sara Williams', 'CS student sharing projects, ideas and learning notes.'],
    ];
    const ids = {};
    for (const [username, displayName, bio] of demoUsers) {
      await new Promise((resolve) => db.run(
        'INSERT OR IGNORE INTO users (username, displayName, passwordHash, bio) VALUES (?, ?, ?, ?)',
        [username, displayName, passwordHash, bio],
        function () { ids[username] = this.lastID; resolve(); }
      ));
      if (!ids[username]) {
        const existing = await new Promise((resolve) => db.get('SELECT id FROM users WHERE username = ?', [username], (e, r) => resolve(r)));
        ids[username] = existing?.id;
      }
    }

    const demoPosts = [
      ['maya.design', 'Just shipped a small redesign that makes onboarding feel much simpler. Small details create big moments. ✨', '-3 hours'],
      ['arjun.dev', 'Today\'s reminder: write code that your future self will thank you for.', '-2 hours'],
      ['sara.codes', 'Building in public is scary at first — then you realize progress is more exciting than perfection. 🚀', '-1 hours'],
    ];
    for (const [username, content, offset] of demoPosts) {
      const userId = ids[username];
      if (!userId) continue;
      const exists = await new Promise((resolve) => db.get('SELECT id FROM posts WHERE userId = ? LIMIT 1', [userId], (e, r) => resolve(r)));
      if (!exists) {
        await new Promise((resolve) => db.run('INSERT INTO posts (userId, content, createdAt) VALUES (?, ?, datetime("now", ?))', [userId, content, offset], resolve));
      }
    }
    if (ids['arjun.dev'] && ids['maya.design']) db.run('INSERT OR IGNORE INTO follows (followerId, followeeId) VALUES (?, ?)', [ids['arjun.dev'], ids['maya.design']]);
    if (ids['sara.codes'] && ids['arjun.dev']) db.run('INSERT OR IGNORE INTO follows (followerId, followeeId) VALUES (?, ?)', [ids['sara.codes'], ids['arjun.dev']]);
  });
});

module.exports = db;
