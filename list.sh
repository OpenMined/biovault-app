#!/bin/bash

npx wrangler d1 execute d1-biovault-website \
  --remote \
  --json \
  --command "SELECT id, email, source, status, metadata, created_at, updated_at FROM newsletter_subscribers ORDER BY created_at DESC;" \
  | node -e 'let input = ""; process.stdin.on("data", (chunk) => input += chunk); process.stdin.on("end", () => {
    const payload = JSON.parse(input);
    const rows = payload.flatMap((item) => item.results || []);
    if (!rows.length) {
      console.log("No newsletter subscribers found.");
      return;
    }
    console.table(rows.map(({ id, email, source, status, created_at, updated_at }) => ({
      id,
      email,
      source,
      status,
      created_at,
      updated_at,
    })));
  });'
