# Image downloader script

This script downloads an image from a Camera device.

# Basic mechanism

## Camera device

Camera devices runs a firmware module (´pseudoserial.c`) that pipes `d.bout` serial data to the serial port. Anything it receives on the serial port is sent as `s.bin`.

The serial port is attached to a Raspberry Pi SBC with a camera.

By sending commands to the SBC via the `d.bout` variable and checking the `s.bin` response, the calling script can interact directly with the camera SBC and aquire images.

## Camera SBC

To enable the Camera SBC, the Camera device must first enable the 5V power supply by setting `d.ee5v` to `1`. If 0 or not existing, the power supply is turned off.

