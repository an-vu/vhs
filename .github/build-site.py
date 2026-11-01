#!/usr/bin/env python3
"""Build the published site into _site/, following links out from the public pages.

Local asset references are versioned with a content hash (?v=...), so browsers
fetch exactly the files that changed. Source files never carry version strings.
GitHub Actions runs this on every push; run it locally to preview the output.
"""

import hashlib
import json
import re
import shutil
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "_site"
DOMAIN = (ROOT / "CNAME").read_text().strip()  # Full addresses on this domain are local files too.
PAGES = {"index.html", "about.html", "work.html", "services.html", "contact.html", "faq.html", "legal.html", "404.html"}
SEEDS = PAGES | {"robots.txt", "sitemap.xml", "site.webmanifest", "CNAME", "llms.txt", "agents.md"}
EXTENSIONS = {".html", ".css", ".js", ".json", ".webmanifest", ".txt", ".md", ".xml",
              ".svg", ".ico", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif",
              ".glb", ".gltf", ".bin", ".ply", ".woff", ".woff2", ".mp4", ".webm"}
JS_URLS = re.compile(r"(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*|\bnew\s+URL\s*\(\s*)(['\"])(.*?)\1")
CSS_URLS = re.compile(r"url\(\s*['\"]?([^)'\"\s]+)|@import\s+['\"]([^'\"]+)")
STAMPED = {".html", ".css", ".js", ".webmanifest"}  # Files whose references get versions.


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        # The link preview picture: versioned like any file, so apps and Google fetch
        # a new card instead of keeping the one they saved.
        if tag == "meta" and dict(attrs).get("property") == "og:image" and dict(attrs).get("content"):
            self.urls.append(dict(attrs)["content"])
        for name, value in attrs:
            if not value:
                continue
            if name in {"href", "src", "poster"}:
                self.urls.append(value)
            elif name == "srcset":
                self.urls.extend(item.strip().split()[0] for item in value.split(",") if item.strip())
            elif name == "style":
                self.urls.extend(css_urls(value))


def css_urls(text):
    return [first or second for first, second in CSS_URLS.findall(text)]


def dependencies(path):
    text = (ROOT / path).read_text() if Path(path).suffix in {".html", ".css", ".js", ".webmanifest", ".gltf"} else ""
    if path.endswith(".html"):
        links = Links()
        links.feed(text)
        return links.urls
    if path.endswith(".js"):
        return [url for _, url in JS_URLS.findall(text) if url.startswith(("/", "./", "../"))]
    if path.endswith(".css"):
        return css_urls(text)
    if path.endswith(".webmanifest"):
        return [icon["src"] for icon in json.loads(text).get("icons", [])]
    if path.endswith(".gltf"):
        data = json.loads(text)
        return [item["uri"] for key in ("buffers", "images") for item in data.get(key, []) if "uri" in item]
    return []


def local_path(url, parent):
    parts = urlsplit(url)
    own = parts.scheme == "https" and parts.netloc == DOMAIN
    if (parts.scheme or parts.netloc) and not own or not parts.path:
        return None
    base = ROOT if parts.path.startswith("/") else (ROOT / parent).parent
    candidate = base / unquote(parts.path).lstrip("/")
    # A clean page URL (/work) is its page (work.html), as GitHub Pages serves it.
    page = candidate.with_name(candidate.name + ".html")
    if not candidate.exists() and page.is_file():
        candidate = page
    if candidate.is_symlink():
        raise ValueError(f"Symlink dependency: {url} in {parent}")
    resolved = candidate.resolve()
    if not resolved.is_relative_to(ROOT):
        raise ValueError(f"Dependency outside the site: {url} in {parent}")
    if resolved == ROOT:
        return "index.html"
    return resolved.relative_to(ROOT).as_posix()


def public_files():
    pending, found = list(SEEDS), set()
    while pending:
        path = pending.pop()
        if path in found:
            continue
        source = ROOT / path
        # A folder URL (new URL('logos/', import.meta.url)): the script names the files
        # in it at run time, so every publishable file directly inside it goes out.
        if source.is_dir() and not source.is_symlink():
            pending.extend(child.relative_to(ROOT).as_posix() for child in sorted(source.iterdir())
                           if child.is_file() and child.suffix in EXTENSIONS - {".html"}
                           and not child.name.startswith("."))
            continue
        # A link to a lab file works on the local server but not live, so it lands here.
        if not source.is_file() or source.is_symlink():
            raise ValueError(f"Missing or invalid public dependency: {path}")
        if (Path(path).parts[0] == OUTPUT.name
                or any(part.startswith(".") for part in Path(path).parts)
                or (source.suffix not in EXTENSIONS and path != "CNAME")
                or (source.suffix == ".html" and path not in PAGES)):
            raise ValueError(f"Not a publishable file: {path}")
        found.add(path)
        for url in dependencies(path):
            dependency = local_path(url, path)
            if dependency:
                pending.append(dependency)
    return found


def versioned(text, url, version):
    """Append ?v= to each exact occurrence of a quoted, url()- or srcset-delimited reference."""
    parts = urlsplit(url)
    stamped = parts._replace(query=f"v={version}").geturl()
    pattern = re.compile(r"(?<=['\"(\s,=])" + re.escape(url) + r"(?=['\")\s,])")
    return pattern.sub(lambda _: stamped, text)


