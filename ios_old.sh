export EXPO_NO_GIT_STATUS=1

rm -rf ios
npm run cargo-ios -- ios
npm run prebuild
npm run device 00008140-000C6D800E33001C