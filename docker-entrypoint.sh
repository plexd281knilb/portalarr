#!/bin/sh
set -e

# Resolve DATABASE_URL (defaults to file:/app/data/dev.db if unset)
export DATABASE_URL="${DATABASE_URL:-file:/app/data/dev.db}"

# Extract database file path from DATABASE_URL
# Strip file:// or file: prefix and any query parameters
DB_PATH=$(echo "$DATABASE_URL" | sed -e 's|^file://||' -e 's|^file:||' -e 's|\?.*$||')

# Resolve parent directory
DB_DIR=$(dirname "$DB_PATH")

# Ensure database directory exists
if [ -n "$DB_DIR" ] && [ ! -d "$DB_DIR" ]; then
    echo "[DOCKER-INIT] Database directory $DB_DIR does not exist. Creating..."
    mkdir -p "$DB_DIR" 2>/dev/null || true
    if [ "$(id -u)" = "0" ]; then
        chmod 777 "$DB_DIR" 2>/dev/null || true
    fi
fi

# Detect whether this is a new installation
# A new install is when the database file does not exist, or exists with 0 bytes size
IS_NEW_INSTALL=0
if [ ! -f "$DB_PATH" ]; then
    IS_NEW_INSTALL=1
elif [ ! -s "$DB_PATH" ]; then
    IS_NEW_INSTALL=1
fi

if [ "$IS_NEW_INSTALL" -eq 1 ]; then
    echo "=========================================================="
    echo " [DOCKER-INIT] 🚀 New installation detected!"
    echo " [DOCKER-INIT] Target SQLite database: $DB_PATH"
    echo " [DOCKER-INIT] Creating database and deploying Prisma schema..."
    echo "=========================================================="

    SCHEMA_PATH="/app/prisma/schema.prisma"
    if [ ! -f "$SCHEMA_PATH" ]; then
        SCHEMA_PATH="./prisma/schema.prisma"
    fi

    # Run prisma db push to create SQLite database file, tables, foreign keys, and indexes
    if prisma db push --schema="$SCHEMA_PATH" --skip-generate --accept-data-loss; then
        echo "[DOCKER-INIT] ✅ Database successfully created and schema deployed."
        if [ "$(id -u)" = "0" ] && [ -f "$DB_PATH" ]; then
            chmod 666 "$DB_PATH" 2>/dev/null || true
            chmod 666 "${DB_PATH}-wal" 2>/dev/null || true
            chmod 666 "${DB_PATH}-shm" 2>/dev/null || true
        fi
    else
        echo "[DOCKER-INIT] ⚠️ prisma db push returned non-zero status; falling back to application runtime schema sync."
    fi
else
    echo "[DOCKER-INIT] 🔒 Existing database detected at $DB_PATH. Preserving existing database."
fi

# Execute CMD arguments (default: node server.js)
exec "$@"
