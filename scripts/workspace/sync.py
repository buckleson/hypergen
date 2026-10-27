# Copies the agent workspace (session transcripts, plans, ADR/HANDOFF/TODO,
# agent definitions, workflows, memory, logos) into .workspace/ so another
# machine can clone the repo and continue the work. Secrets are redacted in
# copies; a secret in a tracked source file aborts with exit code 1.
#   python scripts/workspace/sync.py

import gzip
import os
import re
import shutil
import subprocess
import sys

REPO = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(REPO, '.workspace')
WORKSPACE = os.environ.get('HYPERGEN_WORKSPACE', 'E:/research-clones')
CLAUDE_DATA = os.environ.get('HYPERGEN_CLAUDE_DATA', 'E:/claude-data')
PROJECT = os.path.join(CLAUDE_DATA, 'projects', 'E--research-clones')

SECRETS = re.compile(
    r'(gh[oprsu]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-ant-[A-Za-z0-9_-]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{32,}'
    r'|AIza[0-9A-Za-z_-]{35}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----'
    r'|eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}'
    r'|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{32})')


def redact(text):
    return SECRETS.sub('[REDACTED]', text)


def copy_text(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(src, encoding='utf-8', errors='replace') as f:
        data = redact(f.read())
    with open(dst, 'w', encoding='utf-8', newline='\n') as f:
        f.write(data)


def copy_tree(src, dst, gz=False):
    if not os.path.isdir(src):
        return
    for root, _, files in os.walk(src):
        for name in files:
            s = os.path.join(root, name)
            rel = os.path.relpath(s, src)
            d = os.path.join(dst, rel)
            if name.endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp')):
                os.makedirs(os.path.dirname(d), exist_ok=True)
                shutil.copy2(s, d)
            elif gz and name.endswith('.jsonl'):
                os.makedirs(os.path.dirname(d), exist_ok=True)
                with open(s, encoding='utf-8', errors='replace') as f:
                    data = redact(f.read())
                with gzip.open(d + '.gz', 'wt', encoding='utf-8') as f:
                    f.write(data)
            else:
                copy_text(s, d)


def scan_tracked():
    files = subprocess.run(['git', 'ls-files'], cwd=REPO, capture_output=True, text=True, check=True).stdout.split('\n')
    hits = []
    for rel in filter(None, files):
        if rel.startswith('.workspace/') or rel.endswith(('.png', '.jpg', '.gif', '.ico', '.icns', '.webp', '.ttf', '.woff2', '.onnx')):
            continue
        try:
            with open(os.path.join(REPO, rel), encoding='utf-8', errors='ignore') as f:
                for n, line in enumerate(f, 1):
                    if SECRETS.search(line):
                        hits.append(f'{rel}:{n}')
        except OSError:
            pass
    return hits


def main():
    hits = scan_tracked()
    if hits:
        print('Secret-like strings in tracked files; fix before pushing:\n  ' + '\n  '.join(hits))
        sys.exit(1)
    shutil.rmtree(OUT, ignore_errors=True)
    copy_tree(os.path.join(WORKSPACE, 'docs', 'agents'), os.path.join(OUT, 'docs', 'agents'))
    for name in ('TODO.md', 'CLAUDE.md'):
        if os.path.exists(os.path.join(WORKSPACE, name)):
            copy_text(os.path.join(WORKSPACE, name), os.path.join(OUT, name))
    copy_tree(os.path.join(WORKSPACE, '.claude', 'agents'), os.path.join(OUT, 'claude', 'agents'))
    copy_tree(os.path.join(WORKSPACE, '.claude', 'workflows'), os.path.join(OUT, 'claude', 'workflows'))
    copy_tree(os.path.join(WORKSPACE, 'logos'), os.path.join(OUT, 'logos'))
    # only this project's plans; the plans folder is shared with unrelated work
    for name in os.environ.get('HYPERGEN_PLANS', 'first-i-want-to-flickering-umbrella.md').split(','):
        src = os.path.join(CLAUDE_DATA, 'plans', name)
        if os.path.exists(src):
            copy_text(src, os.path.join(OUT, 'plans', name))
    copy_tree(os.path.join(PROJECT, 'memory'), os.path.join(OUT, 'memory'))
    for name in os.listdir(PROJECT) if os.path.isdir(PROJECT) else []:
        path = os.path.join(PROJECT, name)
        if name.endswith('.jsonl'):
            copy_tree_file = os.path.join(OUT, 'sessions', name)
            os.makedirs(os.path.dirname(copy_tree_file), exist_ok=True)
            with open(path, encoding='utf-8', errors='replace') as f:
                data = redact(f.read())
            with gzip.open(copy_tree_file + '.gz', 'wt', encoding='utf-8') as f:
                f.write(data)
        elif os.path.isdir(path) and name != 'memory':
            copy_tree(path, os.path.join(OUT, 'sessions', name), gz=True)
    copy_text(os.path.join(os.path.dirname(__file__), 'RESUME.md'), os.path.join(OUT, 'README.md'))
    print(f'Synced workspace into {OUT}')


if __name__ == '__main__':
    main()
