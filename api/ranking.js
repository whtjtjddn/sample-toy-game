// /api/rankings.js  — Vercel serverless function
// Provides GET (top scores) and POST (submit score) backed by Vercel KV.
//
// Setup (one-time):
// 1) In your Vercel project dashboard → Storage → Create → KV
//    Name it anything (e.g. "rankings"). Connect it to this project.
//    Vercel auto-adds KV_* env vars to your project.
// 2) npm install @vercel/kv
// 3) Commit + push. Endpoint will be at /api/rankings.

import { kv } from '@vercel/kv';

const KEY = 'tetris:leaderboard:v1';
const MAX_STORED = 100;   // keep top 100 on server
const MAX_RETURN = 20;    // return top 20 to client
const MIN_SCORE = 1;
const MAX_SCORE = 99_999_999;

function sanitizeName(raw) {
  if (typeof raw !== 'string') return '익명';
  // Keep letters/digits/Hangul/spaces/dashes; trim to 16 chars
  const cleaned = raw.replace(/[^\w가-힣\- ]/g, '').trim();
  return cleaned.slice(0, 16) || '익명';
}

export default async function handler(req, res) {
  // CORS — allow your own domain only in production if you want.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const list = (await kv.get(KEY)) || [];
      return res.status(200).json({ leaderboard: list.slice(0, MAX_RETURN) });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const score = Number(body.score);
      const lines = Number(body.lines);
      const level = Number(body.level);
      const name = sanitizeName(body.name);

      if (!Number.isFinite(score) || score < MIN_SCORE || score > MAX_SCORE) {
        return res.status(400).json({ error: 'invalid score' });
      }
      if (!Number.isFinite(lines) || lines < 0 || lines > 9999) {
        return res.status(400).json({ error: 'invalid lines' });
      }
      if (!Number.isFinite(level) || level < 1 || level > 99) {
        return res.status(400).json({ error: 'invalid level' });
      }

      const entry = {
        name,
        score: Math.floor(score),
        lines: Math.floor(lines),
        level: Math.floor(level),
        date: Date.now(),
      };

      const list = (await kv.get(KEY)) || [];
      list.push(entry);
      list.sort((a, b) => b.score - a.score);
      const trimmed = list.slice(0, MAX_STORED);
      await kv.set(KEY, trimmed);

      const rank = trimmed.findIndex(
        e => e.date === entry.date && e.score === entry.score && e.name === entry.name
      ) + 1;
      return res.status(200).json({
        ok: true,
        rank: rank > 0 ? rank : null,
        leaderboard: trimmed.slice(0, MAX_RETURN),
      });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('rankings api error', err);
    return res.status(500).json({ error: 'server error' });
  }
}
