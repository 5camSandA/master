#!/bin/bash

args=("$@")
width=${args[0]}
height=${args[1]}
dir=${args[2]}
name=$(date +'%d%m%Y%T')

env MPLBACKEND=Agg python3 cam_select.py $width $height $dir $name
