#!/usr/bin/env python3
"""Final migration of remaining files from styles.ts to CSS variables.
Correctly handles per-file import removal without breaking other imports."""

import os, re

PROJECT = "/Users/vassilispapadop/Documents/Projects/openf1ow/f1-app"

# All mappings: (old, new), longest first
ALL_REPLACEMENTS = [
    # C.* replacements
    ('C.bg', "'var(--bg)'"),
    ('C.surface', "'var(--surface)'"),
    ('C.surfaceAlt', "'var(--surface-alt)'"),
    ('C.surfaceHi', "'var(--surface-hi)'"),
    ('C.border', "'var(--border)'"),
    ('C.borderStrong', "'var(--border-strong)'"),
    ('C.text', "'var(--text)'"),
    ('C.textDim', "'var(--text-dim)'"),
    ('C.textMute', "'var(--text-mute)'"),
    ('C.textFaint', "'var(--text-faint)'"),
    ('C.accent', "'var(--accent)'"),
    ('C.accentDim', "'var(--accent-dim)'"),
    ('C.pos', "'var(--pos)'"),
    ('C.posDim', "'var(--pos-dim)'"),
    ('C.posBg', "'var(--pos-bg)'"),
    ('C.warn', "'var(--warn)'"),
    ('C.warnDim', "'var(--warn-dim)'"),
    ('C.neg', "'var(--neg)'"),
    ('C.negBar', "'var(--neg-bar)'"),
    ('C.violet', "'var(--violet)'"),
    # sty.* replacements
    ('sty.card', "'card'"),
    ('sty.sectionHead', "'section-head'"),
    ('sty.th', "'th'"),
    ('sty.td', "'td'"),
    ('sty.mono', "'mono'"),
    ('sty.stat', "'stat'"),
    ('sty.statLabel', "'stat-label'"),
    ('sty.gap', "'gap'"),
    # Other
    ('isNarrowViewport()', '(window.innerWidth < 600)'),
]


def migrate_file(filepath):
    """Migrate a single file."""
    with open(filepath) as f:
        lines = f.readlines()
    
    removed_import_names = set()
    new_lines = []
    i = 0
    
    while i < len(lines):
        line = lines[i]
        
        # Check if this is a styles import line
        if 'styles' in line and 'import' in line:
            # Extract what's being imported from styles
            # Pattern: import { X, Y, Z } from '...styles...'
            m = re.search(r'import\s*\{([^}]*)\}\s*from\s*[\'"][^\'"]*styles[^\'"]*[\'"]', line)
            if m:
                imports_str = m.group(1)
                names = [n.strip() for n in imports_str.split(',') if n.strip()]
                removed_import_names.update(names)
                # Remove this line entirely
                print(f"  Removed styles import, names: {names}")
                i += 1
                continue
            # Pattern: import X from '...styles...'
            m2 = re.search(r'import\s+(\w+)\s+from\s*[\'"][^\'"]*styles[^\'"]*[\'"]', line)
            if m2:
                removed_import_names.add(m2.group(1))
                print(f"  Removed single import '{m2.group(1)}'")
                i += 1
                continue
        
        new_lines.append(line)
        i += 1
    
    content = ''.join(new_lines)
    
    # Apply replacements (longest first)
    for old, new in ALL_REPLACEMENTS:
        content = content.replace(old, new)
    
    # Clean up blank lines from import removal
    content = re.sub(r'\n{3,}', '\n\n', content)
    
    # Clean up trailing whitespace on lines
    content = '\n'.join(l.rstrip() for l in content.split('\n'))
    
    # Write back
    with open(filepath, 'w') as f:
        f.write(content)
    
    return len(removed_import_names) > 0


def main():
    result = os.popen(
        f'cd {PROJECT} && grep -rln "from.*lib/styles" src/ 2>/dev/null').read().strip()
    
    files = [f for f in result.split('\n') if f]
    print(f"Total files to migrate: {len(files)}")
    
    migrated = 0
    for filepath in files:
        full = os.path.join(PROJECT, filepath)
        if not os.path.exists(full):
            continue
        
        print(f"\n{filepath}:")
        changed = migrate_file(full)
        if changed:
            migrated += 1
        else:
            print(f"  No styles import found")
    
    print(f"\n\nMigrated {migrated}/{len(files)} files")


if __name__ == '__main__':
    main()
