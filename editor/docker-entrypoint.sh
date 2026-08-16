#!/bin/sh
# Writes the editor's runtime config from environment variables (FR-P-1).
: "${FE_API_BASE:=http://localhost:8080}"
cat > /usr/share/nginx/html/config.js <<EOF
// Generated at container start from FE_API_BASE.
window.FE_API_BASE = "${FE_API_BASE}";
EOF
