const express = require('express');
const session = require('express-session');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
  session({
    secret: 'supersecretkey',
    resave: false,
    saveUninitialized: false,
  })
);

const REMOTE_USER = 'user';
const REMOTE_PASS = 'passwd';

// Middleware to protect routes
function requireLogin(req, res, next) {
  if (req.session && req.session.authenticated) {
    next();
  } else {
    res.redirect('/login');
  }
}

app.get('/', (req, res) => {
  res.redirect('/login');
});

// Login form
app.get('/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Login</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light d-flex justify-content-center align-items-center vh-100">
      <div class="card shadow p-4" style="width: 350px;">
        <h3 class="text-center mb-3">Login</h3>
        <form method="post" action="/login">
          <div class="mb-3">
            <label class="form-label">Username</label>
            <input type="text" name="username" class="form-control" required>
          </div>
          <div class="mb-3">
            <label class="form-label">Password</label>
            <input type="password" name="password" class="form-control" required>
          </div>
          <button type="submit" class="btn btn-primary w-100">Login</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// Handle login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    // Remote auth check
    const authRes = await axios.get('https://httpbin.org/basic-auth/user/passwd', {
      auth: { username: REMOTE_USER, password: REMOTE_PASS },
      validateStatus: () => true,
    });

    if (username === 'admin' && password === 'secret' && authRes.data.authenticated) {
      req.session.authenticated = true;
      res.redirect('/menu');
    } else {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Login Failed</title>
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
        </head>
        <body class="bg-light d-flex justify-content-center align-items-center vh-100">
          <div class="alert alert-danger shadow p-4">
            ❌ Invalid credentials
            <div class="mt-3"><a href="/login" class="btn btn-secondary">Try Again</a></div>
          </div>
        </body>
        </html>
      `);
    }
  } catch (err) {
    console.error('Auth error:', err.message);
    res.status(500).send('❌ Authentication failed');
  }
});

// Menu page (protected)
app.get('/menu', requireLogin, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Menu</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light">
      <div class="container py-5">
        <div class="card shadow p-4">
          <h2 class="mb-4">Welcome! Choose a file to download:</h2>
          <div class="d-grid gap-3 mb-4">
            <a href="/download/html" class="btn btn-outline-primary">Download HTML</a>
            <a href="/download/pdf" class="btn btn-outline-primary">Download PDF</a>
            <a href="/download/zip" class="btn btn-outline-primary">Download ZIP</a>
            <a href="/files" class="btn btn-outline-secondary">View Downloaded Files</a>
          </div>
          <form action="/logout" method="post">
            <button type="submit" class="btn btn-danger w-100">Logout</button>
          </form>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Logout
app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// Download HTML
app.get('/download/html', requireLogin, async (req, res) => {
  try {
    const htmlRes = await axios.get('https://httpbin.org/html');
    const htmlPath = path.join(__dirname, 'sample.html');
    fs.writeFileSync(htmlPath, htmlRes.data, 'utf-8');

    res.setHeader('Content-Disposition', 'attachment; filename=sample.html');
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlRes.data);
  } catch (err) {
    console.error('HTML download error:', err.message);
    res.status(500).send('❌ Failed to download HTML');
  }
});

// Download PDF
app.get('/download/pdf', requireLogin, async (req, res) => {
  try {
    const pdfRes = await axios.get(
      'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      { responseType: 'arraybuffer' }
    );
    const pdfPath = path.join(__dirname, 'sample.pdf');
    fs.writeFileSync(pdfPath, pdfRes.data);

    res.setHeader('Content-Disposition', 'attachment; filename=sample.pdf');
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdfRes.data);
  } catch (err) {
    console.error('PDF download error:', err.message);
    res.status(500).send('❌ Failed to download PDF');
  }
});

// Bundle into ZIP
app.get('/download/zip', requireLogin, (req, res) => {
  const htmlPath = path.join(__dirname, 'sample.html');
  const pdfPath = path.join(__dirname, 'sample.pdf');

  if (!fs.existsSync(htmlPath) && !fs.existsSync(pdfPath)) {
    return res.status(404).send('No files found. Please download HTML/PDF first.');
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename=files.zip');

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', err => {
    console.error('Archive error:', err.message);
    res.status(500).send('Failed to create ZIP');
  });

  archive.pipe(res);

  if (fs.existsSync(htmlPath)) archive.file(htmlPath, { name: 'sample.html' });
  if (fs.existsSync(pdfPath)) archive.file(pdfPath, { name: 'sample.pdf' });

  archive.finalize();
});

// Status page
app.get('/files', requireLogin, (req, res) => {
  const htmlPath = path.join(__dirname, 'sample.html');
  const pdfPath = path.join(__dirname, 'sample.pdf');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Files Status</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light">
      <div class="container py-5">
        <div class="card shadow p-4">
          <h2 class="mb-4">Downloaded Files Status</h2>
          <ul class="list-group mb-4">
            <li class="list-group-item">${fs.existsSync(htmlPath) ? '✅ sample.html is available' : '❌ sample.html not found'}</li>
            <li class="list-group-item">${fs.existsSync(pdfPath) ? '✅ sample.pdf is available' : '❌ sample.pdf not found'}</li>
          </ul>
          <a href="/menu" class="btn btn-secondary w-100">Back to Menu</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});