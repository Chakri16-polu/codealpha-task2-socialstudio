const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');
const { promisify } = require('util');

const dbGet = promisify(db.get.bind(db));
const dbAll = promisify(db.all.bind(db));
const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-this-local-secret-before-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    },
  })
);
app.use(express.static(path.join(__dirname, 'public')));

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function requireAuth(req, res, next) {
  if (req.session.userId) return next();
  return res.status(401).json({ error: 'Please sign in to continue.' });
}

function getId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function cleanText(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function serializeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio || '',
  };
}

async function getUserWithStats(userId) {
  const user = await dbGet('SELECT id, username, displayName, bio FROM users WHERE id = ?', [userId]);
  if (!user) return null;
  const followers = await dbGet('SELECT COUNT(*) AS count FROM follows WHERE followeeId = ?', [userId]);
  const following = await dbGet('SELECT COUNT(*) AS count FROM follows WHERE followerId = ?', [userId]);
  const posts = await dbGet('SELECT COUNT(*) AS count FROM posts WHERE userId = ?', [userId]);
  return { ...serializeUser(user), followers: followers.count, following: following.count, posts: posts.count };
}

async function notify(userId, type, actorId, postId = null, message = '') {
  if (!userId || userId === actorId) return;
  await dbRun(
    'INSERT INTO notifications (userId, actorId, type, postId, message, createdAt) VALUES (?, ?, ?, ?, ?, datetime("now"))',
    [userId, actorId, type, postId, message]
  );
}

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'Social Studio API' }));

app.post('/api/register', asyncHandler(async (req, res) => {
  const usernameValue = cleanText(req.body.username, 24).toLowerCase();
  const displayNameValue = cleanText(req.body.displayName, 60);
  const passwordValue = String(req.body.password ?? '');

  if (!usernameValue || !passwordValue || !displayNameValue) {
    return res.status(400).json({ error: 'Username, display name and password are required.' });
  }
  if (!/^[a-z0-9_]{3,24}$/.test(usernameValue)) {
    return res.status(400).json({ error: 'Username must be 3–24 characters using letters, numbers or underscores.' });
  }
  if (displayNameValue.length < 2) {
    return res.status(400).json({ error: 'Display name must contain at least 2 characters.' });
  }
  if (passwordValue.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const passwordHash = await bcrypt.hash(passwordValue, 12);
  try {
    const result = await dbRun(
      'INSERT INTO users (username, displayName, passwordHash) VALUES (?, ?, ?)',
      [usernameValue, displayNameValue, passwordHash]
    );
    req.session.userId = result.lastID;
    const user = await getUserWithStats(result.lastID);
    return res.status(201).json({ message: 'Welcome to Social Studio!', user });
  } catch (err) {
    if (String(err.message).includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'That username is already taken. Try another one.' });
    }
    throw err;
  }
}));

app.post('/api/login', asyncHandler(async (req, res) => {
  const username = cleanText(req.body.username, 24).toLowerCase();
  const password = String(req.body.password ?? '');
  if (!username || !password) return res.status(400).json({ error: 'Enter both username and password.' });

  const user = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }

  req.session.userId = user.id;
  return res.json({ message: `Welcome back, ${user.displayName}!`, user: await getUserWithStats(user.id) });
}));

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ message: 'Signed out successfully.' }));
});

app.get('/api/me', asyncHandler(async (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  res.json({ user: await getUserWithStats(req.session.userId) });
}));

app.put('/api/me', requireAuth, asyncHandler(async (req, res) => {
  const displayName = cleanText(req.body.displayName, 60);
  const bio = cleanText(req.body.bio, 180);
  if (displayName.length < 2) return res.status(400).json({ error: 'Display name must contain at least 2 characters.' });
  await dbRun('UPDATE users SET displayName = ?, bio = ? WHERE id = ?', [displayName, bio, req.session.userId]);
  res.json({ message: 'Profile updated.', user: await getUserWithStats(req.session.userId) });
}));

