#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
book_tool.py — 读书库「傻瓜式」管理与发布工具（零第三方依赖）

子命令
------
  convert   把现有 books/*.html 一键改造成「左正文 / 右笔记」双栏书页
            （保留正文原有样式，右栏自动加载同名 -notes.html 或书单里的 notes/quotes）。
            已改造过的书页会自动跳过。幂等可反复跑。

  add       新增一本书。把「正文 html」「可选笔记 html」「可选封面图」丢进来，
            再给少量字段，脚本自动：拷文件 → 包成双栏页 → 追加 books.csv → 重生 books.js。
            例：
              python3 scripts/book_tool.py add \
                --text ~/Downloads/孙子兵法.html \
                --notes ~/Downloads/孙子兵法-笔记.html \
                --cover ~/Downloads/cover.jpg \
                --title 孙子兵法 --author 孙子 --category 军事 --status done

  sync      仅用 data/books.csv 重新生成 data/books.js（本地预览/兜底用）。

设计约定
--------
  书页路径：books/<id>.html          （正文，放在 .book-text 里）
  笔记路径：books/<id>-notes.html     （可选；与书页同名）
  封面路径：images/<id>.<ext>         （CSV 的 cover 字段填 "images/<id>.<ext>"）
  没有笔记页时，右栏回退显示 books.csv 里该书的 notes / quotes 字段。
"""
import argparse, csv, json, os, re, shutil, sys, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOKS_DIR = os.path.join(ROOT, "books")
IMAGES_DIR = os.path.join(ROOT, "images")
DATA_DIR = os.path.join(ROOT, "data")
CSV_PATH = os.path.join(DATA_DIR, "books.csv")
JS_PATH = os.path.join(DATA_DIR, "books.js")
TEMPLATE = os.path.join(ROOT, "templates", "book.template.html")

CSV_FIELDS = ["id","title","author","translator","publisher","year","category",
              "tags","status","progress","rating","startedAt","finishedAt","cover",
              "summary","notes","quotes","link"]


# ───────────────────────────── 模板 / 组装 ─────────────────────────────
def read_template():
    with open(TEMPLATE, encoding="utf-8") as f:
        return f.read()


def normalize_asset_paths(body):
    """书页位于 books/，把相对 assets/、images/ 修正为 ../ 前缀，避免路径错乱。"""
    body = re.sub(r'(src|href)="(assets/)', r'\1="../\2', body)
    body = re.sub(r'(src|href)="(images/)', r'\1="../\2', body)
    return body


def extract_parts(html):
    """从独立 html 抽取 title / head 额外样式 / body 内文。"""
    title = ""
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I)
    if m:
        title = m.group(1).strip()
    styles = re.findall(r"<style[^>]*>(.*?)</style>", html, re.S | re.I)
    links = re.findall(r'<link\b[^>]*rel=["\']?stylesheet["\']?[^>]*>', html, re.S | re.I)
    # 去掉指向 site 自带 assets 的 link（骨架已引入），避免重复
    links = [L for L in links if "../assets/" not in L and "assets/style.css" not in L]
    head_extra = "\n".join("<style>%s</style>" % s for s in styles)
    head_extra += "\n" + "\n".join(links)
    body = ""
    mb = re.search(r"<body[^>]*>(.*)</body>", html, re.S | re.I)
    if mb:
        body = mb.group(1)
    # 去掉正文里可能残留的脚本（骨架会统一注入 reader/split/booknav）
    body = re.sub(r"<script\b[^>]*>.*?</script>", "", body, flags=re.S | re.I)
    body = normalize_asset_paths(body)
    return title, head_extra.strip(), body.strip()


def assemble(title, head_extra, body, meta, out_path):
    tpl = read_template()
    meta_json = json.dumps(meta, ensure_ascii=False)
    html = (tpl
            .replace("{{TITLE}}", title)
            .replace("{{HEAD_EXTRA}}", head_extra)
            .replace("{{BODY}}", body)
            .replace("{{META}}", meta_json))
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    return out_path


# ───────────────────────────── CSV / books.js ─────────────────────────────
def read_csv_rows():
    rows = []
    if os.path.isfile(CSV_PATH):
        with open(CSV_PATH, encoding="utf-8", newline="") as f:
            for r in csv.reader(f):
                rows.append(r)
    return rows


def write_csv_rows(rows):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
        for r in rows:
            w.writerow(r)


def clean_row(row):
    """丢掉明显是半截输入的书（无状态、无分类、无封面、无链接）。"""
    if len(row) < 4:
        return False
    d = dict(zip(CSV_FIELDS[:len(row)], row))
    if not d.get("title", "").strip():
        return False
    if not (d.get("status") or d.get("category") or d.get("cover") or d.get("link")):
        return False
    return True


def sync_books_js():
    rows = read_csv_rows()
    header = rows[0] if rows else CSV_FIELDS
    out = []
    for r in rows[1:]:
        if not clean_row(r):
            continue
        o = {}
        for i, k in enumerate(header):
            o[k] = r[i] if i < len(r) else ""
        o["id"] = (o.get("id") or "").strip()
        o["title"] = (o.get("title") or "").strip()
        if not o["title"]:
            continue
        for key in ("tags", "quotes"):
            v = o.get(key, "")
            o[key] = [x.strip() for x in str(v).split(";") if x.strip()] if v else []
        for key in ("progress", "rating", "year"):
            v = o.get(key, "")
            o[key] = int(v) if str(v).strip().isdigit() else 0
        out.append(o)
    with open(JS_PATH, "w", encoding="utf-8") as f:
        f.write("/* 由 data/books.csv 自动生成，请勿手改。重新生成：python3 scripts/book_tool.py sync */\n")
        f.write("window.BOOKS = ")
        f.write(json.dumps(out, ensure_ascii=False, indent=2))
        f.write(";\n")
    return len(out)


