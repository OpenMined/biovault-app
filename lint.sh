#!/bin/bash

npx tsc --noEmit
npm run lint
npx ts-prune -p tsconfig.json
