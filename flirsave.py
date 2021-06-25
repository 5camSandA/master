from flirpy.camera.lepton import Lepton
from skimage.io import imsave
import numpy as np

camera = Lepton()
#image = camera.grab().astype(np.float32)
image1 = camera.grab().astype(np.float32)
#image2 = camera.grab().astype(np.uint32)
#image3 = camera.grab().astype(np.uint32)

'''print(image[0][0], image[0][0].astype(np.uint8))
print(image1[0][0], image1[0][0].astype(np.uint8))
print(image2[0][0], image2[0][0].astype(np.uint8))
print(image3[0][0], image3[0][0].astype(np.uint8))'''

#print("major version:", camera.major_version)
#print("minor version:", camera.minor_version)
#print("uptime in ms:", camera.uptime_ms)
#print("status:", camera.status)
#print("revision:", camera.revision)
#print("frame count:", camera.frame_count)
#print("frame mean:", camera.frame_mean)
#print("fpa temp:", camera.fpa_temp_k)
#print("ffc temp:", camera.ffc_temp_k)
#print("ffc elapsed:", camera.ffc_elapsed_ms)
#print("agc roi:", camera.agc_roi)
#print(camera.clip_high)
#print(camera.clip_low)
#print(camera.video_format)

camera.close()

#print(image.min())
#print(image.max())

#img = 255*(<value-min_value>/<value_range>)
#image = 200*(image-image.min())/(image.max()-image.min())
image1 = 256*(image1-image1.min())/(image1.max()-image1.min())
#image2 = 200*(image2-image2.min())/(image2.max()-image2.min()) 
#image3 = 400*(image3-image3.min())/(image3.max()-image3.min())
'''print(image[0][0], image.min(), image.max())
print(image1[0][0], image1.min(), image1.max())
print(image2[0][0], image2.min(), image2.max())
print(image3[0][0], image3.min(), image3.max())'''

#print((image-image.min())/(image.max()-image.min()))

#imsave("irtest.jpg", image.astype(np.uint8))
imsave("irtest1.jpg", image1.astype(np.uint8))
#imsave("irtest2.jpg", image2.astype(np.uint8))
#imsave("irtest3.jpg", image3.astype(np.uint8))

camera.close()