def meta_from_csv(book_id):
    rows = read_csv_rows()
    if not rows:
        return {}
    header = rows[0]
    for r in rows[1:]:
        d = dict(zip(header, r))
        if (d.get("id") or "").strip() == book_id:
            notes = d.get("notes", "")
            quotes = d.get("quotes", "")
            return {
                "title": d.get("title", "").strip(),
                "notes": notes,
                "quotes": [q.strip() for q in str(quotes).split(";") if q.strip()] if quotes else [],
            }
    return {}


def append_csv(book):
    rows = read_csv_rows()
    header = rows[0] if rows else CSV_FIELDS
    # 已存在则更新
    for r in rows[1:]:
        if r and r[0].strip() == book["id"]:
            idx = rows.index(r)
            rows[idx] = [book.get(k, "") for k in header]
            write_csv_rows(rows)
            return
    row = [book.get(k, "") for k in header]
    rows.append(row)
    write_csv_rows(rows)


def slugify(s):
    s = re.sub(r"[^\w一-鿿]+", "-", s.strip()).strip("-")
    return s or "book"


# ───────────────────────────── 子命令 ─────────────────────────────
def cmd_convert(args):
    n = 0
    for fn in sorted(os.listdir(BOOKS_DIR)):
        if not fn.endswith(".html") or fn.endswith("-notes.html"):
            continue
        path = os.path.join(BOOKS_DIR, fn)
        with open(path, encoding="utf-8") as f:
            html = f.read()
        if "reader-split" in html:
            print("· 跳过（已是双栏）:", fn)
            continue
        bid = fn[:-5]
        title, head_extra, body = extract_parts(html)
        meta = meta_from_csv(bid)
        if not meta.get("title"):
            meta["title"] = title
        assemble(title or meta.get("title", bid), head_extra, body, meta, path)
        n += 1
        print("✓ 改造:", fn)
    if n:
        sync_books_js()
        print("已重建 %d 个书页，并 sync 书单。" % n)
    else:
        print("没有需要改造的书页。")


def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r, open(dest, "wb") as f:
        f.write(r.read())


