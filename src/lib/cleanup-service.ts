import Database from 'better-sqlite3';
import path from 'path';

// --- CONFIGURATION ---
const DB_PATHS = {
  ADMINARR: path.join(process.cwd(), 'data', 'dev.db'),
  MAIN: '/mnt/remotes/Main_Appdata/plex/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db',
  KIDS: '/mnt/user/appdata/KidsPlexServer/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db',
  BACKUP: '/mnt/user/appdata/MainPlexBackup/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db'
};

// --- HELPER: Convert Path to SQLite URI ---
// This fixes the SQLITE_CANTOPEN error by encoding spaces (e.g., "Application Support" -> "Application%20Support")
const getSafeURI = (dbPath: string) => {
  // Replace spaces with %20. We use file:// prefix for absolute paths.
  const encodedPath = dbPath.replace(/ /g, '%20');
  return `file://${encodedPath}?mode=ro&immutable=1`;
};

export function syncCleanupData() {
  console.log('🔄 Starting Full Sync with Advanced Logic...');
  const db = new Database(DB_PATHS.ADMINARR);

  try {
    // 1. Prepare the Local Table
    db.exec('DROP TABLE IF EXISTS cleanup_queue');
    db.exec(`
      CREATE TABLE cleanup_queue (
        guid TEXT,
        added_at TEXT,
        last_active TEXT,
        viewed_at TEXT,
        filepath TEXT,
        original_file TEXT,
        source TEXT
      );
    `);

    // 2. Attach External Databases using Safe URIs
    // We use the helper function here to ensure spaces are handled correctly
    const attachQuery = `
      ATTACH DATABASE '${getSafeURI(DB_PATHS.MAIN)}' AS main_plex;
      ATTACH DATABASE '${getSafeURI(DB_PATHS.KIDS)}' AS kids;
      ATTACH DATABASE '${getSafeURI(DB_PATHS.BACKUP)}' AS backup;
    `;
    
    console.log("🔌 Attaching Databases...");
    db.exec(attachQuery);

    // 3. The "Big Logic" Query (Unchanged)
    const syncQuery = `
      INSERT INTO cleanup_queue (guid, added_at, last_active, viewed_at, filepath, original_file, source)
      SELECT 
        guid, 
        added_at, 
        MAX(last_active_dt) as last_active, 
        MAX(viewed_at) as viewed_at, 
        file_path, 
        original_file, 
        source
      FROM (
        -- MAIN SERVER
        SELECT 
            CASE WHEN mi.guid LIKE '%local%' THEN hints ELSE mi.guid END AS guid,
            datetime(mi.created_at, 'unixepoch', 'localtime') AS added_at,
            IFNULL(miv.viewed_at, datetime(mi.created_at, 'unixepoch', 'localtime')) AS last_active_dt,
            datetime(miv.viewed_at, 'unixepoch', 'localtime') AS viewed_at,
            CASE 
                WHEN mp.file LIKE '%/Kid_TV/%'      THEN replace(mp.file,'/Kid_TV/','/mnt/user/Kid_TV_Shows/')
                WHEN mp.file LIKE '%/Kid_tvshows/%' THEN replace(mp.file,'/Kid_tvshows/','/mnt/user/Kid_TV_Shows/')
                WHEN mp.file LIKE '%/4k_tv_shows/%' THEN replace(mp.file,'/4k_tv_shows/','/mnt/user/4k_TV_Shows/')
                WHEN mp.file LIKE '%/tvshows/%'     THEN replace(mp.file,'/tvshows/','/mnt/user/Kid_TV_Shows/')
                WHEN mp.file LIKE '%/tv_shows/%'    THEN replace(mp.file,'/tv_shows/','/mnt/user/TV_Shows/')
                WHEN mp.file LIKE '%/tv/%'          THEN replace(mp.file,'/tv/','/mnt/user/TV_Shows/')
                WHEN mp.file LIKE '%/4k_Movies/%'   THEN replace(mp.file,'/4k_Movies/','/mnt/user/4k_Movies/')
                WHEN mp.file LIKE '%/4k_movies/%'   THEN replace(mp.file,'/4k_movies/','/mnt/user/4k_Movies/')
                WHEN mp.file LIKE '%/Kid_Movies/%'  THEN replace(mp.file,'/Kid_Movies/','/mnt/user/Kid_Movies/')
                WHEN mp.file LIKE '%/Kid_movies/%'  THEN replace(mp.file,'/Kid_movies/','/mnt/user/Kid_Movies/')
                WHEN mp.file LIKE '%/movies/%' AND ls.name = 'Kids Movies' THEN replace(mp.file,'/movies/','/mnt/user/Kid_Movies/')
                WHEN mp.file LIKE '%/movies/%'      THEN replace(mp.file,'/movies/','/mnt/user/Movies/')
                ELSE mp.file
            END AS file_path,
            mp.file AS original_file,
            'MAIN' as source
        FROM main_plex.metadata_items AS mi
        JOIN main_plex.library_sections AS ls ON mi.library_section_id = ls.id
        JOIN main_plex.media_items AS mitem ON mitem.metadata_item_id = mi.id
        JOIN main_plex.media_parts AS mp ON mp.media_item_id = mitem.id
        LEFT JOIN (SELECT MAX(datetime(viewed_at, 'unixepoch', 'localtime')) AS viewed_at, guid FROM main_plex.metadata_item_views GROUP BY guid) miv ON miv.guid = mi.guid
        WHERE ls.name IN ('Movies','TV Shows', 'Kids Movies', 'Kids TV Shows')

        UNION ALL

        -- KIDS SERVER
        SELECT 
            CASE WHEN mi.guid LIKE '%local%' THEN hints ELSE mi.guid END AS guid,
            datetime(mi.created_at, 'unixepoch', 'localtime') AS added_at,
            IFNULL(miv.viewed_at, datetime(mi.created_at, 'unixepoch', 'localtime')) AS last_active_dt,
            datetime(miv.viewed_at, 'unixepoch', 'localtime') AS viewed_at,
            CASE 
                WHEN mp.file LIKE '%/Kid_TV/%'      THEN replace(mp.file,'/Kid_TV/','/mnt/user/Kid_TV_Shows/')
                WHEN mp.file LIKE '%/Kid_tvshows/%' THEN replace(mp.file,'/Kid_tvshows/','/mnt/user/Kid_TV_Shows/')
                WHEN mp.file LIKE '%/4k_tv_shows/%' THEN replace(mp.file,'/4k_tv_shows/','/mnt/user/4k_TV_Shows/')
                WHEN mp.file LIKE '%/tvshows/%'     THEN replace(mp.file,'/tvshows/','/mnt/user/Kid_TV_Shows/')
                WHEN mp.file LIKE '%/tv_shows/%'    THEN replace(mp.file,'/tv_shows/','/mnt/user/TV_Shows/')
                WHEN mp.file LIKE '%/tv/%'          THEN replace(mp.file,'/tv/','/mnt/user/TV_Shows/')
                WHEN mp.file LIKE '%/4k_Movies/%'   THEN replace(mp.file,'/4k_Movies/','/mnt/user/4k_Movies/')
                WHEN mp.file LIKE '%/4k_movies/%'   THEN replace(mp.file,'/4k_movies/','/mnt/user/4k_Movies/')
                WHEN mp.file LIKE '%/Kid_Movies/%'  THEN replace(mp.file,'/Kid_Movies/','/mnt/user/Kid_Movies/')
                WHEN mp.file LIKE '%/Kid_movies/%'  THEN replace(mp.file,'/Kid_movies/','/mnt/user/Kid_Movies/')
                WHEN mp.file LIKE '%/movies/%' AND ls.name = 'Kids Movies' THEN replace(mp.file,'/movies/','/mnt/user/Kid_Movies/')
                WHEN mp.file LIKE '%/movies/%'      THEN replace(mp.file,'/movies/','/mnt/user/Movies/')
                ELSE mp.file
            END AS file_path,
            mp.file AS original_file,
            'KIDS' as source
        FROM kids.metadata_items AS mi
        JOIN kids.library_sections AS ls ON mi.library_section_id = ls.id
        JOIN kids.media_items AS mitem ON mitem.metadata_item_id = mi.id
        JOIN kids.media_parts AS mp ON mp.media_item_id = mitem.id
        LEFT JOIN (SELECT MAX(datetime(viewed_at, 'unixepoch', 'localtime')) AS viewed_at, guid FROM kids.metadata_item_views GROUP BY guid) miv ON miv.guid = mi.guid
        WHERE ls.name IN ('Movies','TV Shows', 'Kids Movies', 'Kids TV Shows')

        UNION ALL

        -- BACKUP SERVER
        SELECT 
            CASE WHEN mi.guid LIKE '%local%' THEN hints ELSE mi.guid END AS guid,
            datetime(mi.created_at, 'unixepoch', 'localtime') AS added_at,
            IFNULL(miv.viewed_at, datetime(mi.created_at, 'unixepoch', 'localtime')) AS last_active_dt,
            datetime(miv.viewed_at, 'unixepoch', 'localtime') AS viewed_at,
            CASE 
                WHEN mp.file LIKE '%/Kid_TV/%'      THEN replace(mp.file,'/Kid_TV/','/mnt/user/Kid_TV_Shows/')
                WHEN mp.file LIKE '%/4k_movies/%'   THEN replace(mp.file,'/4k_movies/','/mnt/user/4k_Movies/')
                WHEN mp.file LIKE '%Kid_movies%'    THEN replace(mp.file,'/Kid_movies/','/mnt/user/Kid_Movies/')
                WHEN mp.file LIKE '%/Kid_tvshows/%' THEN replace(mp.file,'/Kid_tvshows/','/mnt/user/Kid_TV_Shows/')
                WHEN mp.file LIKE '%/4k_tv_shows/%' THEN replace(mp.file,'/4k_tv_shows/','/mnt/user/4k_TV_Shows/')
                WHEN mp.file LIKE '%/tvshows/%'     THEN replace(mp.file,'/tvshows/','/mnt/user/Kid_TV_Shows/')
                WHEN mp.file LIKE '%/tv_shows/%'    THEN replace(mp.file,'/tv_shows/','/mnt/user/TV_Shows/')
                WHEN mp.file LIKE '%/tv/%'          THEN replace(mp.file,'/tv/','/mnt/user/TV_Shows/')
                WHEN mp.file LIKE '%/4k_Movies/%'   THEN replace(mp.file,'/4k_Movies/','/mnt/user/4k_Movies/')
                WHEN mp.file LIKE '%/Kid_Movies/%'  THEN replace(mp.file,'/Kid_Movies/','/mnt/user/Kid_Movies/')
                WHEN mp.file LIKE '%/movies/%' AND ls.name = 'Kids Movies' THEN replace(mp.file,'/movies/','/mnt/user/Kid_Movies/')
                WHEN mp.file LIKE '%/movies/%'      THEN replace(mp.file,'/movies/','/mnt/user/Movies/')
                ELSE mp.file
            END AS file_path,
            mp.file AS original_file,
            'BACKUP' as source
        FROM backup.metadata_items AS mi
        JOIN backup.library_sections AS ls ON mi.library_section_id = ls.id
        JOIN backup.media_items AS mitem ON mitem.metadata_item_id = mi.id
        JOIN backup.media_parts AS mp ON mp.media_item_id = mitem.id
        LEFT JOIN (SELECT MAX(datetime(viewed_at, 'unixepoch', 'localtime')) AS viewed_at, guid FROM backup.metadata_item_views GROUP BY guid) miv ON miv.guid = mi.guid
        WHERE ls.name IN ('Movies','TV Shows', 'Kids Movies', 'Kids TV Shows')
      )
      WHERE file_path IS NOT NULL 
        AND file_path NOT LIKE '%placeholders%'
      GROUP BY guid, file_path;
    `;
    
    console.log("🚀 Executing Sync...");
    db.exec(syncQuery);
    
    const result = db.prepare('SELECT count(*) as count FROM cleanup_queue').get() as { count: number };
    console.log(`✅ Sync Complete! ${result.count} items in cleanup queue.`);
    
    return { success: true, count: result.count };

  } catch (error) {
    console.error('❌ Sync Failed:', error);
    throw error;
  } finally {
    try {
      db.exec("DETACH DATABASE main_plex");
      db.exec("DETACH DATABASE kids");
      db.exec("DETACH DATABASE backup");
    } catch (e) { }
    if (db.open) db.close();
  }
}