app.get('/api/users', requireAuth, asyncHandler(async (req, res) => {
  const query = cleanText(req.query.q, 40).toLowerCase();
  const params = [req.session.userId];
  let where = 'WHERE u.id != ?';
  if (query) {
    where += ' AND (LOWER(u.displayName) LIKE ? OR LOWER(u.username) LIKE ?)';
    params.push(`%${query}%`, `%${query}%`);
  }

  const users = await dbAll(
    `SELECT u.id, u.username, u.displayName, u.bio,
      (SELECT COUNT(*) FROM follows f WHERE f.followeeId = u.id) AS followers,
      EXISTS(SELECT 1 FROM follows f2 WHERE f2.followerId = ? AND f2.followeeId = u.id) AS isFollowing
     FROM users u ${where}
     ORDER BY isFollowing ASC, followers DESC, u.displayName ASC LIMIT 30`,
    [req.session.userId, ...params.slice(1)]
  );
  res.json({ users: users.map((u) => ({ ...serializeUser(u), followers: u.followers, isFollowing: Boolean(u.isFollowing) })) });
}));

app.get('/api/posts', requireAuth, asyncHandler(async (req, res) => {
  const query = cleanText(req.query.q, 80).toLowerCase();
  const followingOnly = String(req.query.following || '') === '1';
  const params = [];
  const conditions = [];
  if (query) {
    conditions.push('(LOWER(p.content) LIKE ? OR LOWER(u.displayName) LIKE ? OR LOWER(u.username) LIKE ?)');
    params.push(`%${query}%`, `%${query}%`, `%${query}%`);
  }
  if (followingOnly) {
    conditions.push('(p.userId = ? OR EXISTS (SELECT 1 FROM follows fx WHERE fx.followerId = ? AND fx.followeeId = p.userId))');
    params.push(req.session.userId, req.session.userId);
  }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const posts = await dbAll(
    `SELECT p.id, p.content, p.createdAt, u.id AS authorId, u.displayName, u.username,
      (SELECT COUNT(*) FROM likes WHERE postId = p.id) AS likes,
      (SELECT COUNT(*) FROM comments WHERE postId = p.id) AS commentCount,
      EXISTS(SELECT 1 FROM likes l2 WHERE l2.postId = p.id AND l2.userId = ?) AS liked,
      (p.userId = ?) AS isOwner
     FROM posts p JOIN users u ON u.id = p.userId
     ${where}
     ORDER BY datetime(p.createdAt) DESC, p.id DESC LIMIT 100`,
    [req.session.userId, req.session.userId, ...params]
  );
  res.json({ posts: posts.map((p) => ({ ...p, liked: Boolean(p.liked), isOwner: Boolean(p.isOwner) })) });
}));

app.post('/api/posts', requireAuth, asyncHandler(async (req, res) => {
  const content = cleanText(req.body.content, 1000);
  if (!content) return res.status(400).json({ error: 'Write something before publishing.' });
  const result = await dbRun('INSERT INTO posts (userId, content, createdAt) VALUES (?, ?, datetime("now"))', [req.session.userId, content]);
  res.status(201).json({ message: 'Post published.', id: result.lastID });
}));

app.put('/api/posts/:id', requireAuth, asyncHandler(async (req, res) => {
  const postId = getId(req.params.id);
  const content = cleanText(req.body.content, 1000);
  if (!postId || !content) return res.status(400).json({ error: 'A valid post and content are required.' });
  const post = await dbGet('SELECT id, userId FROM posts WHERE id = ?', [postId]);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (post.userId !== req.session.userId) return res.status(403).json({ error: 'You can only edit your own posts.' });
  await dbRun('UPDATE posts SET content = ? WHERE id = ?', [content, postId]);
  res.json({ message: 'Post updated.' });
}));

app.delete('/api/posts/:id', requireAuth, asyncHandler(async (req, res) => {
  const postId = getId(req.params.id);
  const post = postId ? await dbGet('SELECT id, userId FROM posts WHERE id = ?', [postId]) : null;
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (post.userId !== req.session.userId) return res.status(403).json({ error: 'You can only delete your own posts.' });
  await dbRun('DELETE FROM posts WHERE id = ?', [postId]);
  res.json({ message: 'Post deleted.' });
}));

app.get('/api/posts/:id/comments', requireAuth, asyncHandler(async (req, res) => {
  const postId = getId(req.params.id);
  if (!postId) return res.status(400).json({ error: 'Invalid post.' });
  const comments = await dbAll(
    `SELECT c.id, c.content, c.createdAt, c.userId AS authorId, u.displayName, u.username,
      (c.userId = ?) AS isOwner
     FROM comments c JOIN users u ON u.id = c.userId
     WHERE c.postId = ? ORDER BY datetime(c.createdAt) ASC, c.id ASC`,
    [req.session.userId, postId]
  );
  res.json({ comments: comments.map((c) => ({ ...c, isOwner: Boolean(c.isOwner) })) });
}));

