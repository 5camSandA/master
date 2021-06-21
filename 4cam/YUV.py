import numpy as np
from picamera import PiCamera as camera
import time
from skimage.io import imsave

class YUV_Snapshot:
	def __init__(self, asp1, asp2, name, dir):
		self.width = asp1
		self.height = asp2
		self.name = name
		self.dir = dir

		self.cam = camera()
		self.cam_init()

	def cam_init(self):
		self.cam.resolution = (self.width, self.height)

	def set_dir(self, dir):
		self.dir = dir

	def snap(self):
		stream = open('image.data', 'w+b')
		self.cam.start_preview()
		time.sleep(2)
		self.cam.capture(stream, 'yuv')

		stream.seek(0)

		fwidth = (self.width + 31) // 32 * 32
		fheight = (self.height + 15) // 16 * 16

		Y = np.fromfile(stream, dtype=np.uint8, count=fwidth*fheight).reshape((fheight, fwidth))
		U = np.fromfile(stream, dtype=np.uint8, count=(fwidth//2)*(fheight//2)).reshape((fheight//2, fwidth//2)).repeat(2, axis=0).repeat(2, axis=1)
		V = np.fromfile(stream, dtype=np.uint8, count=(fwidth//2)*(fheight//2)).reshape((fheight//2, fwidth//2)).repeat(2, axis=0).repeat(2, axis=1)

		a = self.dir

		imsave(self.name+"_"+a+"_Y.jpg", Y)
		imsave(self.name+"_"+a+"_U.jpg", U)
		imsave(self.name+"_"+a+"_V.jpg", V)

