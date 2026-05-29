// /api/rankings.js  — Vercel serverless function using Upstash Redis
//
// Setup (one-time):
// 1) In Vercel dashboard → Storage tab → Marketplace Database Providers
//    Find "Upstash" → Install (or visit https://vercel.com/marketplace/upstash)
// 2) Pick "Let Vercel manage your Upstash account" (simpler) and create a new Redis DB
//    Free tier: ~500K commands/month
// 3) Connect to this project. Vercel auto-injects env vars:
//      UPSTASH_REDIS_REST_URL
//      UPSTASH_REDIS_REST_TOKEN
// 4) Locally: npm install @upstash/redis
// 5) Redeploy the project so env vars become available to the function.

import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const KEY = 'tetris:leaderboard:v1';
const MAX_STORED = 100;
const MAX_RETURN = 20;
const MIN_SCORE = 1;
const MAX_SCORE = 99_999_999;

function sanitizeName(raw) {
  if (typeof raw !== 'string') return '익명';
  const cleaned = raw.replace(/[^\w가-힣\- ]/g, '').trim();
  return cleaned.slice(0, 16) || '익명';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const list = (await redis.get(KEY)) || [];
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

      const list = (await redis.get(KEY)) || [];
      list.push(entry);
      list.sort((a, b) => b.score - a.score);
      const trimmed = list.slice(0, MAX_STORED);
      await redis.set(KEY, trimmed);

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
    return res.status(500).json({ error: 'server error', detail: String(err && err.message || err) });
  }
}
