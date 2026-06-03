#!/usr/bin/env python3
"""
Gerador de ícones PWA para o Finlu
Gera ícones PNG nos tamanhos necessários para iOS e Android
"""
import struct
import zlib
import math
import os

def create_png(width, height, pixels_rgba):
    """Cria um PNG puro em Python (sem dependências externas)"""
    def png_chunk(chunk_type, data):
        c = chunk_type + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    # IHDR
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    ihdr = png_chunk(b'IHDR', ihdr_data)

    # IDAT
    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'
        for x in range(width):
            r, g, b = pixels_rgba[y * width + x]
            raw_data += bytes([r, g, b])
    compressed = zlib.compress(raw_data, 9)
    idat = png_chunk(b'IDAT', compressed)

    # IEND
    iend = png_chunk(b'IEND', b'')

    return b'\x89PNG\r\n\x1a\n' + ihdr + idat + iend


def lerp(a, b, t):
    return a + (b - a) * t

def render_icon(size):
    """Renderiza o ícone Finlu num grid de pixels"""
    pixels = []
    cx, cy = size / 2, size / 2
    r = size / 2

    for y in range(size):
        for x in range(size):
            fx, fy = x + 0.5, y + 0.5

            # Coordenadas normalizadas
            nx = (fx - cx) / r
            ny = (fy - cy) / r

            # Distância do centro
            dist = math.sqrt(nx*nx + ny*ny)

            # Rounded rectangle mask (raio de canto = 22.5% do tamanho)
            corner = 0.225
            def sdf_rrect(px, py, w, h, rc):
                qx = abs(px) - w + rc
                qy = abs(py) - h + rc
                return math.sqrt(max(qx,0)**2 + max(qy,0)**2) - rc

            d = sdf_rrect(nx, ny, 1.0, 1.0, corner)
            if d > 0.04:
                pixels.append((0, 0, 0))
                continue

            # Fundo: gradiente azul escuro 
            # #1E40AF -> #1E3A8A (top -> bottom)
            t_bg = fy / size
            bg_r = int(lerp(0x1E, 0x1E, t_bg))
            bg_g = int(lerp(0x40, 0x3A, t_bg))
            bg_b = int(lerp(0xAF, 0x8A, t_bg))

            # Checkmark: M 0.22,0.55 L 0.45,0.75 L 0.78,0.28
            # Verificar se o pixel está na linha do checkmark
            def point_on_segment(px, py, ax, ay, bx, by, thickness):
                dx = bx - ax; dy = by - ay
                lensq = dx*dx + dy*dy
                if lensq < 1e-10: return False
                t = max(0, min(1, ((px-ax)*dx + (py-ay)*dy) / lensq))
                nearx = ax + t*dx; neary = ay + t*dy
                return math.sqrt((px-nearx)**2 + (py-neary)**2) < thickness

            # Coordenadas do checkmark em espaço 0..1
            px_n = fx / size
            py_n = fy / size
            th = 0.055  # espessura

            on_check1 = point_on_segment(px_n, py_n, 0.22, 0.55, 0.42, 0.74, th)
            on_check2 = point_on_segment(px_n, py_n, 0.42, 0.74, 0.78, 0.30, th)

            if on_check1 or on_check2:
                # Verde #10B981
                pixels.append((0x10, 0xB9, 0x81))
            else:
                # Círculo branco (moeda) no centro-topo
                coin_cx, coin_cy, coin_r = 0.5, 0.36, 0.18
                coin_d = math.sqrt((px_n - coin_cx)**2 + (py_n - coin_cy)**2)
                if coin_d < coin_r and coin_d > coin_r - 0.04:
                    pixels.append((255, 255, 255))
                elif coin_d < coin_r - 0.04:
                    # Interior da moeda — símbolo $
                    rel_x = (px_n - coin_cx) / (coin_r * 0.5)
                    rel_y = (py_n - coin_cy) / (coin_r * 0.5)
                    on_vline = abs(rel_x) < 0.18 and abs(rel_y) < 0.7
                    if on_vline:
                        pixels.append((255, 255, 255))
                    else:
                        # Fundo interior da moeda = azul um pouco mais claro
                        pixels.append((0x1E, 0x50, 0xC0))
                else:
                    pixels.append((bg_r, bg_g, bg_b))

    return pixels


def generate_icons():
    sizes = [120, 152, 180, 192, 512]
    os.makedirs('icons', exist_ok=True)

    for size in sizes:
        print(f'  Gerando icon-{size}.png...')
        pixels = render_icon(size)
        png_data = create_png(size, size, pixels)
        with open(f'icons/icon-{size}.png', 'wb') as f:
            f.write(png_data)
        print(f'  ✓ icon-{size}.png ({len(png_data):,} bytes)')

    print('\n✓ Todos os ícones gerados com sucesso!')


if __name__ == '__main__':
    generate_icons()
