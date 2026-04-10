#!/bin/bash
set -e

rm -rf android
npm run cargo-android
npx expo prebuild --platform android --clean
npm run android
