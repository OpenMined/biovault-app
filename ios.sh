#!/bin/bash

rm -rf ios
npm run cargo-ios -- ios
npm run prebuild
npm run device
