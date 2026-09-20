#!/usr/bin/env python3
"""生成 PWA 图标（icons/icon-192.png / icon-512.png / icon-maskable-512.png）。

为什么自己画：
    仓库里没有任何图标资源（无 png / svg / ico），而项目是**纯前端、无构建步骤**
    的静态站点，不能引入 PIL / cairosvg / sharp 之类的依赖。所以这里只用标准库：
    自己光栅化 + 自己写 PNG（zlib + struct），保证任何人 `python tools/generate-icons.py`
    都能复现出**逐字节相同**的图标（同样的输入 → 同样的输出，无随机数）。

画的是什么：
    圆角方块底（品牌强调色 --accent → --accent-deep 竖向渐变）+ 白色铃铛。
    铃铛 = 通知/呼叫，和产品的「呼叫 + 回执」语义一致，也在 CONFIG.buttons.availableIcons 里。
    颜色取自 index.css 的 :root 令牌（不在这里复制第二份色值之外的东西）。

用法：
    python tools/generate-icons.py          # 写到仓库 icons/ 目录
"""

import os
import struct
import zlib

# ── 令牌色（与 index.css :root 一致） ───────────────────────────────────────
ACCENT_TOP = (0x33, 0x7E, 0xA9)  # --accent      #337ea9
ACCENT_BOTTOM = (0x2A, 0x6A, 0x8D)  # --accent-deep #2a6a8d
GLYPH = (0xFF, 0xFF, 0xFF)

SS = 4  # 超采样倍数（每像素 SS×SS 次采样 → 抗锯齿）

# ── 形状：全部用「单位坐标」（0..1，相对画布边长），便于任意尺寸复用 ──────────


def circle(cx, cy, r):
    r2 = r * r

    def test(x, y):
        dx = x - cx
        dy = y - cy
        return dx * dx + dy * dy <= r2

    return test


def trapezoid(cx, top, bottom, half_top, half_bottom):
    """上窄下宽的梯形（铃铛外扩的裙摆）。"""

    def test(x, y):
        if y < top or y > bottom:
            return False
        t = (y - top) / (bottom - top)
        half = half_top + (half_bottom - half_top) * t
        return abs(x - cx) <= half

    return test


def rounded_rect(left, top, right, bottom, r):
    def test(x, y):
        if x < left or x > right or y < top or y > bottom:
            return False
        # 找出离角落圆心的偏移：只有落在四个角圆外时才可能被剔除
        cx = min(max(x, left + r), right - r)
        cy = min(max(y, top + r), bottom - r)
        dx = x - cx
        dy = y - cy
        return dx * dx + dy * dy <= r * r

    return test


def bell_shapes(scale=1.0, pad=0.0):
    """铃铛剪影（若干个形状的并集）。scale/pad 用于 maskable 图标的安全区收缩。"""

    def place(cx, cy):
        # 以画布中心为锚点缩放
        return 0.5 + (cx - 0.5) * scale, 0.5 + (cy - 0.5) * scale

    def dot(cx, cy, r):
        ncx, ncy = place(cx, cy)
        return circle(ncx, ncy, r * scale)

    dome_c = place(0.5, 0.42)
    clapper_c = place(0.5, 0.845)
    # 裙摆 / 底沿按 pad（maskable 时向内收）另行收缩
    flare_top = 0.42 + (0.5 - 0.42) * (1 - scale) + pad
    flare_bottom = 0.70 - (0.70 - 0.5) * (1 - scale) - pad
    rim_top = 0.675 - (0.675 - 0.5) * (1 - scale) - pad
    rim_bottom = 0.755 - (0.755 - 0.5) * (1 - scale) - pad
    rim_half = 0.325 * scale

    return [
        dot(0.5, 0.215, 0.052),  # 顶部小钮
        circle(dome_c[0], dome_c[1], 0.20 * scale),  # 钟体上半
        trapezoid(0.5, flare_top, flare_bottom, 0.20 * scale, 0.30 * scale),  # 裙摆
        rounded_rect(
            0.5 - rim_half, rim_top, 0.5 + rim_half, rim_bottom, 0.028 * scale
        ),  # 底沿
        circle(clapper_c[0], clapper_c[1], 0.055 * scale),  # 铃舌
    ]


# ── 光栅化 ──────────────────────────────────────────────────────────────────


def coverage(shapes, x, y, inv):
    """返回 (x, y) 处被 shapes 覆盖的比例（0..1）。x/y 为像素中心坐标。"""
    hits = 0
    step = 1.0 / SS
    for j in range(SS):
        sy = (y + (j + 0.5) * step) * inv
        for i in range(SS):
            sx = (x + (i + 0.5) * step) * inv
            for s in shapes:
                if s(sx, sy):
                    hits += 1
                    break
    return hits / (SS * SS)


def render(size, maskable=False):
    """返回 RGBA 像素的 bytearray。"""
    corner = 0.0 if maskable else 0.22
    bg = rounded_rect(0.0, 0.0, 1.0, 1.0, corner)
    fg = bell_shapes(scale=0.62, pad=0.02) if maskable else bell_shapes()
    bg_shape = [bg]
    inv = 1.0 / size
    buf = bytearray(size * size * 4)
    i = 0
    for y in range(size):
        for x in range(size):
            a_bg = coverage(bg_shape, x, y, inv)
            if a_bg > 0:
                t = y * inv
                r = ACCENT_TOP[0] + (ACCENT_BOTTOM[0] - ACCENT_TOP[0]) * t
                g = ACCENT_TOP[1] + (ACCENT_BOTTOM[1] - ACCENT_TOP[1]) * t
                b = ACCENT_TOP[2] + (ACCENT_BOTTOM[2] - ACCENT_TOP[2]) * t
                a_fg = coverage(fg, x, y, inv)
                # 白铃铛合成到底色上（源覆盖混合）
                rr = r + (GLYPH[0] - r) * a_fg
                gg = g + (GLYPH[1] - g) * a_fg
                bb = b + (GLYPH[2] - b) * a_fg
                a = a_bg
            else:
                rr = gg = bb = a = 0.0
            buf[i] = int(rr + 0.5)
            buf[i + 1] = int(gg + 0.5)
            buf[i + 2] = int(bb + 0.5)
            buf[i + 3] = int(a * 255 + 0.5)
            i += 4
    return buf


def write_png(path, size, pixels):
    stride = size * 4
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0（None）
        raw += pixels[y * stride : (y + 1) * stride]

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    blob = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(blob)
    return len(blob)


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(root, "icons")
    os.makedirs(out_dir, exist_ok=True)
    jobs = [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-maskable-512.png", 512, True),
    ]
    for name, size, maskable in jobs:
        path = os.path.join(out_dir, name)
        n = write_png(path, size, render(size, maskable))
        print(f"{name:24s} {size}x{size}  {n} bytes")


if __name__ == "__main__":
    main()
