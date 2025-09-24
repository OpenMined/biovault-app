# !/bin/bash

# rm -rf ios
# npm run cargo-ios -- ios
# npm run prebuild
# npm run device

export EXPO_NO_GIT_STATUS=1

# Usage:
# ./ios.sh [--clean] [DEVICE_UDID]
#   --clean: Optional flag to clean the iOS build environment by removing the 'ios' directory and 'expo.log' file.
#   DEVICE_UDID: Optional argument to specify the UDID of the iOS device to run the app on. If not provided, the app will run on the default simulator.

# Initialize CLEAN_FLAG
CLEAN_FLAG=""

# Ensure expo.log exists
touch expo.log

# Parse arguments
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --clean)
      echo "Running: rm -rf ios || true"
      rm -rf ios || true
      echo "Running: rm expo.log || true"
      rm expo.log || true
      CLEAN_FLAG="--clean"
      ;;
    *)
      DEVICE_UDID="$1"
      ;;
  esac
  shift
done

echo "Running: npm run cargo-ios -- ios"
npm run cargo-ios -- ios
echo "Running: npx expo prebuild --platform all $CLEAN_FLAG"
npx expo prebuild --platform all $CLEAN_FLAG

# Run expo with or without a device UDID
if [[ -n "$DEVICE_UDID" ]]; then
  echo "Running: npx expo run:ios --device \"$DEVICE_UDID\" 2>&1 | tee expo.log"
  npx expo run:ios --device "$DEVICE_UDID" 2>&1 | tee expo.log
else
  echo "Running: npx expo run:ios 2>&1 | tee expo.log"
  npx expo run:ios 2>&1 | tee expo.log
fi
