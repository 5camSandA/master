import RPi.GPIO as gp
import os
import sys
from cam_conf import Camera

'''set GPIO's for multiplex interface'''
gp.setwarnings(False)
gp.setmode(gp.BOARD)

gp.setup(7, gp.OUT)
gp.setup(11, gp.OUT)
gp.setup(12, gp.OUT)

gp.output(11, True)
gp.output(12, True)

'''Varibles for i2cset'''

def main():
	'''Process to take pictures with selected cameras'''
	#print(sys.argv[1])
	c = Camera(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
	c.capture()

if __name__ == "__main__":
	main()
