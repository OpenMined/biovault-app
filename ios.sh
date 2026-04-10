# !/bin/bash

# rm -rf ios
# npm run cargo-ios -- ios
# npm run prebuild
# npm run device

export EXPO_NO_GIT_STATUS=1
export APP_VARIANT=development

OPENMINED_TEAM_ID="28PJ5N8D9X"
DEFAULT_DEVICE_UDID="00008150-0016492A0105401C"

# Usage:
# ./ios.sh [--clean] [DEVICE_UDID]
#   --clean: Optional flag to clean the iOS build environment by removing the 'ios' directory and 'expo.log' file.
#   DEVICE_UDID: Optional argument to specify the UDID of the iOS device to run on.
# If DEVICE_UDID is omitted, the script uses the current physical device:
#   00008150-0016492A0105401C
# The OpenMined Apple team remains fixed as:
#   28PJ5N8D9X

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

DEVICE_UDID="${DEVICE_UDID:-$DEFAULT_DEVICE_UDID}"

echo "Using APP_VARIANT=$APP_VARIANT"
echo "Using Apple team $OPENMINED_TEAM_ID"
echo "Using iOS device $DEVICE_UDID"

echo "Running: npm run cargo-ios -- ios"
npm run cargo-ios -- ios
echo "Running: npx expo prebuild --platform ios $CLEAN_FLAG"
npx expo prebuild --platform ios $CLEAN_FLAG

echo "Running: npx expo run:ios --device \"$DEVICE_UDID\" 2>&1 | tee expo.log"
npx expo run:ios --device "$DEVICE_UDID" 2>&1 | tee expo.log