app.post('/api/posts/:id/comments', requireAuth, asyncHandler(async (req, res) => {
  const postId = getId(req.params.id);
  const content = cleanText(req.body.content, 500);
  if (!postId || !content) return res.status(400).json({ error: 'Write a comment first.' });
  const post = await dbGet('SELECT id, userId FROM posts WHERE id = ?', [postId]);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  await dbRun('INSERT INTO comments (postId, userId, content, createdAt) VALUES (?, ?, ?, datetime("now"))', [postId, req.session.userId, content]);
  await notify(post.userId, 'comment', req.session.userId, postId, 'commented on your post');
  res.status(201).json({ message: 'Comment added.' });
}));

app.delete('/api/comments/:id', requireAuth, asyncHandler(async (req, res) => {
  const commentId = getId(req.params.id);
  const comment = commentId ? await dbGet('SELECT id, userId FROM comments WHERE id = ?', [commentId]) : null;
  if (!comment) return res.status(404).json({ error: 'Comment not found.' });
  if (comment.userId !== req.session.userId) return res.status(403).json({ error: 'You can only delete your own comments.' });
  await dbRun('DELETE FROM comments WHERE id = ?', [commentId]);
  res.json({ message: 'Comment deleted.' });
}));

app.post('/api/posts/:id/like', requireAuth, asyncHandler(async (req, res) => {
  const postId = getId(req.params.id);
  const post = postId ? await dbGet('SELECT id, userId FROM posts WHERE id = ?', [postId]) : null;
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const existing = await dbGet('SELECT id FROM likes WHERE userId = ? AND postId = ?', [req.session.userId, postId]);
  if (existing) {
    await dbRun('DELETE FROM likes WHERE id = ?', [existing.id]);
    return res.json({ liked: false, message: 'Like removed.' });
  }
  await dbRun('INSERT INTO likes (userId, postId) VALUES (?, ?)', [req.session.userId, postId]);
  await notify(post.userId, 'like', req.session.userId, postId, 'liked your post');
  res.json({ liked: true, message: 'Post liked.' });
}));

app.post('/api/users/:id/follow', requireAuth, asyncHandler(async (req, res) => {
  const followeeId = getId(req.params.id);
  if (!followeeId || followeeId === req.session.userId) return res.status(400).json({ error: 'You cannot follow yourself.' });
  const user = await dbGet('SELECT id FROM users WHERE id = ?', [followeeId]);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const existing = await dbGet('SELECT id FROM follows WHERE followerId = ? AND followeeId = ?', [req.session.userId, followeeId]);
  if (existing) {
    await dbRun('DELETE FROM follows WHERE id = ?', [existing.id]);
    return res.json({ following: false, message: 'Unfollowed successfully.' });
  }
  await dbRun('INSERT INTO follows (followerId, followeeId) VALUES (?, ?)', [req.session.userId, followeeId]);
  await notify(followeeId, 'follow', req.session.userId, null, 'started following you');
  res.json({ following: true, message: 'You are now following this person.' });
}));

app.get('/api/notifications', requireAuth, asyncHandler(async (req, res) => {
  const rows = await dbAll(
    `SELECT n.id, n.type, n.message, n.createdAt, n.readAt,
      u.displayName, u.username
     FROM notifications n JOIN users u ON u.id = n.actorId
     WHERE n.userId = ? ORDER BY datetime(n.createdAt) DESC, n.id DESC LIMIT 30`,
    [req.session.userId]
  );
  const unread = await dbGet('SELECT COUNT(*) AS count FROM notifications WHERE userId = ? AND readAt IS NULL', [req.session.userId]);
  res.json({ notifications: rows, unread: unread.count });
}));

app.post('/api/notifications/read', requireAuth, asyncHandler(async (req, res) => {
  await dbRun('UPDATE notifications SET readAt = datetime("now") WHERE userId = ? AND readAt IS NULL', [req.session.userId]);
  res.json({ message: 'Notifications marked as read.' });
}));

app.get('/api/stats', requireAuth, asyncHandler(async (req, res) => {
  const users = await dbGet('SELECT COUNT(*) AS count FROM users');
  const posts = await dbGet('SELECT COUNT(*) AS count FROM posts');
  const likes = await dbGet('SELECT COUNT(*) AS count FROM likes');
  const comments = await dbGet('SELECT COUNT(*) AS count FROM comments');
  res.json({ users: users.count, posts: posts.count, likes: likes.count, comments: comments.count });
}));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
});

app.listen(PORT, () => console.log(`\n✦ Social Studio is live at http://localhost:${PORT}\n`));
