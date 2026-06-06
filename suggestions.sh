#!/bin/bash

npx wrangler d1 execute d1-biovault-website \
  --remote \
  --json \
  --command "SELECT id, suggestion, email, source, metadata, created_at FROM suggestions ORDER BY created_at DESC;" \
  | node -e 'let input = ""; process.stdin.on("data", (chunk) => input += chunk); process.stdin.on("end", () => {
    const payload = JSON.parse(input);
    const rows = payload.flatMap((item) => item.results || []);
    if (!rows.length) {
      console.log("No suggestions found.");
      return;
    }
    console.table(rows.map(({ id, suggestion, email, source, created_at }) => ({
      id,
      suggestion: suggestion.length > 120 ? `${suggestion.slice(0, 117)}...` : suggestion,
      email: email || "",
      source,
      created_at,
    })));
  });'
