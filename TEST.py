import RPi.GPIO as gp
import os

gp.setwarnings(False)
gp.setmode(gp.BOARD)

gp.setup(7, gp.OUT)
gp.setup(11, gp.OUT)
gp.setup(12, gp.OUT)
gp.setup(15, gp.OUT)

gp.setup(21, gp.OUT)
gp.setup(18, gp.OUT)
gp.setup(19, gp.OUT)
gp.setup(8, gp.OUT)
gp.setup(10, gp.OUT)

gp.output(11, True)
gp.output(12, True)
gp.output(15, True)

gp.output(21, False)
gp.output(18, False)
gp.output(19, False)
gp.output(8, False)
gp.output(10, False)

def main():
    
    gp.output(21, True)
    gp.output(18, False)
    gp.output(19, False)
    gp.output(8, False)
    gp.output(10, False)
    gp.output(7, False)
    gp.output(11, False)
    gp.output(12, True)
    gp.output(15, True)
    capture(1)

    gp.output(21, False)
    gp.output(18, True)
    gp.output(19, False)
    gp.output(8, False)
    gp.output(10, False)
    gp.output(7, True)
    gp.output(11, False)
    gp.output(12, True)
    gp.output(15, True)
    capture(2)

    gp.output(21, False)
    gp.output(18, False)
    gp.output(19, True)
    gp.output(8, False)
    gp.output(10, False)
    gp.output(7, False)
    gp.output(11, True)
    gp.output(12, False)
    gp.output(15, True)
    capture(3)

    gp.output(21, False)
    gp.output(18, False)
    gp.output(19, False)
    gp.output(8, True)
    gp.output(10, False)
    gp.output(7, True)
    gp.output(11, True)
    gp.output(12, False)
    gp.output(15, True)
    capture(4)

    gp.output(21, False)
    gp.output(18, False)
    gp.output(19, False)
    gp.output(8, False)
    gp.output(10, True)
    gp.output(7, False)
    gp.output(11, True)
    gp.output(12, True)
    gp.output(15, False)
    capture(5)

def capture(cam):
    cmd = "raspistill -o capture_%d.jpg" % cam
    os.system(cmd)

if __name__ == "__main__":
    main()

    gp.output(11, True)
    gp.output(12, True)
    gp.output(15, True)
    gp.output(21, False)
    gp.output(18, False)
    gp.output(19, False)
    gp.output(8, False)
    gp.output(10, False)
