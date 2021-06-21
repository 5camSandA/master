import serial
import time
import picamera
import numpy as np
import struct
from skimage.io import imsave
#from skimage import imsave
import os

import argparse
parser = argparse.ArgumentParser()
parser.add_argument("width", type=int, help="the width")
parser.add_argument("height", type=int, help="the height")

args = parser.parse_args()

stream = open('image.data', 'w+b')

Y = np.array([])
U = np.array([])
V = np.array([])

ImageNumber = 0
ImageCounterFileName = "ImageCount.txt"

jpg = np.array([])

# fine the image number this is
try:
    fileIC = open(ImageCounterFileName, 'r')
    ImageNumber = int(fileIC.readline())
    fileIC.close()
    ImageNumber += 1
    fileIC = open(ImageCounterFileName, 'w')
    fileIC.write(str(ImageNumber))
    fileIC.close()
except IOError:
    fileIC = open(ImageCounterFileName, 'w')
    fileIC.write(str(ImageNumber))
    fileIC.close()


# Capture the image in YUV format
with picamera.PiCamera() as camera:
    camera.resolution = (args.width, args.height)
    camera.capture(stream, 'yuv')

# Rewind the stream for reading
stream.seek(0)

# Calculate the actual image size in the stream (accounting for rounding
# of the resolution)
fwidth = (args.width + 31) // 32 * 32
fheight = (args.height + 15) // 16 * 16

# Load the Y (luminance) data from the stream
Y = np.fromfile(stream, dtype=np.uint8, count=fwidth*fheight).\
        reshape((fheight, fwidth))
# Load the UV (chrominance) data from the stream, and double its size
U = np.fromfile(stream, dtype=np.uint8, count=(fwidth//2)*(fheight//2)).\
        reshape((fheight//2, fwidth//2)).\
        repeat(2, axis=0).repeat(2, axis=1)
V = np.fromfile(stream, dtype=np.uint8, count=(fwidth//2)*(fheight//2)).\
        reshape((fheight//2, fwidth//2)).\
        repeat(2, axis=0).repeat(2, axis=1)

imsave(str(ImageNumber)+"_Y.jpg", Y)
imsave(str(ImageNumber)+"_U.jpg", U)
imsave(str(ImageNumber)+"_V.jpg", V)

print(str(ImageNumber))

size = os.path.getsize(str(ImageNumber)+"_Y.jpg")
jpg = np.fromfile(str(ImageNumber)+"_Y.jpg", dtype=np.uint8, count=size)
print ("Y.jpg = " + str(jpg.size))

size = os.path.getsize(str(ImageNumber)+"_U.jpg")
jpg = np.fromfile(str(ImageNumber)+"_U.jpg", dtype=np.uint8, count=size)
print ("U.jpg = " + str(jpg.size))

size = os.path.getsize(str(ImageNumber)+"_V.jpg")
jpg = np.fromfile(str(ImageNumber)+"_V.jpg", dtype=np.uint8, count=size)
print ("V.jpg = " + str(jpg.size))
