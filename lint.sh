#!/bin/bash

# Track if any command fails
EXIT_CODE=0

echo "🔍 Running TypeScript type checking..."
npx --yes tsc --noEmit
if [ $? -ne 0 ]; then
    echo "❌ TypeScript type checking failed"
    EXIT_CODE=1
else
    echo "✅ TypeScript type checking passed"
fi

echo ""
echo "🔍 Running ESLint..."
npm run lint
if [ $? -ne 0 ]; then
    echo "❌ ESLint check failed"
    EXIT_CODE=1
else
    echo "✅ ESLint check passed"
fi

echo ""
echo "🔍 Checking for unused exports..."
TS_PRUNE_OUTPUT=$(npx --yes ts-prune -p tsconfig.json 2>&1)
TS_PRUNE_EXIT=$?

if [ $TS_PRUNE_EXIT -ne 0 ]; then
    echo "$TS_PRUNE_OUTPUT"
    echo "❌ ts-prune check failed with error"
    EXIT_CODE=1
elif [ -n "$TS_PRUNE_OUTPUT" ]; then
    echo "$TS_PRUNE_OUTPUT"
    echo ""
    echo "❌ Found unused exports that must be addressed:"
    echo "  • Either remove the unused export from the code"
    echo "  • Or add it to .ts-prunerc if it's a framework requirement"
    EXIT_CODE=1
else
    echo "✅ No unused exports found"
fi

echo ""
echo "🔍 Checking for unused dependencies..."
npx --yes depcheck --ignore-dirs=notebooks
DEPCHECK_EXIT=$?
if [ $DEPCHECK_EXIT -ne 0 ]; then
    echo "❌ Found unused dependencies. Consider removing them from package.json"
    EXIT_CODE=1
else
    echo "✅ No unused dependencies found"
fi

echo ""
if [ $EXIT_CODE -ne 0 ]; then
    echo "❌ Linting failed with errors. Please fix the issues above."
else
    echo "✅ All linting checks passed!"
fi

exit $EXIT_CODE
