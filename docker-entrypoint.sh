#!/bin/sh
set -e

# Resolve target UID/GID (supports standard Unraid PUID/PGID overrides, defaults to nextjs 1001:1001)
TARGET_UID="${PUID:-1001}"
TARGET_GID="${PGID:-1001}"

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
fi

# When running as root, align bind-mount ownership & permissions before dropping privileges
if [ "$(id -u)" = "0" ]; then
    if [ "$TARGET_UID" != "1001" ] || [ "$TARGET_GID" != "1001" ]; then
        echo "[DOCKER-INIT] Aligning runtime user permissions for PUID=$TARGET_UID PGID=$TARGET_GID..."
        groupmod -o -g "$TARGET_GID" nodejs 2>/dev/null || true
        usermod -o -u "$TARGET_UID" -g "$TARGET_GID" nextjs 2>/dev/null || true
        chown -R "$TARGET_UID:$TARGET_GID" /app/prisma /app/.next /app/public 2>/dev/null || true
    fi

    if [ -n "$DB_DIR" ] && [ -d "$DB_DIR" ]; then
        chown -R "$TARGET_UID:$TARGET_GID" "$DB_DIR" 2>/dev/null || true
        chmod -R u+rwX,g+rwX "$DB_DIR" 2>/dev/null || true
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

run_as_target() {
    if [ "$(id -u)" = "0" ] && command -v gosu >/dev/null 2>&1; then
        gosu "$TARGET_UID:$TARGET_GID" "$@"
    else
        "$@"
    fi
}

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

    # Run prisma db push as target user to create SQLite database file, tables, foreign keys, and indexes
    if run_as_target prisma db push --schema="$SCHEMA_PATH" --skip-generate --accept-data-loss; then
        echo "[DOCKER-INIT] ✅ Database successfully created and schema deployed."
        if [ "$(id -u)" = "0" ] && [ -f "$DB_PATH" ]; then
            chown "$TARGET_UID:$TARGET_GID" "$DB_PATH" "${DB_PATH}-wal" "${DB_PATH}-shm" 2>/dev/null || true
            chmod 664 "$DB_PATH" "${DB_PATH}-wal" "${DB_PATH}-shm" 2>/dev/null || true
        fi
    else
        echo "[DOCKER-INIT] ⚠️ prisma db push returned non-zero status; falling back to application runtime schema sync."
    fi
else
    echo "[DOCKER-INIT] 🔒 Existing database detected at $DB_PATH. Preserving existing database."
fi

# Execute CMD arguments (default: node server.js) as non-root target user
if [ "$(id -u)" = "0" ] && command -v gosu >/dev/null 2>&1; then
    exec gosu "$TARGET_UID:$TARGET_GID" "$@"
fi
exec "$@"
