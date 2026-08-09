# Social Studio

> A polished full-stack social media platform built for Task 2.

Social Studio is a responsive social networking web application where users can create accounts, publish posts, discover people, follow users, like and comment on posts, receive notifications, and manage their profile and appearance settings.

## ✨ Features

- 🔐 User registration and login
- 🏠 Personalized home feed with **For You** and **Following**
- ✍️ Create, edit, and delete your own posts
- ❤️ Like and unlike posts
- 💬 Add and delete your own comments
- 🔎 Search people and posts
- 👥 Follow and unfollow users
- 👤 View and edit profile information
- 🔔 Notifications for follows, likes, and comments
- ⚙️ Settings and light/dark appearance
- 📱 Responsive layout for desktop, tablet, and mobile
- ♿ Accessible labels, focus states, and keyboard-friendly dialogs
- 🗃️ SQLite persistence with automatic database schema creation
- 🌱 Demo community is seeded automatically when the database is empty

## 🛠️ Tech Stack

**Frontend**
- HTML5
- CSS3
- Vanilla JavaScript

**Backend**
- Node.js
- Express.js
- Express Session

**Database**
- SQLite3

**Security**
- bcryptjs password hashing
- HTTP-only session cookies
- Input validation and ownership checks

## 📁 Project Structure

```text
Task2-SocialStudio/
├── public/
│   ├── index.html       # Application UI
│   ├── style.css        # Responsive design system
│   └── app.js           # Frontend state and API calls
├── db.js                # SQLite schema, indexes and demo seed
├── server.js            # Express server and REST API
├── package.json
├── package-lock.json
├── .env.example
├── .gitignore
└── README.md
```

> `social.db` is intentionally not committed to GitHub. The application creates the local database and demo data automatically on first run.

## 🚀 Run Locally

### 1. Clone the repository

```bash
git clone <YOUR-GITHUB-REPOSITORY-URL>
cd Task2-SocialStudio
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the application

```bash
npm start
```

Open:

```text
http://localhost:3000
```

### Development mode

```bash
npm run dev
```

## 🎮 Demo Account

A demo community is created automatically on a fresh database.

```text
Username: arjun.dev
Password: Demo@1234
```

You can also create your own account from the registration screen.

## 🔐 Environment Configuration

For local development the application has a development fallback session secret.

For a deployment, provide a strong `SESSION_SECRET` environment variable.

Example:

```env
PORT=3000
NODE_ENV=production
SESSION_SECRET=replace-with-a-long-random-secret
```

Do not commit real secrets or `.env` files to GitHub.

## 🔌 API Overview

### Authentication

```text
POST /api/register
POST /api/login
POST /api/logout
GET  /api/me
PUT  /api/me
```

### Posts

```text
GET    /api/posts
POST   /api/posts
PUT    /api/posts/:id
DELETE /api/posts/:id
```

### Comments & Likes

```text
GET    /api/posts/:id/comments
POST   /api/posts/:id/comments
DELETE /api/comments/:id
POST   /api/posts/:id/like
```

### Users & Social Graph

```text
GET  /api/users
POST /api/users/:id/follow
```

### Notifications & Statistics

```text
GET  /api/notifications
POST /api/notifications/read
GET  /api/stats
GET  /api/health
```

## 🧪 Health Check

After starting the server, visit:

```text
http://localhost:3000/api/health
```

A healthy server returns:

```json
{
  "ok": true,
  "service": "Social Studio API"
}
```

## 📸 Project Demonstration

The project demonstration covers:

1. Registration / Login
2. Home feed
3. Creating a post
4. Likes and comments
5. Explore and search
6. Follow / unfollow
7. Profile editing
8. Notifications
9. Settings and dark mode
10. Logout

For a college submission, upload the screen-recording separately if the submission portal asks for a video file.

## ⚠️ Production Note

This project is designed for learning, demonstration, and local development. The default Express session store is not intended for production deployments. A production system should use a persistent session store, HTTPS, a strong secret, appropriate security headers, rate limiting, and a managed database.

## 👨‍💻 Project

**Project:** Social Studio  
**Task:** Task 2 – Social Media Platform  
**Runtime:** Node.js 18+