def stamp(files):
    """Return each file's published bytes, with references versioned by content hash.

    A file's hash covers its rewritten references, so a change deep in the import
    graph also renames every file that leads to it. Links between pages stay clean.
    """
    output, hashes = {}, {}

    def visit(path, trail):
        if path in hashes:
            return hashes[path]
        if path in trail:
            raise ValueError("Circular dependency: " + " -> ".join(trail + (path,)))
        data = (ROOT / path).read_bytes()
        if Path(path).suffix in STAMPED:
            text = data.decode()
            for url in sorted(set(dependencies(path)), key=len, reverse=True):
                target = local_path(url, path)
                # Pages and folders keep clean URLs (a folder's files carry no version).
                if target and not target.endswith(".html") and not (ROOT / target).is_dir():
                    text = versioned(text, url, visit(target, trail + (path,)))
            data = text.encode()
        output[path] = data
        hashes[path] = hashlib.sha256(data).hexdigest()[:10]
        return hashes[path]

    for path in sorted(files):
        visit(path, ())
    return output


# A plain-text copy of each page for AI tools and readers (/about.md; Home is
# /index.md), made from the page itself at publish time so it never drifts. Its
# main content as markdown, under the page's title and Google text.
MARKDOWN = ["index.html", "about.html", "work.html", "services.html", "contact.html", "faq.html", "legal.html"]
SKIPPED = {"script", "style", "svg", "button", "template", "figure", "picture", "img", "noscript"}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


class Markdown(HTMLParser):
    """Turns a page into markdown: <title>, the description, and what's in <main>.

    Left out: anything hidden from people (aria-hidden, hidden, except Work's project
    panels, which only wait for a click), pictures, buttons and placeholders.
    """

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title, self.description, self.canonical = "", "", ""
        self.in_title = False
        self.stack, self.skip, self.main = [], 0, 0
        self.blocks, self.line, self.link, self.depth = [], "", None, 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta" and a.get("name") == "description":
            self.description = a.get("content", "")
        if tag == "link" and a.get("rel") == "canonical":
            self.canonical = a.get("href", "")
        if tag == "title":
            self.in_title = True
        if tag in VOID:
            return
        hidden = (a.get("aria-hidden") == "true" or ("hidden" in a and a.get("role") != "tabpanel")
                  or tag in SKIPPED or "project-image-placeholder" in (a.get("class") or ""))
        # A section's own list is its rows (Legal, FAQ): their titles become headings.
        rows = tag in {"ul", "ol"} and bool(self.stack) and self.stack[-1][0] == "section"
        self.stack.append((tag, hidden, rows))
        if hidden:
            self.skip += 1
        if tag == "main":
            self.main += 1
        if not self.main or self.skip:
            return
        if tag in {"p", "h1", "h2", "h3", "h4", "summary", "li", "figcaption"}:
            self.flush()
        if tag in {"ul", "ol"} and not rows:
            self.flush()
            self.depth += 1
        if tag == "a":
            self.link = a.get("href", "")
            self.line += "["
        if tag in {"strong", "b"}:
            self.line += "**"

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if tag in VOID or not self.stack:
            return
        while self.stack:
            open_tag, hidden, rows = self.stack.pop()
            inside = self.main and not self.skip
            if hidden:
                self.skip -= 1
            if open_tag == "main":
                self.flush()
                self.main -= 1
            if inside and not rows:
                self.close(open_tag)
            if open_tag == tag:
                break

    def close(self, tag):
        if tag == "a" and self.link is not None:
            href = self.link
            if href.startswith("/"):
                href = f"https://{DOMAIN}{href}"
            self.line += f"]({href})"
            self.link = None
            # A menu's links (Home's, About's) become a list.
            if any(entry[0] == "nav" for entry in self.stack):
                self.flush("- ", list_item=True)
        elif tag in {"strong", "b"}:
            self.line += "**"
        elif tag in {"h1", "h2", "h3", "h4", "summary"}:
            level = {"h1": 1, "h2": 2, "h3": 3, "h4": 4, "summary": 3}[tag]
            # A heading inside an open row (Legal's) sits under the row's own.
            if tag in {"h3", "h4"} and any(entry[0] == "details" for entry in self.stack):
                level += 1
            self.flush("#" * level + " ")
        elif tag == "li":
            self.flush("  " * (self.depth - 1) + "- ", list_item=True)
        elif tag in {"ul", "ol"}:
            self.flush()
            self.depth -= 1
            self.blocks.append("")
        elif tag == "nav":
            self.flush()
            self.blocks.append("")
        elif tag in {"p", "figcaption", "div", "section", "details"}:
            self.flush()

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        elif self.main and not self.skip:
            self.line += data

    def flush(self, prefix="", list_item=False):
        text = " ".join(self.line.split()).replace("[ ", "[").replace(" ]", "]")
        self.line = ""
        if not text:
            return
        if list_item:
            self.blocks.append(prefix + text)
        else:
            if self.blocks and self.blocks[-1] != "":
                self.blocks.append("")
            self.blocks.append(prefix + text)
            self.blocks.append("")

    def text(self):
        body = "\n".join(self.blocks)
        body = re.sub(r"\n{3,}", "\n\n", body).strip()
        head = f"# {' '.join(self.title.split())}\n\n> {self.description}\n\nSource: {self.canonical}"
        return f"{head}\n\n{body}\n"


def markdown(path):
    page = Markdown()
    page.feed((ROOT / path).read_text())
    return page.text().encode()


def main():
    files = stamp(public_files())
    for page in MARKDOWN:
        files[Path(page).with_suffix(".md").as_posix()] = markdown(page)
    shutil.rmtree(OUTPUT, ignore_errors=True)
    for path, data in sorted(files.items()):
        target = OUTPUT / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    size = sum(len(data) for data in files.values())
    print(f"Built {len(files)} files ({size / 1024 / 1024:.1f} MB) into {OUTPUT}")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as error:
        raise SystemExit(f"Build failed: {error}")
