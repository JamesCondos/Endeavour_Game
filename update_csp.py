"""Refresh or check the inline script/style security hashes in index.html."""

import argparse
import base64
import hashlib
from pathlib import Path
import re


def refresh_hashes(html):
    # Browsers normalize HTML line endings before hashing inline content.
    html = html.replace("\r\n", "\n").replace("\r", "\n")
    hashes = {"script": [], "style": []}
    for match in re.finditer(
        r"<(script|style)\b([^>]*)>(.*?)</\1\s*>", html, re.DOTALL | re.IGNORECASE
    ):
        tag, attributes, content = match.groups()
        if tag.lower() == "script" and re.search(r"\bsrc\s*=", attributes, re.I):
            continue
        digest = base64.b64encode(
            hashlib.sha256(content.encode("utf-8")).digest()
        ).decode("ascii")
        hashes[tag.lower()].append(f"'sha256-{digest}'")

    policy = re.search(
        r'(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")',
        html,
        re.IGNORECASE,
    )
    if policy is None:
        raise ValueError("Expected a Content-Security-Policy meta tag.")
    content = policy.group(2)
    for tag, tokens in hashes.items():
        if not tokens:
            raise ValueError(f"No inline {tag} blocks found.")
        directive = re.compile(rf"(\b{tag}-src\s+)([^;]*)")

        def replace(match):
            sources = re.sub(r"'sha(?:256|384|512)-[^']+'", "", match.group(2))
            sources = " ".join(sources.split())
            return match.group(1) + " ".join([sources, *tokens]).strip()

        content, count = directive.subn(replace, content)
        if count != 1:
            raise ValueError(f"Expected one {tag}-src directive.")
    return html[:policy.start(2)] + content + html[policy.end(2):]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check without editing.")
    parser.add_argument("file", nargs="?", type=Path, default=Path(__file__).with_name("index.html"))
    args = parser.parse_args()
    original = args.file.read_text(encoding="utf-8")
    updated = refresh_hashes(original)
    if args.check:
        if updated != original:
            print(f"Security hashes are out of date in {args.file.name}. Run python update_csp.py.")
            return 1
        print(f"All inline script/style security hashes match in {args.file.name}.")
    elif updated != original:
        args.file.write_text(updated, encoding="utf-8", newline="\n")
        print(f"Updated security hashes in {args.file.name}.")
    else:
        print(f"Security hashes are already current in {args.file.name}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
