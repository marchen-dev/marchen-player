"""独立 HLG 参考：Colour 的 BT.2100 EOTF 和色域转换，输出线性 GBR 供 FFmpeg tone-map。"""
import sys
import warnings
warnings.filterwarnings('ignore', message='.*related API features.*')
import colour
import numpy as np

source, destination, width, height = sys.argv[1:5]
width, height = int(width), int(height)
bits = int(sys.argv[5]) if len(sys.argv) > 5 else 10
full = len(sys.argv) > 6 and sys.argv[6] == 'full'
values = np.fromfile(source, dtype='<u2' if bits == 10 else 'u1')
size = width * height
Y = values[:size].reshape(height, width)
Cb = values[size:size + size // 4].reshape(height // 2, width // 2).repeat(2, axis=0).repeat(2, axis=1)
Cr = values[size + size // 4:].reshape(height // 2, width // 2).repeat(2, axis=0).repeat(2, axis=1)
signal = colour.YCbCr_to_RGB(np.stack([Y, Cb, Cr], axis=-1), K=colour.models.WEIGHTS_YCBCR['ITU-R BT.2020'], in_bits=bits, in_int=True, in_legal=not full)
linear = colour.models.eotf_BT2100_HLG(np.maximum(signal, 0), L_B=0, L_W=1000, gamma=1.2) / 100
linear = colour.RGB_to_RGB(linear, 'ITU-R BT.2020', 'ITU-R BT.709')
np.stack([linear[:,:,1], linear[:,:,2], linear[:,:,0]]).astype('<f4').tofile(destination)
