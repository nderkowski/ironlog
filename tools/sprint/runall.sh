#!/bin/bash
# Run every t-suite against 127.0.0.1:8117; print one line per suite.
cd "$(dirname "$0")/../.."
for f in tools/test/t*.mjs; do
  out=$(timeout 600 node "$f" 2>&1); rc=$?
  line=$(echo "$out" | grep -E "passed, [0-9]+ failed" | tail -1)
  echo "$(basename $f) rc=$rc ${line:-NO SUMMARY}"
  [ $rc -ne 0 ] && echo "$out" | grep -E "FAIL|Error" | head -5 | sed 's/^/    /'
done; true
