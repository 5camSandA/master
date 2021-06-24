import cv2
from flirpy.camera.lepton import Lepton
import numpy as np

with Lepton() as camera:
	while True:
		img = camera.grab().astype(np.float32)

		img = 255*(img - img.min())/(img.max()-img.min())

		cv2.imshow('Lepton', img.astype(np.uint8))
		if cv2.waitKey(1) ==27:
			break

cv2.destroyAllWindows()
