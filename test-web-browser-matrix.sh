#!/usr/bin/env bash
set -euo pipefail

WEB_SECURE_ORIGIN=1 \
PW_IGNORE_HTTPS_ERRORS=1 \
PW_WORKERS=2 \
WEB_REPORT_NO_PRIVATE=1 \
WEB_REPORT_SAMPLE_IDS=23andme-v5-hu50B3F5,NA06985-vcf,apol1-bam,apol1-cram \
./test-web.sh --pgx-report-scenario "$@"
