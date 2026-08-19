# Creator Circle

A simple premium mobile-first community app:

**Join → Subscribe → Share → Watch → Subscribe**

## Stack

- HTML/CSS/Vanilla JavaScript
- Node.js
- Express
- MongoDB Atlas
- Mongoose

No authentication, Firebase, Supabase, PostgreSQL, React, or complicated social features.

## 1. Requirements

Install Node.js 18+.

## 2. MongoDB Atlas

Create a MongoDB Atlas cluster and database user.

Use your rotated/new MongoDB Atlas connection string.

Put it in `backend` only if you keep a backend folder, or directly in the root `.env` for this version:

```env
MONGO_URI=YOUR_NEW_MONGODB_ATLAS_URI
PORT=5000
```

Never put the URI in frontend files.

## 3. Install

```bash
npm install
```

## 4. Run

```bash
npm start
```

Open:

http://localhost:5000

## 5. Data

MongoDB stores:

### Members
- name
- createdAt

### Shares
- memberId
- url
- type
- title
- thumbnail
- createdAt

Links persist in MongoDB until deleted from the database.

## 6. YouTube subscription

The current app opens the configured YouTube channel and uses an "I've Subscribed" confirmation step.

It does not perform real YouTube subscription verification.

A production version can add YouTube API/OAuth verification later.

## 7. Share limit

Each member can submit up to 5 links per day. The limit is enforced by the Express backend.

## 8. Security

Rotate any MongoDB credentials that have been exposed.

Never commit `.env`.

The frontend never receives the MongoDB URI.
