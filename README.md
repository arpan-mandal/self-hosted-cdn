# Simple File Manager

This is a self-hosted file storage system. It lets you upload, download, and organize files through a web interface. The backend uses Node.js and Express. The frontend uses plain HTML, CSS, and JavaScript. SQLite stores session data.

The system is built to use as little RAM as possible, usually under 100MB. It works well in containers like Pterodactyl.

## Features

- Login with one hardcoded account
- Upload any file type up to 100MB (configurable)
- Drag and drop uploads
- Create folders inside folders
- Rename files and folders
- Delete files and folders
- Direct download links
- Public shareable links
- Media(image and video) previews for common formats
- Storage usage display
- Mobile responsive layout

## Installation

Copy the files to your server.

Install dependencies:
```npm install```

Create directories:
```mkdir uploads data temp```

Copy the example environment file:
```cp .env.example .env```

> Edit .env and set your username, password, and a session secret.

Start the server:
```npm start```

Open http://localhost:3000 in a browser.

## Deployment on Pterodactyl

Use the Node.js egg. Set the startup command to npm start. Write desired values into the fields: ```ADMIN_USERNAME, ADMIN_PASSWORD, SESSION_SECRET, PORT and MAX_FILE_SIZE``` inside .env. Make sure the uploads, data, and temp directories are writable.

## Changing the upload limit

Edit ```MAX_FILE_SIZE``` in the .env file. The value is in bytes.

## Project structure

server.js - Main backend
db.js - SQLite helper functions
public/index.html - Main page
public/style.css - Styling
public/app.js - Frontend logic
uploads/ - Where files/folders are stored
data/ - SQLite database location
temp/ - Temporary storage during upload

## Security notes

Change the default credentials immediately. Use a strong SESSION_SECRET. Share links are public, so anyone with the link can download the file. Path traversal is prevented but be careful about what you upload.

## Performance

The system streams files directly to disk. It does not load files into memory. This keeps RAM usage low even with large uploads.

---

### About Vertos

Vertos uses this system to provide storage hosting to its customers. You can try their free plan [HERE](https://dash.vertos.in/register).
