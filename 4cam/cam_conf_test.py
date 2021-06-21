import RPi.GPIO as gp
import os
import sys

class Camera:
	def __init__(self, asp1, asp2, cam):
		self.width = int(asp1)
		self.height = int(asp2)

		self.res_check()

		self.cam = cam

		self.set = ['e','s','w','d','a']

		self.i2c = [['0x04',False,False,True], ['0x05',True,False,True], ['0x06',False,True,False], ['0x07',True,True,False]]

		self.init_GPIO()

	def res_check(self):
		if self.width < 256 or self.width > 1080:
			raise ValueError("Resolution width outside parameters")
		if self.height < 256 or self.height > 1080:
			raise ValueError("Resolution height outside parameters")

	def init_GPIO(self):
		gp.setwarnings(False)
		gp.setmode(gp.BOARD)

		gp.setup(7, gp.OUT)
		gp.setup(11, gp.OUT)
		gp.setup(12, gp.OUT)

		gp.output(11, True)
		gp.output(12, True)


	def capture(self):
		if self.cam not in self.set:
			print("invalid camera choice")
		else:
			idx = self.set.index(self.cam)
			#print(idx) #debug test print
			if idx == 4:
				'''all has been selected. Iterate all cameras'''
				for i in range(4):
					i2c = f"i2cset -y 1 0x70 0x00 {self.i2c[i][0]}"
					os.system(i2c)
					gp.output(7, self.i2c[i][1])
					gp.output(11, self.i2c[i][2])
					gp.output(12, self.i2c[i][3])
					cmd = f"raspistill -o test_{self.set[i]}.jpg"
					os.system(cmd)
			else:
				i2c = f"i2cset -y 1 0x70 0x00 {self.i2c[idx][0]}"
				os.system(i2c)
				gp.output(7, self.i2c[idx][1])
				gp.output(11, self.i2c[idx][2])
				gp.output(12, self.i2c[idx][3])
				cmd = f"raspistill -o test_{self.cam}.jpg"
				os.system(cmd)
