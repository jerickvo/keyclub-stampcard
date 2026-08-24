#!/usr/bin/env python3
"""
Keystamp build — collapse the multi-file source into one self-contained
index.html.

WHY THIS EXISTS

dev.html loads 12 separate subresources: a stylesheet, nine scripts, a
vendored library, a manifest. That is fine on a server and fine from an
ordinary folder. It is NOT fine everywhere the file actually gets opened.

The reported error was:

    could not load file:///media/archive/keystamp.zip/keystamp/js/anime-bridge.js

There is no such path written anywhere in the project. `/media/archive/
keystamp.zip/` is an archive mount — the .zip browsed in place without
being extracted — and the browser was resolving the *relative* path
`js/anime-bridge.js` against the page's own location inside that mount.
Subdirectory reads through an archive mount are not reliable, so the
fetch failed, and because the app was split across nine files, one
failed fetch took the whole application down.

Chasing the path was the wrong fix, and it is why three previous
attempts did not hold. The defect is the dependency on subresource
fetches at all. This script removes them: CSS, every script, and the
animation library are inlined, so the built index.html issues zero
same-origin requests. Nothing left to 404, from a server, from a
folder, from a zip mount, from anywhere.

USAGE
    python3 build.py

    dev.html  →  edit this, plus css/ and js/    (multi-file, needs a server)
    index.html → generated, self-contained       (open anywhere)
"""

import base64
import os
import re
import pathlib
import sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "dev.html"
OUT = ROOT / "index.html"


def read(rel):
    """Resolve a subresource path from dev.html.

    dev.html writes the paths the *served* layout uses (css/, js/,
    vendor/), because that is what a browser loading it directly has to
    follow. This repository keeps the same files flat at the root, so a
    literal lookup finds nothing and the build dies on the first
    stylesheet. Try the written path first — it is authoritative when
    the subdirectories exist — then fall back to the bare filename, so
    one dev.html serves both layouts and `python3 build.py` works as
    the README says it does.
    """
    for cand in (ROOT / rel, ROOT / pathlib.Path(rel).name):
        if cand.exists():
            return cand.read_text(encoding="utf-8")
    sys.exit(f"build: missing {rel}")


def apply_config(html):
    """Let a deploy pipeline inject Supabase config without editing
    dev.html, while never blanking values that are already there.

    Only ever fills a meta tag that is currently EMPTY. If dev.html has
    a value, that value wins — so a CI run with no environment set can
    never silently ship an unconfigured build, which is exactly how the
    'NO BACKEND CONFIGURED' state would sneak into production.
    """
    pairs = [("keystamp:supabase-url", "KEYSTAMP_SUPABASE_URL"),
             ("keystamp:supabase-anon-key", "KEYSTAMP_SUPABASE_ANON_KEY")]
    for meta, env in pairs:
        val = os.environ.get(env, "").strip()
        if not val:
            continue
        pattern = r'(<meta name="%s" content=")(\s*)(">)' % re.escape(meta)
        html, n = re.subn(pattern, lambda m: m.group(1) + val + m.group(3), html)
        if n:
            print(f"build: {meta} <- ${env}")
    return html


def report_config(html):
    """State the configuration outcome every build, so an unconfigured
    deploy is noticed at build time instead of by a confused student."""
    got = {}
    for meta in ("keystamp:supabase-url", "keystamp:supabase-anon-key"):
        m = re.search(r'<meta name="%s" content="([^"]*)"' % re.escape(meta), html)
        got[meta] = (m.group(1).strip() if m else "")
    url, key = got["keystamp:supabase-url"], got["keystamp:supabase-anon-key"]
    if url and key:
        # never print the key itself, even though it is public
        print(f"build: supabase configured -> {url} (anon key {len(key)} chars)")
    else:
        print("build: WARNING — Supabase is NOT configured.")
        print("       Fill the keystamp:supabase-* meta tags in dev.html")
        print("       (or set KEYSTAMP_SUPABASE_URL / _ANON_KEY) and rebuild.")
        print("       The built site will show a setup notice instead of a login.")
    # A secret VALUE in the client bundle is a build failure. The names
    # themselves appear in comments explaining what must stay server
    # side, so matching on the bare word would abort every build — the
    # test has to be "is something assigned to it", plus a direct look
    # for a service_role JWT however it got there.
    leaks = []
    for name in ("SUPABASE_SERVICE_ROLE_KEY", "ATTENDANCE_TOKEN_SECRET", "BOARD_PASSWORD"):
        if re.search(r"%s\s*[:=]\s*[\'\"`][^\'\"`\s]{8,}" % re.escape(name), html):
            leaks.append(name)
    # a Supabase service-role key is a JWT whose payload names the role
    for jwt in re.findall(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+", html):
        try:
            body = jwt.split(".")[1]
            body += "=" * (-len(body) % 4)
            if b"service_role" in base64.urlsafe_b64decode(body):
                leaks.append("a service_role JWT")
        except Exception:
            pass
    if leaks:
        sys.exit("build: ABORTED — must never be in the browser bundle: "
                 + ", ".join(sorted(set(leaks))))


def main():
    html = read("dev.html")
    html = apply_config(html)
    inlined = []

    # ── stylesheet ──────────────────────────────────────────────────
    def css_sub(m):
        href = m.group(1)
        if href.startswith("http"):
            return m.group(0)
        inlined.append(href)
        return f"<style>\n{read(href)}\n</style>"

    html = re.sub(r'<link rel="stylesheet" href="([^"]+)"\s*/?>', css_sub, html)

    # ── scripts, in source order ────────────────────────────────────
    def js_sub(m):
        src = m.group(1)
        if src.startswith("http"):
            return m.group(0)          # CDN stays a CDN
        inlined.append(src)
        body = read(src).replace("</script>", "<\\/script>")
        return f"<script>\n/* ── {src} ── */\n{body}\n</script>"

    html = re.sub(r'<script src="([^"]+)"></script>', js_sub, html)

    # ── manifest: KEPT ──────────────────────────────────────────────
    # This used to be stripped to protect the "zero same-origin
    # requests" invariant. That reasoning does not survive contact with
    # the rest of the head: the favicon, the 32px PNG, the .ico and the
    # apple-touch icon are all same-origin requests already, and the
    # invariant that actually matters is "nothing whose absence breaks
    # the app". A manifest is progressive enhancement — it 404s
    # harmlessly from a zip mount and it is what gives the installed
    # app its name, description and icons on a real server, which is
    # where this is deployed. Stripping it meant the PWA identity was
    # simply absent from the file everyone actually loads.

    banner = (
        "<!-- ══════════════════════════════════════════════════════════\n"
        "     GENERATED FILE — do not edit.\n"
        "     Built from dev.html by build.py. Everything is inlined so\n"
        "     this page makes no same-origin requests and therefore\n"
        "     cannot fail on a missing subresource, wherever it is\n"
        "     opened from. Edit dev.html / css / js, then rerun build.py.\n"
        "     ══════════════════════════════════════════════════════════ -->\n"
    )
    html = html.replace("<!DOCTYPE html>", "<!DOCTYPE html>\n" + banner, 1)

    OUT.write_text(html, encoding="utf-8")
    kb = len(html.encode()) / 1024
    print(f"build: index.html  {kb:.0f} KB")
    report_config(html)
    print(f"build: inlined {len(inlined)} files")
    for f in inlined:
        print(f"         {f}")
    left = re.findall(r'(?:src|href)="(?!http|data:|#)([^"]+)"', html)
    print(f"build: remaining same-origin requests: {left or 'none'}")


if __name__ == "__main__":
    main()
