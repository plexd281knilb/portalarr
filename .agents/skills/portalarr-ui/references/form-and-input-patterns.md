# Form & Input Design Patterns in Portalarr

Settings, access control, media request forms, curation filters, and integration setups follow structured form patterns to ensure clarity, immediate validation feedback, and data safety.

---

## 1. Autocomplete & Dropdown Lists (`onMouseDown`)

When building suggestion dropdowns (e.g. Title/Author autocomplete, Plex server chooser, TMDb quick-search):
- **CRITICAL**: Use `onMouseDown` instead of `onClick` on dropdown suggestion items!
- **Why**: When an `<input />` has an `onBlur` handler that closes the dropdown, a user's click triggers `onBlur` on the input *before* the `onClick` event fires on the list item, causing the suggestion item to unmount prematurely. `onMouseDown` fires *before* `onBlur`, ensuring the item selection registers reliably every time.

```tsx
<div
  key={item.id}
  onMouseDown={(e) => {
    e.preventDefault(); // Prevents input blur
    handleSelectItem(item);
  }}
  className="px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-amber-400 cursor-pointer flex items-center justify-between transition-colors"
>
  <span>{item.title}</span>
</div>
```

---

## 2. Dirty State Warnings & Floating Save Bars

To prevent users from losing unpersisted settings changes when navigating across tabs or pages:
1. **Dirty Detection**: Compare current component states against `baselineSettings`.
2. **Visual Highlight**:
   ```tsx
   <Card className={`transition-all duration-300 ${isDirty ? 'border-2 border-amber-500/70 shadow-[0_0_20px_rgba(245,158,11,0.2)]' : 'border-slate-800'}`}>
   ```
3. **Card Header Badge & Save Trigger**:
   ```tsx
   <Button
     onClick={handleSave}
     disabled={saving}
     size="sm"
     className={isDirty ? "bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold" : "bg-slate-800 text-slate-300"}
   >
     {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
     {savedMsg ? "Saved!" : isDirty ? "Save Changes *" : "Save Settings"}
   </Button>
   ```

---

## 3. Sensitive Tokens & Password Visibility

- Mask tokens by default (`type="password"`).
- Provide an inline visibility toggle with Lucide `<Eye />` / `<EyeOff />`.
- Use a mono font for tokens, hashes, and URLs (`font-mono text-xs`).

```tsx
<div className="relative">
  <Input
    type={showToken ? "text" : "password"}
    value={token}
    onChange={(e) => setToken(e.target.value)}
    className="bg-slate-950 border-slate-700 pr-10 font-mono text-xs text-slate-200"
  />
  <button
    type="button"
    onClick={() => setShowToken(!showToken)}
    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
  >
    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
  </button>
</div>
```

---

## 4. Live Connection Diagnostic Buttons ("Test")

All third-party integration fields (Plex, Tautulli, Glances, Radarr, Sonarr, Prowlarr, SABnzbd, qBittorrent, SMTP, IMAP) must feature a live `"Test"` button that calls the backend diagnostic server action with immediate feedback badges (🟢 Connected vs 🔴 Connection Failed with detailed error text).

---

## 5. Standard Input Sizing & Styling

- **Standard Inputs**: `h-9 text-xs sm:text-sm bg-slate-950 border-slate-700 text-slate-100 rounded-lg placeholder:text-slate-500 focus:border-amber-400 focus:ring-1 focus:ring-amber-400`.
- **Compact Inputs / Select Triggers**: `h-8 text-xs bg-slate-900 border-slate-700 text-slate-200 rounded-md`.
- **Field Labels**: `text-xs font-semibold text-slate-300 flex items-center gap-1.5`.
- **Help / Description Text**: `text-[11px] sm:text-xs text-slate-400 leading-relaxed`.