def cmd_add(args):
    text_path = args.text
    if not os.path.isfile(text_path):
        sys.exit("✗ 找不到正文文件: " + text_path)
    with open(text_path, encoding="utf-8", errors="ignore") as f:
        html = f.read()
    title, head_extra, body = extract_parts(html)
    bid = args.id or slugify(args.title or title or os.path.splitext(os.path.basename(text_path))[0])
    title = args.title or title or bid

    # 笔记
    if args.notes and os.path.isfile(args.notes):
        shutil.copy(args.notes, os.path.join(BOOKS_DIR, bid + "-notes.html"))
        print("✓ 笔记页:", bid + "-notes.html")

    # 封面（本地文件或 URL）
    cover_field = ""
    if args.cover:
        if args.cover.startswith("http://") or args.cover.startswith("https://"):
            ext = os.path.splitext(urllib.parse.urlparse(args.cover).path)[1] or ".jpg"
            dest = os.path.join(IMAGES_DIR, bid + ext)
            download(args.cover, dest)
            cover_field = "images/" + bid + ext
            print("✓ 封面（下载）:", cover_field)
        elif os.path.isfile(args.cover):
            ext = os.path.splitext(args.cover)[1] or ".jpg"
            dest = os.path.join(IMAGES_DIR, bid + ext)
            shutil.copy(args.cover, dest)
            cover_field = "images/" + bid + ext
            print("✓ 封面:", cover_field)

    meta = {"title": title, "notes": args.notes_text or "", "quotes": []}
    out = os.path.join(BOOKS_DIR, bid + ".html")
    assemble(title, head_extra, body, meta, out)
    print("✓ 书页:", "books/" + bid + ".html")

    book = {
        "id": bid, "title": title, "author": args.author or "",
        "translator": args.translator or "", "publisher": args.publisher or "",
        "year": args.year or "", "category": args.category or "未分类",
        "tags": args.tags or "", "status": args.status or "done",
        "progress": args.progress or "", "rating": args.rating or "",
        "startedAt": args.started or "", "finishedAt": args.finished or "",
        "cover": cover_field, "summary": args.summary or "",
        "notes": args.notes_text or "", "quotes": args.quotes or "",
        "link": args.link or "",
    }
    append_csv(book)
    cnt = sync_books_js()
    print("✓ 已写入 books.csv 并重生 books.js（共 %d 本）" % cnt)
    if args.commit:
        os.system('git add -A && git commit -m "add book: %s" ' % title)
        print("✓ 已 git commit（push 仍由你执行：git push）")
    else:
        print("提示：git add -A && git commit -m \"add book: %s\" 后即可 push 上线。" % title)


def cmd_sync(args):
    n = sync_books_js()
    print("✓ 已重生 books.js，共 %d 本。" % n)


def main():
    p = argparse.ArgumentParser(description="读书库管理工具")
    sub = p.add_subparsers(dest="cmd")
    sub.add_parser("convert", help="现有书页改双栏")
    a = sub.add_parser("add", help="新增一本书")
    a.add_argument("--text", required=True, help="正文 HTML 路径")
    a.add_argument("--notes", help="笔记 HTML 路径（可选）")
    a.add_argument("--cover", help="封面图路径或 URL（可选）")
    a.add_argument("--id", help="书 id（缺省按标题生成）")
    a.add_argument("--title", help="书名")
    a.add_argument("--author", help="作者")
    a.add_argument("--translator", help="译者")
    a.add_argument("--publisher", help="出版社")
    a.add_argument("--year", help="出版年")
    a.add_argument("--category", help="分类")
    a.add_argument("--tags", help="标签，分号分隔")
    a.add_argument("--status", help="wish/reading/done")
    a.add_argument("--progress", help="0-100")
    a.add_argument("--rating", help="0-5")
    a.add_argument("--started", help="开始日期")
    a.add_argument("--finished", help="读完日期")
    a.add_argument("--summary", help="一句话简介")
    a.add_argument("--notes-text", help="笔记（换行用 \\n）")
    a.add_argument("--quotes", help="摘句，分号分隔")
    a.add_argument("--link", help="外链（豆瓣等）")
    a.add_argument("--commit", action="store_true", help="自动 git commit")
    sub.add_parser("sync", help="重生 books.js")
    args = p.parse_args()
    if args.cmd == "convert":
        cmd_convert(args)
    elif args.cmd == "add":
        cmd_add(args)
    elif args.cmd == "sync":
        cmd_sync(args)
    else:
        p.print_help()


if __name__ == "__main__":
    main()
