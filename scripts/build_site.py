#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""抽抽乐网站构建脚本：config(照片目录) -> 可直接部署的 dist/

用法示例：
  # 单目录里同时有 card01.jpg / back01.jpg ...
  python build_site.py --config config.json --orientation portrait --cards-dir ./mycards --out dist

  # 卡面、卡背分两个目录（按文件名里的数字配对，如 卡面1 <-> 卡背1）
  python build_site.py --config config.json --orientation portrait --faces-dir <卡面目录> --backs-dir <卡背目录> --out dist

  # 没有 config 也能先跑出占位站点（卡名=未命名 NN，仅用于验证）
  python build_site.py --orientation portrait --faces-dir ./faces --backs-dir ./backs --out dist

依赖：
  优先用 Pillow 做 WebP 转换 + 缩略图 + EXIF 方向修正 + 比例裁切；
  若环境无 Pillow，自动降级为「原图复制、缩略图=原图」，站点仍可正常运行。
"""
import argparse, json, os, re, shutil, sys
from pathlib import Path

TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "assets" / "template"

try:
    from PIL import Image, ImageOps
    HAVE_PIL = True
except Exception:
    HAVE_PIL = False


def slug(s):
    return re.sub(r"\W+", "", s or "GACHA")


def collect(dir_path):
    """收集一个目录里的图片，按文件名中的数字序号排序，返回 [(num, path)]"""
    out = []
    for p in sorted(Path(dir_path).glob("*")):
        if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"):
            m = re.search(r"(\d+)", p.stem)
            num = int(m.group(1)) if m else len(out) + 1
            out.append((num, p))
    return sorted(out, key=lambda x: x[0])


def target_aspect(orientation):
    """返回目标宽高比；竖屏/混合统一按竖屏 2:3，横屏按 3:2"""
    if orientation == "landscape":
        return 3 / 2
    return 2 / 3  # portrait / mixed


def crop_to_aspect(im, aspect):
    """居中裁切到目标宽高比，返回新 Image"""
    w, h = im.size
    if h == 0:
        return im
    current = w / h
    if abs(current - aspect) < 0.01:
        return im
    if current > aspect:
        new_w = int(round(h * aspect))
        left = (w - new_w) // 2
        return im.crop((left, 0, left + new_w, h))
    else:
        new_h = int(round(w / aspect))
        top = (h - new_h) // 2
        return im.crop((0, top, w, top + new_h))


def crop_warning_message(current, target, orientation, tag):
    """判断是否需要给出裁切告警，返回 str 或 None"""
    if orientation == "mixed" and current > 1.0:
        return f"{tag} 是横屏图，但「混合」模式会强制裁成竖屏，可能切掉大量画面，建议换竖屏照上传"
    if orientation in ("portrait", "landscape"):
        dev = abs(current - target) / target
        if dev > 0.3:
            return f"{tag} 比例与目标 {orientation}（约 {target:.2f}）差距大，center-crop 可能切头/切脸，请检查 crop_preview.png"
    return None


def process_image(src, dst_webp, dst_thumb, aspect=2 / 3, orientation="portrait", warn_tag=""):
    """转 WebP + 缩略图 + 修 EXIF + 按目标比例裁切；无 Pillow 时降级复制。返回实际 ext 与 thumb 是否存在"""
    if HAVE_PIL:
        im = Image.open(src)
        im = ImageOps.exif_transpose(im)  # 修手机横拍方向
        w, h = im.size
        msg = crop_warning_message(w / h if h else 1, aspect, orientation, warn_tag) if aspect else None
        if msg:
            print("⚠️ " + msg)
        if aspect:
            im = crop_to_aspect(im, aspect)
        im.save(dst_webp, "WEBP", quality=85)
        th = im.copy()
        th.thumbnail((320, 440))
        th.save(dst_thumb, "WEBP", quality=82)
        return "webp", True
    # 降级：保持原格式复制
    shutil.copy(src, dst_webp.with_suffix(src.suffix))
    shutil.copy(src, dst_thumb.with_suffix(src.suffix))
    if aspect and warn_tag:
        print("⚠️ 环境无 Pillow，无法裁切 %s，请自行保证照片方向一致" % warn_tag)
    return src.suffix.lstrip("."), False


def make_vouchers(site_name):
    base = (slug(site_name).upper() or "GACHA")
    vs = [{"code": "%s%02d" % (base, i + 1), "points": 500} for i in range(10)]
    vs.append({"code": "%sWANFEN" % base, "points": 10000})  # 万分码
    return vs


def contact_sheet(items, out_path, cell_w=220, cell_h=300):
    """把 [(num, path)] 拼成一张总览图，方便肉眼核对"""
    if not HAVE_PIL or not items:
        return None
    cols = min(8, len(items)) or 1
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell_w, rows * cell_h), (240, 240, 240))
    for i, (_, p) in enumerate(items):
        try:
            im = Image.open(p)
            im = ImageOps.exif_transpose(im).convert("RGB")
            im.thumbnail((cell_w, cell_h))
            x = (i % cols) * cell_w + (cell_w - im.width) // 2
            y = (i // cols) * cell_h + (cell_h - im.height) // 2
            sheet.paste(im, (x, y))
        except Exception:
            pass
    sheet.save(out_path)
    return out_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", help="config.json 路径（含 siteName/tiers/names/override/orientation 等）")
    ap.add_argument("--cards-dir", help="含 cardNN.* 与 backNN.* 的单目录")
    ap.add_argument("--faces-dir", help="卡面目录（默认按数字配对 backNN）")
    ap.add_argument("--backs-dir", help="卡背目录")
    ap.add_argument("--orientation", choices=["portrait", "landscape", "mixed"], help="照片方向：竖屏 2:3 / 横屏 3:2 / 混合强制竖屏（默认从 config 取，否则 portrait）")
    ap.add_argument("--out", default="dist", help="输出目录（默认 dist）")
    args = ap.parse_args()

    cfg = {}
    if args.config:
        cfg = json.loads(Path(args.config).read_text(encoding="utf-8"))

    orientation = (args.orientation or cfg.get("orientation") or "portrait").lower()
    aspect = target_aspect(orientation)

    # 确定卡面/卡背来源
    if args.cards_dir:
        faces = collect(args.cards_dir)
        backs = collect(args.cards_dir)
        # 在单目录里，card.* 为卡面，back.* 为卡背
        faces = [(n, p) for n, p in faces if not re.match(r"(?i)back", p.stem)]
        backs = [(n, p) for n, p in backs if re.match(r"(?i)back", p.stem)]
    else:
        if not (args.faces_dir and args.backs_dir):
            print("错误：需提供 --cards-dir，或同时提供 --faces-dir 与 --backs-dir")
            sys.exit(2)
        faces = collect(args.faces_dir)
        backs = collect(args.backs_dir)

    n = min(len(faces), len(backs))
    if len(faces) != len(backs):
        print("⚠️ 卡面 %d 张、卡背 %d 张，按较小值 %d 配对" % (len(faces), len(backs), n))
    faces = faces[:n]
    backs = backs[:n]

    out = Path(args.out)
    (out / "assets" / "cards").mkdir(parents=True, exist_ok=True)

    # 卡名：config.names（按序号）、override(旧->新)
    names = cfg.get("names") or []
    override = cfg.get("override") or {}

    cards = []
    for i, ((fn, fp), (bn, bp)) in enumerate(zip(faces, backs)):
        idx = i + 1
        wf = out / "assets" / "cards" / ("card%02d" % idx)
        wb = out / "assets" / "cards" / ("back%02d" % idx)
        tf = out / "assets" / "cards" / ("card%02d_t" % idx)
        tb = out / "assets" / "cards" / ("back%02d_t" % idx)
        ext_f, _ = process_image(fp, wf.with_suffix(".webp"), tf.with_suffix(".webp"), aspect, orientation, "卡面%02d" % idx)
        ext_b, _ = process_image(bp, wb.with_suffix(".webp"), tb.with_suffix(".webp"), aspect, orientation, "卡背%02d" % idx)
        if ext_f != "webp":
            wf = wf.with_suffix("." + ext_f)
            tf = tf.with_suffix("." + ext_f)
        if ext_b != "webp":
            wb = wb.with_suffix("." + ext_b)
            tb = tb.with_suffix("." + ext_b)
        name = names[i] if i < len(names) else ("未命名 %02d" % idx)
        name = override.get(name, name)  # 应用旧名->新名覆盖
        # 稀有度：若 config.cards 给了 tier 则用之，否则默认 R
        tier = (cfg.get("cards") or [{}])[i].get("tier", "R") if cfg.get("cards") else "R"
        cards.append({
            "id": idx, "name": name, "tier": tier,
            "front": "assets/cards/card%02d.%s" % (idx, ext_f),
            "back": "assets/cards/back%02d.%s" % (idx, ext_b),
            "frontThumb": "assets/cards/card%02d_t.%s" % (idx, ext_f),
            "backThumb": "assets/cards/back%02d_t.%s" % (idx, ext_b),
        })

    # tiers 默认四档
    tiers = cfg.get("tiers") or [
        {"key": "HIDDEN", "name": "隐藏款", "prob": 1.5, "color": "#e0b0ff"},
        {"key": "SSR", "name": "SSR", "prob": 6.5, "color": "#ffd700"},
        {"key": "SR", "name": "SR", "prob": 20, "color": "#9b8cff"},
        {"key": "R", "name": "R", "prob": 72, "color": "#b0a8c0"},
    ]
    vouchers = cfg.get("vouchers") or make_vouchers(cfg.get("siteName", "GACHA"))

    config_obj = {
        "siteName": cfg.get("siteName", "抽抽乐"),
        "subtitle": cfg.get("subtitle", "遇见下一张卡"),
        "theme": cfg.get("theme", {
            "bg": "#f8f0fb", "surface": "#ffffff", "primary": "#8b5cf6",
            "accent": "#d4af37", "text": "#3a2d4d",
        }),
        "initialCoins": cfg.get("initialCoins", 300),
        "drawCost": cfg.get("drawCost", {"single": 10, "ten": 90}),
        "pityLimit": cfg.get("pityLimit", 50),
        "tiers": tiers,
        "vouchers": vouchers,
        "cards": cards,
    }
    (out / "config.js").write_text(
        "window.GACHA_CONFIG = " + json.dumps(config_obj, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )

    # 复制模板三件套 + favicon
    for f in ("index.html", "styles.css", "app.js", "favicon.svg"):
        shutil.copy(TEMPLATE_DIR / f, out / f)

    # 卡面裁剪预览总览图（给用户核对有没有切头）
    cp = contact_sheet(faces, out / "crop_preview.png")
    if cp:
        print("裁剪预览已生成：", cp)

    # 卡背总览图（便于按卡背逐张命名/核对）
    cs = contact_sheet(backs, out / "cardback_contact_sheet.png")
    if cs:
        print("卡背总览已生成：", cs)

    # 质量门禁 audit
    print("=== 构建校验 ===")
    print("照片方向:", orientation, "(目标比例 %.2f)" % aspect)
    print("卡牌数量:", len(cards))
    provided_names = [c["name"] for c in cards if not c["name"].startswith("未命名")]
    if len(provided_names) == len(cards):
        dup = len(provided_names) - len(set(provided_names))
        print("卡名去重:", "PASS" if dup == 0 else "[注意] 有 %d 个重复名" % dup)
    else:
        print("卡名: 仍有 %d 张用占位名（上线前请按规则命名）" % (len(cards) - len(provided_names)))
    known = {t["key"] for t in tiers}
    bad = {c["tier"] for c in cards if c["tier"] not in known}
    print("稀有度档位:", "PASS" if not bad else "[注意] 出现未定义档位 %s" % bad)
    print("兑换码: %d 普通 + 1 万分（万分码=%s）" % (max(0, len(vouchers) - 1), vouchers[-1]["code"] if vouchers else "-"))
    print("输出目录:", out.resolve())
    print("[OK] 构建完成。用 workbuddy_cloudstudio_deploy 部署该目录即可得到分享链接。")


if __name__ == "__main__":
    main()
